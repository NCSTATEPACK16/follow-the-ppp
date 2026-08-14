import os
import duckdb
import zipfile

def main():
    db_path = 'data/ppp.duckdb'
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database {db_path} not found. Run Stage 2 first.")
        
    con = duckdb.connect(db_path)
    
    print("Loading Geocodio coordinates...")
    con.execute("""
        CREATE OR REPLACE TEMP VIEW geocodio_view AS
        SELECT LoanNumber, Latitude, Longitude, "Accuracy Score" as AccuracyScore, "Accuracy Type" as AccuracyType
        FROM read_csv_auto('data/raw/geocodio/PPP_full_geocodio.csv', types={'LoanNumber': 'VARCHAR'}, ignore_errors=true)
    """)
    
    print("Loading Census ZCTA data...")
    census_zip = 'data/raw/census/2021_Gaz_zcta_national.zip'
    census_txt = 'data/raw/census/2021_Gaz_zcta_national.txt'
    if not os.path.exists(census_txt):
        with zipfile.ZipFile(census_zip, 'r') as zip_ref:
            zip_ref.extractall('data/raw/census/')
            
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW census_zcta AS
        SELECT 
            TRIM(GEOID) as zcta, 
            CAST(INTPTLAT AS DOUBLE) as lat, 
            CAST(INTPTLONG AS DOUBLE) as lng
        FROM read_csv_auto('{census_txt}', sep='\\t', header=True, ignore_errors=true)
    """)
    
    con.execute("DROP TABLE IF EXISTS loans;")
    
    print("Applying precision policy...")
    con.execute("""
        CREATE TABLE loans AS
        SELECT 
            l.*,
            CASE 
                WHEN l.CurrentApprovalAmount < 150000 
                     AND l.BusinessType IN ('Sole Proprietorship', 'Independent Contractors', 'Self-Employed Individuals')
                THEN true
                ELSE false
            END as is_downgraded,
            
            g.Latitude as raw_lat,
            g.Longitude as raw_lng,
            g.AccuracyScore as raw_accuracy_score,
            g.AccuracyType as raw_accuracy_type,
            
            c.lat as zcta_lat,
            c.lng as zcta_lng
            
        FROM loans_raw l
        LEFT JOIN geocodio_view g ON l.LoanNumber = g.LoanNumber
        LEFT JOIN census_zcta c ON SUBSTRING(l.BorrowerZip, 1, 5) = c.zcta
    """)
    
    con.execute("""
        ALTER TABLE loans ADD COLUMN lat DOUBLE;
        ALTER TABLE loans ADD COLUMN lng DOUBLE;
        ALTER TABLE loans ADD COLUMN geo_precision VARCHAR;
        
        UPDATE loans SET 
            geo_precision = 
                CASE 
                    WHEN is_downgraded THEN 'zip_centroid'
                    WHEN raw_accuracy_score >= 0.7 THEN 'rooftop'
                    WHEN raw_accuracy_score >= 0.5 THEN 'street'
                    WHEN zcta_lat IS NOT NULL THEN 'zip_centroid'
                    ELSE 'none'
                END;
                
        UPDATE loans SET
            lat = CASE
                    WHEN geo_precision IN ('rooftop', 'street') THEN raw_lat
                    WHEN geo_precision = 'zip_centroid' AND zcta_lat IS NOT NULL THEN 
                        zcta_lat + ((hash(LoanNumber) % 1000) / 1000.0 * 0.02 - 0.01)
                    ELSE NULL
                  END,
            lng = CASE
                    WHEN geo_precision IN ('rooftop', 'street') THEN raw_lng
                    WHEN geo_precision = 'zip_centroid' AND zcta_lng IS NOT NULL THEN 
                        zcta_lng + (((hash(LoanNumber) / 1000) % 1000) / 1000.0 * 0.02 - 0.01)
                    ELSE NULL
                  END;
    """)
    
    print("Generating geocode report...")
    report_df = con.execute("""
        SELECT 
            geo_precision, 
            COUNT(*) as count 
        FROM loans 
        GROUP BY geo_precision
    """).df()
    
    total_loans = con.execute("SELECT COUNT(*) FROM loans").fetchone()[0]
    matched_loans = con.execute("SELECT COUNT(*) FROM loans WHERE geo_precision != 'none'").fetchone()[0]
    match_rate = matched_loans / total_loans * 100
    
    state_report = con.execute("""
        SELECT 
            BorrowerState, 
            COUNT(*) as total,
            SUM(CASE WHEN geo_precision != 'none' THEN 1 ELSE 0 END)*100.0/COUNT(*) as match_pct
        FROM loans
        GROUP BY BorrowerState
        ORDER BY match_pct ASC
    """).df()
    
    report = f"""# Stage 3 Geocoding Report

- Total Loans: {total_loans}
- Matched Coordinates: {matched_loans}
- Overall Match Rate: {match_rate:.2f}%

## Precision Tiers
{report_df.to_markdown(index=False)}

## Match Rate by State (Worst First)
{state_report.head(20).to_markdown(index=False)}
"""
    os.makedirs('reports', exist_ok=True)
    with open('reports/03_geocode.md', 'w') as f:
        f.write(report)
        
    print("Stage 3 Complete.")

if __name__ == "__main__":
    main()
