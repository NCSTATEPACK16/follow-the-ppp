import os
import subprocess
import duckdb

DB_PATH = 'data/ppp.duckdb'
INTERIM = 'data/interim'
TILES   = 'tiles'

def export_geojsonseq(con, query, path):
    print(f"  Exporting {path}...")
    con.execute(f"COPY ({query}) TO '{path}' (FORMAT JSON)")
    rows = int(subprocess.check_output(f"wc -l < {path}", shell=True).strip())
    print(f"  {rows:,} features written.")
    return rows

def run_tippecanoe(args, output):
    cmd = ['tippecanoe', '--output', output, '--force'] + args
    print(f"  Running: {' '.join(cmd[:6])}...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr[-3000:])
        raise RuntimeError(f"tippecanoe failed for {output}")
    size_mb = os.path.getsize(output) / 1024 / 1024
    print(f"  Built {output} ({size_mb:.1f} MB)")
    return size_mb

def main():
    os.makedirs(TILES, exist_ok=True)
    os.makedirs(INTERIM, exist_ok=True)

    con = duckdb.connect(DB_PATH)
    con.execute("SET memory_limit='10GB'")
    con.execute("SET preserve_insertion_order=false")
    con.execute("PRAGMA temp_directory='data/tmp'")

    # ── 1. County polygons (zoom 0–6) ────────────────────────────────────────
    print("\n[1/3] County choropleth tiles (z0-z6)...")

    # Download TIGER 500k county shapefile if not present
    tiger_zip = 'data/raw/census/cb_2021_us_county_500k.zip'
    tiger_dir = 'data/raw/census/tiger_county'
    if not os.path.exists(tiger_dir):
        if not os.path.exists(tiger_zip):
            print("  Downloading TIGER county shapefile...")
            import urllib.request
            urllib.request.urlretrieve(
                'https://www2.census.gov/geo/tiger/GENZ2021/shp/cb_2021_us_county_500k.zip',
                tiger_zip
            )
        import zipfile
        os.makedirs(tiger_dir, exist_ok=True)
        with zipfile.ZipFile(tiger_zip, 'r') as zf:
            zf.extractall(tiger_dir)

    # Join aggregates onto county FIPS
    county_geojson = f'{INTERIM}/counties.geojsonseq'
    # Always regenerate to ensure correct format
    if os.path.exists(county_geojson):
        os.remove(county_geojson)
    con.execute("INSTALL spatial; LOAD spatial;")
    rows = con.execute(f"""
        SELECT
            ST_AsGeoJSON(geom) as geom_str,
            GEOID  AS fips,
            NAME   AS name,
            STUSPS AS state,
            COALESCE(a.loan_count, 0)  AS loan_count,
            CAST(COALESCE(a.sum_approved, 0) AS BIGINT) AS sum_approved,
            CAST(COALESCE(a.sum_forgiven, 0) AS BIGINT) AS sum_forgiven
        FROM ST_Read('{tiger_dir}/cb_2021_us_county_500k.shp') t
        LEFT JOIN agg_county a
            ON UPPER(t.NAME) = UPPER(a.county_name)
            AND t.STUSPS = a.state
    """).fetchall()
    import json
    with open(county_geojson, 'w') as fh:
        for r in rows:
            feature = {
                'type': 'Feature',
                'geometry': json.loads(r[0]),
                'properties': {
                    'fips': r[1], 'name': r[2], 'state': r[3],
                    'loan_count': r[4], 'sum_approved': r[5], 'sum_forgiven': r[6]
                }
            }
            fh.write(json.dumps(feature) + '\n')
    print(f"  {len(rows):,} county features written.")
    run_tippecanoe([
        '--minimum-zoom=0', '--maximum-zoom=6',
        '--layer=counties',
        '--no-tile-size-limit',
        f'{county_geojson}'
    ], f'{TILES}/counties-240930-v1.pmtiles')

    # ── 2. ZIP centroids (zoom 6–9) ───────────────────────────────────────────
    print("\n[2/3] ZIP centroid tiles (z6-z9)...")
    zip_geojson = f'{INTERIM}/zips.geojsonseq'
    if not os.path.exists(zip_geojson):
        rows = con.execute(f"""
            SELECT
                z.zip,
                z.loan_count,
                CAST(z.sum_approved AS BIGINT) AS sum_approved,
                CAST(COALESCE(z.sum_forgiven, 0) AS BIGINT) AS sum_forgiven,
                CAST(c.INTPTLONG AS DOUBLE) AS lng,
                CAST(c.INTPTLAT AS DOUBLE) AS lat
            FROM agg_zip z
            JOIN read_csv_auto('data/raw/census/2021_Gaz_zcta_national.txt',
                sep='\\t', header=True, ignore_errors=true) c
                ON TRIM(c.GEOID) = z.zip
            WHERE c.INTPTLAT IS NOT NULL
        """).fetchall()
        import json
        with open(zip_geojson, 'w') as fh:
            for r in rows:
                feature = {
                    'type': 'Feature',
                    'geometry': {'type': 'Point', 'coordinates': [r[4], r[5]]},
                    'properties': {
                        'zcta': r[0], 'loan_count': r[1],
                        'sum_approved': r[2], 'sum_forgiven': r[3]
                    }
                }
                fh.write(json.dumps(feature) + '\n')
        print(f"  {len(rows):,} ZIP features written.")
    run_tippecanoe([
        '--minimum-zoom=6', '--maximum-zoom=9',
        '--layer=zips',
        '--drop-densest-as-needed',
        '--no-tile-size-limit',
        f'{zip_geojson}'
    ], f'{TILES}/zips-240930-v1.pmtiles')

    # ── 3. Individual loan points (zoom 9–14) ─────────────────────────────────
    print("\n[3/3] Individual loan point tiles (z9-z14)...")
    loans_geojson = f'{INTERIM}/loans.geojsonseq'
    if not os.path.exists(loans_geojson):
        con.execute(f"""
            COPY (
                SELECT
                    json_object(
                        'type', 'Feature',
                        'geometry', json_object('type', 'Point',
                            'coordinates', json_array(ROUND(lng, 5), ROUND(lat, 5))),
                        'properties', json_object(
                            'id',  LoanNumber,
                            'n',   LEFT(BorrowerName, 60),
                            'a',   CAST(CurrentApprovalAmount * 100 AS BIGINT),
                            'f',   CAST(COALESCE(ForgivenessAmount, 0) * 100 AS BIGINT),
                            's',   LEFT(LoanStatus, 20),
                            'nc',  LEFT(CAST(TRY_CAST(NAICSCode AS INTEGER) / 10000 AS VARCHAR), 2),
                            'p',   geo_precision
                        )
                    ) AS feature
                FROM loans
                WHERE lat IS NOT NULL AND lng IS NOT NULL
            ) TO '{loans_geojson}' (FORMAT JSON)
        """)

    run_tippecanoe([
        '--minimum-zoom=9', '--maximum-zoom=14',
        '--layer=loans',
        '--drop-densest-as-needed',
        '--extend-zooms-if-still-dropping',
        '--no-tile-size-limit',
        f'{loans_geojson}'
    ], f'{TILES}/loans-240930-v1.pmtiles')

    # ── Acceptance summary ────────────────────────────────────────────────────
    print("\n── Acceptance Check ──")
    total_gb = 0
    for fn in os.listdir(TILES):
        if fn.endswith('.pmtiles'):
            mb = os.path.getsize(f'{TILES}/{fn}') / 1024 / 1024
            total_gb += mb / 1024
            print(f"  {fn}: {mb:.1f} MB")
    print(f"  Total tile storage: {total_gb:.2f} GB (R2 free-tier limit: 10 GB)")

    os.makedirs('reports', exist_ok=True)
    with open('reports/05_tiles.md', 'w') as f:
        f.write("# Stage 5 Tiles Report\n\n")
        for fn in os.listdir(TILES):
            if fn.endswith('.pmtiles'):
                mb = os.path.getsize(f'{TILES}/{fn}') / 1024 / 1024
                f.write(f"- `{fn}`: {mb:.1f} MB\n")
        f.write(f"\nTotal: {total_gb:.2f} GB\n")

    print("\nStage 5 Complete.")

if __name__ == "__main__":
    main()
