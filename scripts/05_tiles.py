"""
Stage 5 — build the three PMTiles archives.

Usage:
    python scripts/05_tiles.py              # all stages
    python scripts/05_tiles.py counties     # one or more of: counties zips loans

Stage selection exists because the loans archive is ~1GB and takes far longer
to build than the other two combined; a county-only change should not have to
rebuild it.
"""

import json
import os
import subprocess
import sys

import duckdb

from county_join import build_tiger_index, resolve_fips

DB_PATH = 'data/ppp.duckdb'
INTERIM = 'data/interim'
TILES   = 'tiles'
TIGER_DIR = 'data/raw/census/tiger_county'

#: A dropped county renders as $0, indistinguishable from one that genuinely
#: received nothing. Fail the stage rather than ship that silently.
MAX_UNMATCHED_SHARE = 0.001

STAGES = ('counties', 'zips', 'loans')


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


def ensure_tiger():
    """Download and unpack the TIGER 500k county shapefile if absent."""
    if os.path.exists(TIGER_DIR):
        return
    tiger_zip = 'data/raw/census/cb_2021_us_county_500k.zip'
    if not os.path.exists(tiger_zip):
        print("  Downloading TIGER county shapefile...")
        import urllib.request
        urllib.request.urlretrieve(
            'https://www2.census.gov/geo/tiger/GENZ2021/shp/cb_2021_us_county_500k.zip',
            tiger_zip
        )
    import zipfile
    os.makedirs(TIGER_DIR, exist_ok=True)
    with zipfile.ZipFile(tiger_zip, 'r') as zf:
        zf.extractall(TIGER_DIR)


def build_counties(con):
    """County polygons, z0–6. Returns a summary of the FIPS join."""
    print("\n[counties] County choropleth tiles (z0-z6)...")
    ensure_tiger()

    county_geojson = f'{INTERIM}/counties.geojsonseq'
    if os.path.exists(county_geojson):
        os.remove(county_geojson)
    con.execute("INSTALL spatial; LOAD spatial;")

    # Joining on UPPER(NAME) silently dropped 111 counties worth $21.7B —
    # SAINT vs St., apostrophes, diacritics, and independent cities that TIGER
    # spells without a " CITY" suffix. Those counties rendered as $0.
    # county_join owns the normalization; see its module docstring.
    tiger_rows = con.execute(f"""
        SELECT ST_AsGeoJSON(geom), GEOID, NAME, STUSPS, LSAD
        FROM ST_Read('{TIGER_DIR}/cb_2021_us_county_500k.shp')
    """).fetchall()
    agg_rows = con.execute("""
        SELECT state, county_name, loan_count,
               CAST(sum_approved AS BIGINT), CAST(COALESCE(sum_forgiven, 0) AS BIGINT)
        FROM agg_county
    """).fetchall()

    index = build_tiger_index([(r[1], r[2], r[3], r[4]) for r in tiger_rows])
    by_fips, unmatched = {}, []
    for state, name, loan_count, approved, forgiven in agg_rows:
        fips = resolve_fips(state, name, index)
        if fips is None:
            unmatched.append((state, name, loan_count, approved))
            continue
        if fips in by_fips:
            raise RuntimeError(
                f"FIPS {fips} claimed twice: {by_fips[fips][0]} and {state}/{name}"
            )
        by_fips[fips] = (f"{state}/{name}", loan_count, approved, forgiven)

    national = sum(r[3] or 0 for r in agg_rows)
    dropped = sum(r[3] or 0 for r in unmatched)
    share = dropped / national if national else 0
    if share > MAX_UNMATCHED_SHARE:
        raise RuntimeError(
            f"county join dropped ${dropped:,.0f} ({100 * share:.3f}% of national), "
            f"above the {100 * MAX_UNMATCHED_SHARE:.1f}% tolerance. Worst: "
            f"{sorted(unmatched, key=lambda r: -(r[3] or 0))[:5]}"
        )

    with open(county_geojson, 'w') as fh:
        for geom_str, fips, name, state, _lsad in tiger_rows:
            _, loan_count, approved, forgiven = by_fips.get(fips, (None, 0, 0, 0))
            fh.write(json.dumps({
                'type': 'Feature',
                'geometry': json.loads(geom_str),
                'properties': {
                    'fips': fips, 'name': name, 'state': state,
                    'loan_count': loan_count,
                    'sum_approved': approved, 'sum_forgiven': forgiven,
                },
            }) + '\n')

    print(f"  {len(tiger_rows):,} county features written.")
    print(f"  Join: {len(by_fips):,} of {len(agg_rows):,} aggregate rows matched; "
          f"{len(unmatched)} unmatched (${dropped:,.0f}, {100 * share:.4f}%).")

    run_tippecanoe([
        '--minimum-zoom=0', '--maximum-zoom=6',
        '--layer=counties',
        '--no-tile-size-limit',
        county_geojson,
    ], f'{TILES}/counties-240930-v1.pmtiles')

    return {
        'matched': len(by_fips), 'total': len(agg_rows),
        'unmatched': unmatched, 'dropped': dropped, 'share': share,
    }


def build_zips(con):
    """ZIP centroids, z6–9."""
    print("\n[zips] ZIP centroid tiles (z6-z9)...")
    zip_geojson = f'{INTERIM}/zips.geojsonseq'
    if not os.path.exists(zip_geojson):
        rows = con.execute("""
            SELECT
                z.zip,
                z.loan_count,
                CAST(z.sum_approved AS BIGINT) AS sum_approved,
                CAST(COALESCE(z.sum_forgiven, 0) AS BIGINT) AS sum_forgiven,
                CAST(c.INTPTLONG AS DOUBLE) AS lng,
                CAST(c.INTPTLAT AS DOUBLE) AS lat
            FROM agg_zip z
            JOIN read_csv_auto('data/raw/census/2021_Gaz_zcta_national.txt',
                sep='\t', header=True, ignore_errors=true) c
                ON TRIM(c.GEOID) = z.zip
            WHERE c.INTPTLAT IS NOT NULL
        """).fetchall()
        with open(zip_geojson, 'w') as fh:
            for r in rows:
                fh.write(json.dumps({
                    'type': 'Feature',
                    'geometry': {'type': 'Point', 'coordinates': [r[4], r[5]]},
                    'properties': {
                        'zcta': r[0], 'loan_count': r[1],
                        'sum_approved': r[2], 'sum_forgiven': r[3],
                    },
                }) + '\n')
        print(f"  {len(rows):,} ZIP features written.")

    run_tippecanoe([
        '--minimum-zoom=6', '--maximum-zoom=9',
        '--layer=zips',
        '--drop-densest-as-needed',
        '--no-tile-size-limit',
        zip_geojson,
    ], f'{TILES}/zips-240930-v1.pmtiles')


def build_loans(con):
    """Individual loan points, z9–14."""
    print("\n[loans] Individual loan point tiles (z9-z14)...")
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
        loans_geojson,
    ], f'{TILES}/loans-240930-v1.pmtiles')


def write_report(join):
    print("\n── Acceptance Check ──")
    total_gb = 0
    for fn in sorted(os.listdir(TILES)):
        if fn.endswith('.pmtiles'):
            mb = os.path.getsize(f'{TILES}/{fn}') / 1024 / 1024
            total_gb += mb / 1024
            print(f"  {fn}: {mb:.1f} MB")
    print(f"  Total tile storage: {total_gb:.2f} GB (R2 free-tier limit: 10 GB)")

    os.makedirs('reports', exist_ok=True)
    with open('reports/05_tiles.md', 'w') as f:
        f.write("# Stage 5 Tiles Report\n\n")
        for fn in sorted(os.listdir(TILES)):
            if fn.endswith('.pmtiles'):
                mb = os.path.getsize(f'{TILES}/{fn}') / 1024 / 1024
                f.write(f"- `{fn}`: {mb:.1f} MB\n")
        f.write(f"\nTotal: {total_gb:.2f} GB\n")

        f.write("\n## County FIPS join\n\n")
        if join is None:
            f.write("_Counties stage not run in this invocation._\n")
            return
        f.write(f"- Matched: {join['matched']:,} of {join['total']:,} aggregate rows\n")
        f.write(f"- Unmatched: {len(join['unmatched'])} rows, "
                f"${join['dropped']:,.0f} ({100 * join['share']:.4f}% of national)\n")
        if join['unmatched']:
            f.write("\n| State | County | Loans | Approved |\n|---|---|---:|---:|\n")
            for state, name, loans, approved in sorted(
                join['unmatched'], key=lambda r: -(r[3] or 0)
            ):
                f.write(f"| {state} | {name} | {loans:,} | ${approved:,.0f} |\n")
            f.write(
                "\nThese have no counterpart in `cb_2021_us_county_500k`: "
                "Connecticut's post-2022 planning regions, AS/MP/AE, and a few "
                "tribal and Alaskan areas. They are excluded from the choropleth "
                "and from county statistics.\n"
            )


def main(stages):
    os.makedirs(TILES, exist_ok=True)
    os.makedirs(INTERIM, exist_ok=True)

    con = duckdb.connect(DB_PATH)
    con.execute("SET memory_limit='10GB'")
    con.execute("SET preserve_insertion_order=false")
    con.execute("PRAGMA temp_directory='data/tmp'")

    join = build_counties(con) if 'counties' in stages else None
    if 'zips' in stages:
        build_zips(con)
    if 'loans' in stages:
        build_loans(con)

    write_report(join)
    print(f"\nStage 5 complete ({', '.join(stages)}).")


if __name__ == '__main__':
    requested = sys.argv[1:] or list(STAGES)
    unknown = [s for s in requested if s not in STAGES]
    if unknown:
        sys.exit(f"unknown stage(s): {unknown}; valid: {list(STAGES)}")
    main(requested)
