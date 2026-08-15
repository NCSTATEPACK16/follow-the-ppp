"""
Stage 7b — shard the loan detail fields into static JSON, one file per
four-digit loan-number prefix.

Why this exists: tapping a pin used to answer with a DuckDB-WASM query against
loan_lookup.parquet. The query itself is cheap — five range requests, ~3.1MB,
about a second — but it can only run once the browser has downloaded a 6.8MB
compressed WebAssembly module and compiled 34MB of engine. On iOS Safari over
cellular that boot is the entire wait, and it was measured at tens of seconds
while MapLibre was competing for the same connection.

A pin tap does not need a SQL engine. It needs one row. These shards let it be
a single `fetch()` of ~80KB with no wasm at all; DuckDB-WASM stays in the build
for name search, where the user has typed and a wait is expected.

Sharding by the first four digits, rather than by state or by a computed hash:
  * loan numbers are 10 digits and remarkably uniform across the key space —
    all 9,000 prefixes are populated, averaging 1,263 rows, worst case 1,584,
    so no shard is hot and none is empty;
  * the client derives the filename from the loan number by slicing a string,
    so there is no index or manifest to fetch first, and no second round trip
    before the one that carries the answer.

Files are written pre-gzipped and uploaded with Content-Encoding: gzip,
because r2.dev serves stored bytes as-is and does not compress on the fly
(measured: county_stats.json comes back at its full 785KB).

Output: data/interim/details-240930-v1/<prefix>.json.gz
Usage:  python scripts/07b_detail_shards.py [--force]
"""

import argparse
import datetime as dt
import gzip
import json
import os
import time

import duckdb

INTERIM = 'data/interim'
SOURCE = f'{INTERIM}/loan_lookup-240930-v1.parquet'
# Versioned directory: these objects are served immutable for a year, so a
# correction must arrive under a new name (see CLAUDE.md, Publishing).
OUT_DIR = f'{INTERIM}/details-240930-v1'
REPORT = 'reports/07b_detail_shards.md'

PREFIX_LEN = 4

# Order matters: values are stored positionally, without repeating the key
# names 11.4 million times. `loan_number` is not in the payload — it is the
# shard name plus the record's own key.
COLUMNS = [
    'borrower_name', 'city', 'state', 'zip', 'naics', 'business_type',
    'jobs_reported', 'date_approved', 'approved_amount', 'forgiven_amount',
    'loan_status', 'originating_lender', 'lat', 'lng', 'geo_precision',
]

BATCH = 100_000


def encode(value):
    """DATE comes back as datetime.date; the frontend wants an ISO string."""
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()[:10]
    return value


def write_shard(prefix, records):
    payload = {'c': COLUMNS, 'r': records}
    raw = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    # mtime=0 so a rebuild of unchanged rows produces an identical file rather
    # than one that differs only by a timestamp.
    with open(f'{OUT_DIR}/{prefix}.json.gz', 'wb') as fh:
        fh.write(gzip.compress(raw, 9, mtime=0))
    return len(raw), os.path.getsize(f'{OUT_DIR}/{prefix}.json.gz')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true',
                        help='rewrite shards that already exist')
    args = parser.parse_args()

    if not os.path.exists(SOURCE):
        raise SystemExit(f"Missing {SOURCE} — run scripts/06_search_index.py first.")

    if os.path.isdir(OUT_DIR) and os.listdir(OUT_DIR) and not args.force:
        print(f"{OUT_DIR} already populated ({len(os.listdir(OUT_DIR))} shards). "
              f"Use --force to rebuild.")
        return
    os.makedirs(OUT_DIR, exist_ok=True)

    con = duckdb.connect()
    started = time.time()

    # One ordered pass, streamed. The file is already sorted by loan_number
    # (scripts/06_search_index.py), so prefixes arrive contiguously and each
    # shard can be flushed the moment the prefix changes — 11.4M rows never
    # have to be resident at once.
    cursor = con.execute(f"""
        SELECT loan_number, {', '.join(COLUMNS)}
        FROM '{SOURCE}'
        ORDER BY loan_number
    """)

    shards = 0
    rows_total = 0
    raw_total = 0
    gz_total = 0
    largest = (None, 0)
    current_prefix = None
    current = {}

    while True:
        batch = cursor.fetchmany(BATCH)
        if not batch:
            break
        for row in batch:
            loan_number = row[0]
            prefix = loan_number[:PREFIX_LEN]
            if prefix != current_prefix:
                if current_prefix is not None:
                    raw, gz = write_shard(current_prefix, current)
                    shards += 1
                    raw_total += raw
                    gz_total += gz
                    if gz > largest[1]:
                        largest = (current_prefix, gz)
                current_prefix = prefix
                current = {}
            current[loan_number[PREFIX_LEN:]] = [encode(v) for v in row[1:]]
            rows_total += 1
        print(f"  {rows_total:,} rows, {shards:,} shards written...", end='\r')

    if current_prefix is not None:
        raw, gz = write_shard(current_prefix, current)
        shards += 1
        raw_total += raw
        gz_total += gz
        if gz > largest[1]:
            largest = (current_prefix, gz)

    elapsed = time.time() - started
    print(f"\n{shards:,} shards, {rows_total:,} rows in {elapsed/60:.1f} min")

    # Acceptance check: every row is reachable, and reachable by the exact
    # string slice the client will perform. A shard set that is complete but
    # keyed differently than the frontend slices is a 404 per tap.
    expected = con.execute(f"SELECT count(*) FROM '{SOURCE}'").fetchone()[0]
    if rows_total != expected:
        raise SystemExit(f"FAIL: wrote {rows_total:,} rows, source has {expected:,}")

    sample = con.execute(f"""
        SELECT loan_number, borrower_name FROM '{SOURCE}'
        USING SAMPLE 25 ROWS
    """).fetchall()
    for loan_number, name in sample:
        path = f'{OUT_DIR}/{loan_number[:PREFIX_LEN]}.json.gz'
        with gzip.open(path, 'rt', encoding='utf-8') as fh:
            shard = json.load(fh)
        record = shard['r'].get(loan_number[PREFIX_LEN:])
        if record is None:
            raise SystemExit(f"FAIL: {loan_number} missing from {path}")
        if record[shard['c'].index('borrower_name')] != name:
            raise SystemExit(f"FAIL: {loan_number} has the wrong borrower in {path}")

    os.makedirs('reports', exist_ok=True)
    with open(REPORT, 'w') as fh:
        fh.write(f"""# Stage 7b — Loan detail shards

Source: `{SOURCE}`
Output: `{OUT_DIR}/<prefix>.json.gz` (gzip, served with Content-Encoding: gzip)

| Metric | Value |
|---|---|
| Shards | {shards:,} |
| Rows | {rows_total:,} |
| Uncompressed | {raw_total/1024**2:,.0f} MB |
| Stored (gzip) | {gz_total/1024**2:,.0f} MB |
| Mean shard | {gz_total/shards/1024:,.0f} KB |
| Largest shard | {largest[0]} at {largest[1]/1024:,.0f} KB |
| Build time | {elapsed/60:.1f} min |

## Acceptance
- Row count matches the source exactly ({rows_total:,} = {expected:,}).
- 25 sampled loans were re-read from their shard by the same string slice the
  frontend performs (`loan_number[:4]` for the file, `loan_number[4:]` for the
  key) and matched on borrower name.

## Why
A pin tap needs one row, not a SQL engine. Answering it from
loan_lookup.parquet required DuckDB-WASM: 6.8MB of compressed wasm to download
and 34MB to compile before the first byte of the answer. Measured against R2,
the query itself was only ~1.1s and five range requests — the boot was the
wait, and on iOS Safari over cellular it dominated everything.

One shard is one `fetch()` and no wasm. DuckDB-WASM still backs name search,
where the user has typed and expects to wait.
""")
    print(f"Wrote {REPORT}")
    print(f"Stored {gz_total/1024**2:,.0f} MB gzip "
          f"(mean {gz_total/shards/1024:,.0f} KB, largest {largest[0]} at "
          f"{largest[1]/1024:,.0f} KB)")
    print("Stage 7b Complete.")


if __name__ == '__main__':
    main()
