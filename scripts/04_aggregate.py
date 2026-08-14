import os
import duckdb

def main():
    db_path = 'data/ppp.duckdb'
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database {db_path} not found. Run Stages 2 & 3 first.")

    con = duckdb.connect(db_path)
    con.execute("SET memory_limit='10GB'")
    con.execute("SET preserve_insertion_order=false")
    con.execute("PRAGMA temp_directory='data/tmp'")

    print("Building county aggregates...")
    con.execute("DROP TABLE IF EXISTS agg_county")
    con.execute("""
        CREATE TABLE agg_county AS
        SELECT
            ProjectCountyName  AS county_name,
            ProjectState       AS state,
            COUNT(*)           AS loan_count,
            SUM(CurrentApprovalAmount) AS sum_approved,
            SUM(ForgivenessAmount)     AS sum_forgiven,
            MEDIAN(CurrentApprovalAmount) AS median_loan,
            SUM(TRY_CAST(JobsReported AS INTEGER)) AS jobs_reported,
            COUNT(CASE WHEN geo_precision = 'rooftop' THEN 1 END)     AS count_rooftop,
            COUNT(CASE WHEN geo_precision = 'street' THEN 1 END)      AS count_street,
            COUNT(CASE WHEN geo_precision = 'zip_centroid' THEN 1 END) AS count_zip_centroid,
            COUNT(CASE WHEN geo_precision = 'none' THEN 1 END)        AS count_none
        FROM loans
        WHERE ProjectCountyName IS NOT NULL AND ProjectState IS NOT NULL
        GROUP BY ProjectCountyName, ProjectState
    """)
    print(f"  County aggregates: {con.execute('SELECT COUNT(*) FROM agg_county').fetchone()[0]} rows")

    print("Building ZIP aggregates...")
    con.execute("DROP TABLE IF EXISTS agg_zip")
    con.execute("""
        CREATE TABLE agg_zip AS
        SELECT
            SUBSTRING(BorrowerZip, 1, 5) AS zip,
            COUNT(*)                     AS loan_count,
            SUM(CurrentApprovalAmount)   AS sum_approved,
            SUM(ForgivenessAmount)       AS sum_forgiven,
            MEDIAN(CurrentApprovalAmount) AS median_loan,
            SUM(TRY_CAST(JobsReported AS INTEGER))            AS jobs_reported
        FROM loans
        WHERE BorrowerZip IS NOT NULL AND LENGTH(TRIM(BorrowerZip)) >= 5
        GROUP BY SUBSTRING(BorrowerZip, 1, 5)
    """)
    print(f"  ZIP aggregates: {con.execute('SELECT COUNT(*) FROM agg_zip').fetchone()[0]} rows")

    print("Building lender aggregates...")
    con.execute("DROP TABLE IF EXISTS agg_lender")
    con.execute("""
        CREATE TABLE agg_lender AS
        SELECT
            OriginatingLender              AS lender_name,
            COUNT(*)                       AS loan_count,
            SUM(CurrentApprovalAmount)     AS sum_approved,
            SUM(ForgivenessAmount)         AS sum_forgiven,
            MEDIAN(CurrentApprovalAmount)  AS median_loan,
            SUM(TRY_CAST(JobsReported AS INTEGER))              AS jobs_reported
        FROM loans
        WHERE OriginatingLender IS NOT NULL
        GROUP BY OriginatingLender
        ORDER BY loan_count DESC
    """)
    print(f"  Lender aggregates: {con.execute('SELECT COUNT(*) FROM agg_lender').fetchone()[0]} rows")

    print("Building NAICS aggregates...")
    con.execute("DROP TABLE IF EXISTS agg_naics")
    con.execute("""
        CREATE TABLE agg_naics AS
        SELECT
            NAICSCode                      AS naics_code,
            CAST(TRY_CAST(NAICSCode AS INTEGER) / 10000 AS INT) AS naics_sector,
            COUNT(*)                       AS loan_count,
            SUM(CurrentApprovalAmount)     AS sum_approved,
            SUM(ForgivenessAmount)         AS sum_forgiven,
            MEDIAN(CurrentApprovalAmount)  AS median_loan,
            SUM(TRY_CAST(JobsReported AS INTEGER))              AS jobs_reported
        FROM loans
        WHERE NAICSCode IS NOT NULL
        GROUP BY NAICSCode
        ORDER BY loan_count DESC
    """)
    print(f"  NAICS aggregates: {con.execute('SELECT COUNT(*) FROM agg_naics').fetchone()[0]} rows")

    # Export JSON summary files for the frontend
    os.makedirs('data/interim', exist_ok=True)

    con.execute("""
        COPY (SELECT * FROM agg_county ORDER BY state, county_name)
        TO 'data/interim/agg_county.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)
    con.execute("""
        COPY (SELECT * FROM agg_zip ORDER BY zip)
        TO 'data/interim/agg_zip.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)
    con.execute("""
        COPY (SELECT * FROM agg_lender ORDER BY loan_count DESC)
        TO 'data/interim/agg_lender.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)
    con.execute("""
        COPY (SELECT * FROM agg_naics ORDER BY loan_count DESC)
        TO 'data/interim/agg_naics.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)

    print("Writing report...")
    os.makedirs('reports', exist_ok=True)
    county_count = con.execute("SELECT COUNT(*) FROM agg_county").fetchone()[0]
    zip_count    = con.execute("SELECT COUNT(*) FROM agg_zip").fetchone()[0]
    lender_count = con.execute("SELECT COUNT(*) FROM agg_lender").fetchone()[0]
    naics_count  = con.execute("SELECT COUNT(*) FROM agg_naics").fetchone()[0]

    top_lenders = con.execute("""
        SELECT lender_name, loan_count, sum_approved FROM agg_lender LIMIT 10
    """).df().to_markdown(index=False)

    top_naics = con.execute("""
        SELECT naics_code, loan_count, sum_approved FROM agg_naics LIMIT 10
    """).df().to_markdown(index=False)

    report = f"""# Stage 4 Aggregate Report

## Tables Created
| Table       | Rows |
|-------------|------|
| agg_county  | {county_count} |
| agg_zip     | {zip_count} |
| agg_lender  | {lender_count} |
| agg_naics   | {naics_count} |

## Top 10 Lenders by Loan Count
{top_lenders}

## Top 10 NAICS Codes by Loan Count
{top_naics}
"""
    with open('reports/04_aggregate.md', 'w') as f:
        f.write(report)

    print("Stage 4 Complete.")

if __name__ == "__main__":
    main()
