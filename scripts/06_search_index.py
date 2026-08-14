import json
import os
import duckdb

DB_PATH        = 'data/ppp.duckdb'
OUT_DIR        = 'data/interim'
STATES_DIR     = f'{OUT_DIR}/states'
TOP_LOANS_PATH = f'{OUT_DIR}/top_loans.json'
TOP_LOANS_MIN  = 5_000_000
TOP_LOANS_LIMIT = 500

SELECT_COLUMNS = """
                LoanNumber        AS loan_number,
                BorrowerName      AS borrower_name,
                name_normalized,
                BorrowerCity      AS city,
                BorrowerState     AS state,
                BorrowerZip       AS zip,
                NAICSCode         AS naics,
                BusinessType      AS business_type,
                TRY_CAST(JobsReported AS INTEGER) AS jobs_reported,
                DateApproved      AS date_approved,
                CurrentApprovalAmount  AS approved_amount,
                ForgivenessAmount      AS forgiven_amount,
                LoanStatus        AS loan_status,
                OriginatingLender AS originating_lender,
                lat,
                lng,
                geo_precision
"""

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(STATES_DIR, exist_ok=True)

    con = duckdb.connect(DB_PATH)
    con.execute("SET memory_limit='10GB'")
    con.execute("SET preserve_insertion_order=false")
    con.execute("PRAGMA temp_directory='data/tmp'")

    # Full national parquet (sorted for row-group pruning) — fallback used
    # when the frontend has no state filter selected.
    out_path = f'{OUT_DIR}/search_index.parquet'
    print(f"Exporting search index to {out_path}...")
    con.execute(f"""
        COPY (
            SELECT {SELECT_COLUMNS}
            FROM loans
            ORDER BY state, name_normalized
        ) TO '{out_path}' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"  Full index: {size_mb:.1f} MB")

    # One shard per BorrowerState — lets the frontend query just the
    # selected state(s) instead of scanning the full national file, which
    # is the only way to make substring name search fast at national scope.
    states = [r[0] for r in con.execute(
        "SELECT DISTINCT BorrowerState FROM loans WHERE BorrowerState IS NOT NULL ORDER BY 1"
    ).fetchall()]

    state_sizes = {}
    for code in states:
        state_path = f'{STATES_DIR}/{code}.parquet'
        con.execute(f"""
            COPY (
                SELECT {SELECT_COLUMNS}
                FROM loans
                WHERE BorrowerState = '{code}'
                ORDER BY name_normalized
            ) TO '{state_path}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """)
        state_sizes[code] = os.path.getsize(state_path) / 1024 / 1024
    print(f"  Exported {len(states)} state shards to {STATES_DIR}/")

    # Precomputed $5M+ loans as a static JSON file, not a live DuckDB query —
    # the "Largest loans" panel used to run this as an in-browser scan of the
    # 499MB national parquet on every page load, and since duckdb-wasm's
    # single-threaded worker processes one query at a time, that blocked any
    # search the user typed until the scan finished (~20s+). This data barely
    # changes (fixed to the SBA FOIA data vintage), so precomputing it removes
    # it from the worker's queue entirely — a plain fetch() instead.
    print(f"Exporting top loans (>= ${TOP_LOANS_MIN:,}) to {TOP_LOANS_PATH}...")
    top_rows = con.execute(f"""
        SELECT {SELECT_COLUMNS}
        FROM loans
        WHERE CurrentApprovalAmount >= {TOP_LOANS_MIN}
        ORDER BY CurrentApprovalAmount DESC
        LIMIT {TOP_LOANS_LIMIT}
    """).fetchall()
    columns = [d[0] for d in con.description]
    top_loans = []
    for row in top_rows:
        record = dict(zip(columns, row))
        if record.get('date_approved') is not None:
            record['date_approved'] = record['date_approved'].isoformat()
        top_loans.append(record)
    with open(TOP_LOANS_PATH, 'w') as f:
        json.dump(top_loans, f)
    top_loans_size_kb = os.path.getsize(TOP_LOANS_PATH) / 1024
    print(f"  Top loans: {len(top_loans)} rows, {top_loans_size_kb:.1f} KB")

    # Row counts
    total = con.execute("SELECT COUNT(*) FROM loans").fetchone()[0]

    states_total_mb = sum(state_sizes.values())
    total_r2_gb = (os.path.getsize('tiles/counties-240930-v1.pmtiles') +
                   os.path.getsize('tiles/zips-240930-v1.pmtiles') +
                   os.path.getsize('tiles/loans-240930-v1.pmtiles') +
                   os.path.getsize(out_path) +
                   states_total_mb * 1024 * 1024) / 1024**3

    shard_rows = "\n".join(
        f"| `{code}.parquet` | {size:.1f} MB |" for code, size in sorted(state_sizes.items())
    )

    os.makedirs('reports', exist_ok=True)
    with open('reports/06_search_index.md', 'w') as f:
        f.write(f"""# Stage 6 Search Index Report

## Files
| File | Size |
|------|------|
| `search_index.parquet` (national) | {size_mb:.1f} MB |
| `top_loans.json` (>= ${TOP_LOANS_MIN:,}, static) | {top_loans_size_kb:.1f} KB |

## State shards (`states/`)
{shard_rows}

## Coverage
- Total loans indexed: {total:,}
- State shards exported: {len(states)}

## R2 Storage Budget
- Tiles + national search index + all state shards: **{total_r2_gb:.2f} GB** of 10 GB free tier
""")

    print(f"\nR2 budget check: {total_r2_gb:.2f} GB used (limit: 10 GB)")
    if total_r2_gb > 10:
        print("WARNING: Exceeds R2 free tier! Consider dropping the national fallback file.")
    else:
        print("Budget OK.")
    print("\nStage 6 Complete.")

if __name__ == "__main__":
    main()
