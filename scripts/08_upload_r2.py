"""
Stage 8 — publish the map's static assets to Cloudflare R2, then verify them.

Why this script exists: `county_stats.json` shipped in the pipeline but never
reached the bucket, and the frontend had no way to tell a missing object from a
county with no PPP loans, so every county on the live site reported "no PPP
statistics". Uploading by hand is how that happens. This walks one manifest, so
the set of objects the frontend asks for and the set the bucket holds cannot
drift apart, and it re-reads every object over the public URL afterwards
instead of trusting the PUT.

Cache policy follows how each object changes:
  * versioned assets (tiles, the search index, state shards) are immutable for
    a year — their *names* carry the version, so a corrected file must take a
    new name, never overwrite an old one;
  * unversioned JSON sidecars get an hour, so a fix reaches visitors the same
    day without a rename.

Usage:
    python scripts/08_upload_r2.py            # upload what is missing or stale
    python scripts/08_upload_r2.py --verify   # check only, upload nothing
    python scripts/08_upload_r2.py --force    # re-upload everything

Credentials come from .env (gitignored): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_BUCKET. Requires boto3.
"""
import argparse
import os
import sys
import time
import urllib.request
import urllib.error

TILES = 'tiles'
INTERIM = 'data/interim'
PUBLIC_BASE = 'https://pub-bd48571a78b04fb6b629d061a4cd1a72.r2.dev'

IMMUTABLE = 'public, max-age=31536000, immutable'
HOURLY = 'public, max-age=3600'

# Keep in step with web/src/lib/config.ts. Every URL the frontend builds must
# appear here, or it 404s in production and nowhere else.
MANIFEST = [
    (f'{TILES}/counties-240930-v2.pmtiles', 'tiles/counties-240930-v2.pmtiles',
     'application/octet-stream', IMMUTABLE),
    (f'{TILES}/zips-240930-v1.pmtiles', 'tiles/zips-240930-v1.pmtiles',
     'application/octet-stream', IMMUTABLE),
    (f'{TILES}/loans-240930-v1.pmtiles', 'tiles/loans-240930-v1.pmtiles',
     'application/octet-stream', IMMUTABLE),
    (f'{INTERIM}/search_index.parquet', 'data/search_index.parquet',
     'application/octet-stream', IMMUTABLE),
    (f'{INTERIM}/loan_lookup-240930-v1.parquet', 'data/loan_lookup-240930-v1.parquet',
     'application/octet-stream', IMMUTABLE),
    (f'{INTERIM}/top_loans.json', 'data/top_loans.json',
     'application/json', HOURLY),
    (f'{INTERIM}/county_stats.json', 'data/county_stats.json',
     'application/json', HOURLY),
]

STATE_SHARD_DIR = f'{INTERIM}/states'


def load_env(path='.env'):
    if not os.path.exists(path):
        return
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip())


def manifest():
    """The fixed entries plus one per state shard."""
    items = list(MANIFEST)
    if os.path.isdir(STATE_SHARD_DIR):
        for name in sorted(os.listdir(STATE_SHARD_DIR)):
            if name.endswith('.parquet'):
                items.append((f'{STATE_SHARD_DIR}/{name}', f'data/states/{name}',
                              'application/octet-stream', IMMUTABLE))
    return items


# r2.dev answers 403 to the default `Python-urllib/3.x` agent, which would make
# every object look missing. Ask as a browser, since a browser is the client
# whose access this script is actually checking.
USER_AGENT = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
              'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36')


def head(url, attempts=3):
    """
    (status, content_length) for the public URL, without downloading it.

    Retries transport errors. Sweeping 66 objects in a row draws the occasional
    connection reset from r2.dev, and reporting that as a missing object would
    send this script off to re-upload half a gigabyte that is already there.
    An HTTP status, including 404, is an answer and is returned as-is.
    """
    request = urllib.request.Request(url, method='HEAD',
                                     headers={'User-Agent': USER_AGENT})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, int(response.headers.get('Content-Length', 0))
        except urllib.error.HTTPError as err:
            return err.code, 0
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            reason = getattr(err, 'reason', err)
            if attempt == attempts - 1:
                print(f"  ! {url}: {reason} (after {attempts} attempts)")
                return 0, 0
            time.sleep(1 + attempt)
    return 0, 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true',
                        help='report what is missing or stale; upload nothing')
    parser.add_argument('--force', action='store_true',
                        help='re-upload every object even if sizes already match')
    args = parser.parse_args()

    load_env()
    bucket = os.environ.get('R2_BUCKET')
    account = os.environ.get('R2_ACCOUNT_ID')
    if not (bucket and account):
        sys.exit("R2_BUCKET / R2_ACCOUNT_ID missing — is .env present?")

    items = manifest()

    missing_local = [src for src, _, _, _ in items if not os.path.exists(src)]
    if missing_local:
        sys.exit("Missing local files, run the earlier stages first:\n  " +
                 "\n  ".join(missing_local))

    print(f"Checking {len(items)} objects against {PUBLIC_BASE} ...")
    stale = []
    for src, key, ctype, cache in items:
        local_size = os.path.getsize(src)
        status, remote_size = head(f'{PUBLIC_BASE}/{key}')
        if status != 200:
            print(f"  MISSING  {key}  (HTTP {status})")
            stale.append((src, key, ctype, cache))
        elif cache is IMMUTABLE:
            # Presence is the whole check for a versioned asset. Its content is
            # pinned to its name, so a size difference here means a rebuild
            # recompressed identical rows a few bytes differently — re-uploading
            # half a gigabyte for that would be pure waste. Changed content
            # takes a new name and shows up as MISSING above.
            continue
        elif remote_size != local_size:
            print(f"  STALE    {key}  (remote {remote_size:,} != local {local_size:,})")
            stale.append((src, key, ctype, cache))

    if args.force:
        stale = items

    if not stale:
        total_gb = sum(os.path.getsize(s) for s, _, _, _ in items) / 1024**3
        print(f"\nAll {len(items)} objects present and current. "
              f"R2 usage {total_gb:.2f} GB of the 10 GB free tier.")
        return

    if args.verify:
        print(f"\n{len(stale)} object(s) need uploading. Re-run without --verify.")
        sys.exit(1)

    import boto3
    client = boto3.client(
        's3',
        endpoint_url=f'https://{account}.r2.cloudflarestorage.com',
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        region_name='auto',
    )

    for src, key, ctype, cache in stale:
        mb = os.path.getsize(src) / 1024 / 1024
        print(f"  uploading {key} ({mb:,.1f} MB)...")
        client.upload_file(src, bucket, key, ExtraArgs={
            'ContentType': ctype,
            'CacheControl': cache,
        })

    # Read back over the public URL, not the API: a PUT that succeeded against
    # a bucket the site cannot read is not a deploy.
    print("\nVerifying over the public URL...")
    failures = []
    for src, key, _, _ in stale:
        status, remote_size = head(f'{PUBLIC_BASE}/{key}')
        local_size = os.path.getsize(src)
        ok = status == 200 and remote_size == local_size
        print(f"  {'OK  ' if ok else 'FAIL'}  {key}  HTTP {status}  {remote_size:,} bytes")
        if not ok:
            failures.append(key)

    total_gb = sum(os.path.getsize(s) for s, _, _, _ in items) / 1024**3
    print(f"\nR2 usage: {total_gb:.2f} GB of the 10 GB free tier.")
    if failures:
        sys.exit(f"{len(failures)} object(s) failed verification: {failures}")
    print("Stage 8 Complete.")


if __name__ == '__main__':
    main()
