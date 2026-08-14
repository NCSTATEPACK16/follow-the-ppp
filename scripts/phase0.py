import os
import urllib.request
import zipfile
import duckdb

SBA_URL = "https://data.sba.gov/sites/default/files/distribution/SBA-OCA-2022-07-001/public_150k_plus_240930.csv"
GEOCODIO_URL = "https://releases.geocod.io/public/PPP_full_geocodio.zip"

SBA_PATH = "data/raw/sba/public_150k_plus_240930.csv"
GEOCODIO_ZIP_PATH = "data/raw/geocodio/PPP_full_geocodio.zip"
GEOCODIO_CSV_PATH = "data/raw/geocodio/PPP_full_geocodio.csv"
OUTPUT_JSON_PATH = "web/public/nc_150k_plus.json"

def download_file(url, path):
    if not os.path.exists(path):
        print(f"Downloading {url} to {path}...")
        urllib.request.urlretrieve(url, path)
    else:
        print(f"File {path} already exists, skipping download.")

def main():
    # Download files
    download_file(SBA_URL, SBA_PATH)
    download_file(GEOCODIO_URL, GEOCODIO_ZIP_PATH)

    # Unzip geocodio
    if not os.path.exists(GEOCODIO_CSV_PATH):
        print(f"Unzipping {GEOCODIO_ZIP_PATH}...")
        with zipfile.ZipFile(GEOCODIO_ZIP_PATH, 'r') as zip_ref:
            nameList = zip_ref.namelist()
            csv_name = [n for n in nameList if n.endswith('.csv')][0]
            zip_ref.extract(csv_name, "data/raw/geocodio/")
            if csv_name != "PPP_full_geocodio.csv":
                os.rename(os.path.join("data/raw/geocodio/", csv_name), GEOCODIO_CSV_PATH)
    else:
        print(f"File {GEOCODIO_CSV_PATH} already exists.")

    print("Running DuckDB query...")
    con = duckdb.connect(database=':memory:')
    
    query = f"""
    COPY (
        SELECT 
            s.LoanNumber AS id,
            s.BorrowerName AS name,
            s.CurrentApprovalAmount AS amount,
            g.Latitude AS lat,
            g.Longitude AS lng
        FROM read_csv_auto('{SBA_PATH}', types={{'LoanNumber': 'VARCHAR', 'BorrowerZip': 'VARCHAR'}}, ignore_errors=true) AS s
        JOIN read_csv_auto('{GEOCODIO_CSV_PATH}', types={{'LoanNumber': 'VARCHAR'}}, ignore_errors=true) AS g
        ON s.LoanNumber = g.LoanNumber
        WHERE s.BorrowerState = 'NC'
          AND g.Latitude IS NOT NULL
          AND g.Longitude IS NOT NULL
    ) TO '{OUTPUT_JSON_PATH}' (FORMAT JSON, ARRAY TRUE);
    """
    con.execute(query)
    print(f"Exported to {OUTPUT_JSON_PATH}")

if __name__ == "__main__":
    main()
