"""
Stage 7c — emit data/interim/top_cities.json: the 10 cities with the most
PPP dollars approved, for the "Cool Stats" trophy panel.

Cities aren't a join target the way counties are (no TIGER/Census boundary
file backs them), so this skips the county_join machinery entirely and
aggregates BorrowerCity directly, keyed on UPPER(TRIM(...)) + state so
"Houston" and "HOUSTON " don't split into two rows. An average lat/lng over
each city's geocoded rows rides along, so the trophy panel can fly the map
there on click the way loan rows already do — counties can't offer this
(county_stats.json has no centroid), so this is a cities-only feature.

Output: data/interim/top_cities.json (10 rows, ~1KB)
Usage:  python scripts/07c_top_cities.py
"""

import json
import os

import duckdb

DB_PATH = 'data/ppp.duckdb'
OUT_PATH = 'data/interim/top_cities.json'
LIMIT = 10


def main():
    os.makedirs('data/interim', exist_ok=True)

    con = duckdb.connect(DB_PATH, read_only=True)

    rows = con.execute(f"""
        SELECT
            UPPER(TRIM(BorrowerCity)) AS city,
            BorrowerState             AS state,
            COUNT(*)                  AS loan_count,
            SUM(CurrentApprovalAmount) AS sum_approved,
            SUM(ForgivenessAmount)     AS sum_forgiven,
            AVG(lat)                  AS lat,
            AVG(lng)                  AS lng
        FROM loans
        WHERE BorrowerCity IS NOT NULL AND BorrowerState IS NOT NULL
        GROUP BY 1, 2
        ORDER BY sum_approved DESC
        LIMIT {LIMIT}
    """).fetchall()
    columns = [d[0] for d in con.description]

    # City-case titles ("Houston" not "HOUSTON") for display; the grouping key
    # above stays uppercase so casing variants in the source data still merge.
    top_cities = []
    for row in rows:
        r = dict(zip(columns, row))
        r['city'] = r['city'].title()
        top_cities.append(r)

    with open(OUT_PATH, 'w') as f:
        json.dump(top_cities, f)

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"Top {LIMIT} cities written to {OUT_PATH} ({size_kb:.1f} KB)")
    for r in top_cities:
        print(f"  {r['city']}, {r['state']}: ${r['sum_approved']:,.0f}")


if __name__ == '__main__':
    main()
