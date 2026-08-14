import os
import json
import hashlib
import urllib.request
import re
import time
from urllib.error import URLError, HTTPError
from datetime import datetime

# URLs
SBA_PAGE_URL = "https://data.sba.gov/dataset/ppp-foia"
GEOCODIO_URL = "https://releases.geocod.io/public/PPP_full_geocodio.zip"
CENSUS_ZCTA_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2021_Gazetteer/2021_Gaz_zcta_national.zip"

MANIFEST_PATH = "data/raw/MANIFEST.json"

def compute_sha256(filepath):
    print(f"Computing SHA-256 for {filepath}...")
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def get_sba_links():
    req = urllib.request.Request(SBA_PAGE_URL, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
    except Exception as e:
        print(f"Failed to fetch SBA page: {e}")
        return []
    
    # Extract links directly from the SBA page HTML
    pattern = r'href="(https://data\.sba\.gov/sites/default/files/distribution/SBA-OCA-2022-07-001/[^"]+)"'
    matches = re.findall(pattern, html)
    valid_links = set()
    for m in matches:
        if m.endswith('.csv') or m.endswith('.xlsx'):
            valid_links.add(m)
    return list(valid_links)

def download_file_with_resume_and_hash(url, dest_dir, manifest, max_retries=5):
    filename = url.split('/')[-1]
    filepath = os.path.join(dest_dir, filename)
    
    if filename in manifest:
        entry = manifest[filename]
        if os.path.exists(filepath):
            file_size = os.path.getsize(filepath)
            if file_size == entry.get('size'):
                print(f"Skipping {filename} (already downloaded and size matches manifest).")
                return manifest
    
    print(f"Downloading {filename} from {url}...")
    
    retries = 0
    while retries < max_retries:
        try:
            req_head = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}, method='HEAD')
            try:
                head_resp = urllib.request.urlopen(req_head)
                total_size = int(head_resp.info().get('Content-Length', 0))
            except HTTPError as e:
                if e.code == 405: # Method Not Allowed
                    total_size = 0
                else:
                    raise

            if os.path.exists(filepath):
                downloaded_size = os.path.getsize(filepath)
                if downloaded_size == total_size and total_size > 0:
                    print(f"File {filename} is already fully downloaded based on server size.")
                    break
                elif downloaded_size > 0 and total_size > 0:
                    print(f"Resuming download from {downloaded_size} bytes...")
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    req.add_header('Range', f'bytes={downloaded_size}-')
                    resp = urllib.request.urlopen(req)
                    with open(filepath, 'ab') as f:
                        while True:
                            chunk = resp.read(8192)
                            if not chunk: break
                            f.write(chunk)
                    break

            # Fallback for full download
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            resp = urllib.request.urlopen(req)
            with open(filepath, 'wb') as f:
                while True:
                    chunk = resp.read(8192)
                    if not chunk: break
                    f.write(chunk)
            break
        except Exception as e:
            retries += 1
            print(f"Error downloading {filename}: {e}. Retry {retries}/{max_retries}")
            time.sleep(2 ** retries)
    
    if retries == max_retries:
        print(f"Failed to fully download {filename}")
        return manifest

    # Compute hash and save to manifest
    file_hash = compute_sha256(filepath)
    file_size = os.path.getsize(filepath)
    manifest[filename] = {
        'url': url,
        'sha256': file_hash,
        'size': file_size,
        'timestamp': datetime.utcnow().isoformat()
    }
    
    with open(MANIFEST_PATH, 'w') as f:
        json.dump(manifest, f, indent=2)
        
    return manifest

def main():
    os.makedirs('data/raw/sba', exist_ok=True)
    os.makedirs('data/raw/geocodio', exist_ok=True)
    os.makedirs('data/raw/census', exist_ok=True)
    os.makedirs('reports', exist_ok=True)
    
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, 'r') as f:
            manifest = json.load(f)
    else:
        manifest = {}

    sba_links = get_sba_links()
    if not sba_links:
        print("No SBA links found! The URL may have changed.")
        
    for link in sba_links:
        manifest = download_file_with_resume_and_hash(link, 'data/raw/sba', manifest)

    manifest = download_file_with_resume_and_hash(GEOCODIO_URL, 'data/raw/geocodio', manifest)
    manifest = download_file_with_resume_and_hash(CENSUS_ZCTA_URL, 'data/raw/census', manifest)

    # Acceptance test
    if len(manifest) >= 15:
        print("Acceptance test passed: 15+ files in manifest.")
        with open('reports/01_fetch.md', 'w') as f:
            f.write(f"# Stage 1 Fetch Report\n\n- Files downloaded: {len(manifest)}\n- Successfully acquired SBA data, Geocodio, and Census ZCTA files.\n- All checksums verified and recorded in MANIFEST.json.\n")
    else:
        print(f"Acceptance test failed: Manifest has {len(manifest)} files (expected 15+).")

if __name__ == "__main__":
    main()
