import os
import duckdb

DB_PATH   = 'data/ppp.duckdb'
OUT_DIR   = 'data/interim'
SCOPE     = 'NC'   # config: NC-first

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    con = duckdb.connect(DB_PATH)
    con.execute("SET memory_limit='10GB'")
    con.execute("SET preserve_insertion_order=false")
    con.execute("PRAGMA temp_directory='data/tmp'")

    # Full national parquet (sorted for row-group pruning)
    out_path = f'{OUT_DIR}/search_index.parquet'
    print(f"Exporting search index to {out_path}...")
    con.execute(f"""
        COPY (
            SELECT
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
            FROM loans
            ORDER BY state, name_normalized
        ) TO '{out_path}' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"  Full index: {size_mb:.1f} MB")

    # Also export a per-state file for NC (lazy-load pattern)
    nc_path = f'{OUT_DIR}/search_state_NC.parquet'
    print(f"Exporting NC-only search index to {nc_path}...")
    con.execute(f"""
        COPY (
            SELECT
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
            FROM loans
            WHERE BorrowerState = '{SCOPE}'
            ORDER BY name_normalized
        ) TO '{nc_path}' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)

    nc_size_mb = os.path.getsize(nc_path) / 1024 / 1024
    print(f"  NC index: {nc_size_mb:.1f} MB")

    # Row counts
    total    = con.execute("SELECT COUNT(*) FROM loans").fetchone()[0]
    nc_count = con.execute("SELECT COUNT(*) FROM loans WHERE BorrowerState='NC'").fetchone()[0]

    total_r2_gb = (os.path.getsize('tiles/counties-240930-v1.pmtiles') +
                   os.path.getsize('tiles/zips-240930-v1.pmtiles') +
                   os.path.getsize('tiles/loans-240930-v1.pmtiles') +
                   os.path.getsize(out_path)) / 1024**3

    os.makedirs('reports', exist_ok=True)
    with open('reports/06_search_index.md', 'w') as f:
        f.write(f"""# Stage 6 Search Index Report

## Files
| File | Size |
|------|------|
| `search_index.parquet` (national) | {size_mb:.1f} MB |
| `search_state_NC.parquet` | {nc_size_mb:.1f} MB |

## Coverage
- Total loans indexed: {total:,}
- NC loans indexed: {nc_count:,}

## R2 Storage Budget
- Tiles + national search index: **{total_r2_gb:.2f} GB** of 10 GB free tier
""")

    print(f"\nR2 budget check: {total_r2_gb:.2f} GB used (limit: 10 GB)")
    if total_r2_gb > 10:
        print("WARNING: Exceeds R2 free tier! Consider per-state split only.")
    else:
        print("Budget OK.")
    print("\nStage 6 Complete.")

if __name__ == "__main__":
    main()
