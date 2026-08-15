"""
Stage 7 — emit data/interim/county_stats.json for the map's county sheet.

The county tiles carry only what the choropleth needs (loan_count,
sum_approved, sum_forgiven). Everything else the sheet reports — ranks,
share of state, median loan, jobs, precision mix — lives here instead, so
county tiles stay small and are never rebuilt to add a statistic.

The client fetches this once, lazily, on the first county tap.
"""

import json
import os

import duckdb

from county_join import build_tiger_index, display_name, resolve_fips
from county_stats import compute_county_stats

INTERIM = 'data/interim'
TIGER_DIR = 'data/raw/census/tiger_county'
OUT = f'{INTERIM}/county_stats.json'

COLUMNS = [
    'county_name', 'state', 'loan_count', 'sum_approved', 'sum_forgiven',
    'median_loan', 'jobs_reported',
    'count_rooftop', 'count_street', 'count_zip_centroid', 'count_none',
]


def main():
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")

    tiger = con.execute(f"""
        SELECT GEOID, NAME, STUSPS, LSAD
        FROM ST_Read('{TIGER_DIR}/cb_2021_us_county_500k.shp')
    """).fetchall()
    index = build_tiger_index(tiger)
    # TIGER's spelling is the one the user should see — "St. Louis", not
    # "SAINT LOUIS". display_name additionally splits independent cities
    # from the counties they share a name with.
    tiger_names = {geoid: display_name(name, lsad) for geoid, name, _, lsad in tiger}

    agg = con.execute(f"""
        SELECT {', '.join(COLUMNS)} FROM '{INTERIM}/agg_county.parquet'
    """).fetchall()

    rows, unmatched = [], []
    for record in agg:
        r = dict(zip(COLUMNS, record))
        fips = resolve_fips(r['state'], r['county_name'], index)
        if fips is None:
            unmatched.append(r)
            continue
        r['fips'] = fips
        r['name'] = tiger_names[fips]
        rows.append(r)

    stats = compute_county_stats(rows)

    os.makedirs(INTERIM, exist_ok=True)
    with open(OUT, 'w') as fh:
        json.dump(stats, fh, separators=(',', ':'), sort_keys=True)

    raw_kb = os.path.getsize(OUT) / 1024
    print(f"  {len(stats):,} counties written to {OUT} ({raw_kb:.0f} KB raw)")
    if unmatched:
        print(f"  {len(unmatched)} aggregate rows unmatched "
              f"(${sum(r['sum_approved'] or 0 for r in unmatched):,.0f})")

    os.makedirs('reports', exist_ok=True)
    with open('reports/07_county_stats.md', 'w') as f:
        f.write("# Stage 7 County Statistics Report\n\n")
        f.write(f"- Counties: {len(stats):,}\n")
        f.write(f"- Payload: {raw_kb:.0f} KB raw\n")
        f.write(f"- Unmatched aggregate rows: {len(unmatched)}\n\n")
        f.write("## Spot checks\n\n| County | Approved | In state | National | Forgiven |\n")
        f.write("|---|---:|---:|---:|---:|\n")
        for fips in ('37183', '06037', '29189', '24510'):
            s = stats.get(fips)
            if not s:
                continue
            f.write(
                f"| {s['name']}, {s['state']} | ${s['sum_approved']:,} | "
                f"#{s['state_rank']} of {s['state_n']} | #{s['nat_rank']} | "
                f"{s['forg_rate']}% |\n"
            )

    return stats


if __name__ == '__main__':
    main()
