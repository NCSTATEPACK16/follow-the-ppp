import os
import glob
import pandas as pd
import duckdb

def get_expected_columns():
    df = pd.read_excel('data/raw/sba/ppp-data-dictionary.xlsx')
    df = df.dropna(subset=['Field Name'])
    return [str(f).strip() for f in df['Field Name']]

def determine_type(col):
    col = col.lower()
    if col == 'loannumber': return 'VARCHAR'
    if 'zip' in col: return 'VARCHAR'
    if 'amount' in col: return 'DOUBLE'
    if 'date' in col: return 'DATE'
    return 'VARCHAR'

def main():
    print("Reading data dictionary...")
    expected_columns = get_expected_columns()
    
    csv_files = glob.glob('data/raw/sba/public_*.csv')
    if not csv_files:
        raise ValueError("No SBA CSV files found!")
        
    con = duckdb.connect(':memory:')
    sample_csv = csv_files[0]
    actual_cols_df = con.execute(f"DESCRIBE SELECT * FROM read_csv_auto('{sample_csv}', sample_size=10, ignore_errors=true)").df()
    actual_columns = actual_cols_df['column_name'].tolist()
    
    missing_in_data = set(expected_columns) - set(actual_columns)
    missing_in_dict = set(actual_columns) - set(expected_columns)
    
    if missing_in_data or missing_in_dict:
        print(f"Missing in Data: {missing_in_data}")
        print(f"Missing in Dict: {missing_in_dict}")
        raise ValueError("Schema mismatch between Data Dictionary and CSVs!")

    print("Schema matches data dictionary.")
    
    types_dict = {col: determine_type(col) for col in expected_columns}
    
    db_path = 'data/ppp.duckdb'
    if os.path.exists(db_path):
        os.remove(db_path)
        
    con = duckdb.connect(db_path)
    con.execute("PRAGMA temp_directory='data/tmp'")
    con.execute("SET preserve_insertion_order=false")
    con.execute("SET memory_limit='10GB'") # Try pushing memory limit if 16GB RAM is available, or it will spill to temp
    
    types_str = ", ".join([f"'{k}': '{v}'" for k, v in types_dict.items()])
    
    print("Loading and unioning CSVs...")
    con.execute(f"""
        CREATE TABLE loans_raw AS
        SELECT DISTINCT ON (LoanNumber) *
        FROM read_csv_auto('data/raw/sba/public_*.csv', 
                           types={{ {types_str} }},
                           ignore_errors=true)
    """)
    
    print("Normalizing borrower names...")
    con.execute("""
        ALTER TABLE loans_raw ADD COLUMN name_normalized VARCHAR;
        UPDATE loans_raw SET name_normalized = BorrowerName;
        
        -- Uppercase
        UPDATE loans_raw SET name_normalized = UPPER(name_normalized);
        
        -- Strip punctuation (leave alphanumeric and spaces)
        UPDATE loans_raw SET name_normalized = REGEXP_REPLACE(name_normalized, '[^A-Z0-9 ]', ' ', 'g');
        
        -- Collapse whitespace
        UPDATE loans_raw SET name_normalized = REGEXP_REPLACE(name_normalized, '\\s+', ' ', 'g');
        
        -- Strip trailing spaces
        UPDATE loans_raw SET name_normalized = TRIM(name_normalized);
        
        -- Strip common suffixes at the end of string
        UPDATE loans_raw SET name_normalized = REGEXP_REPLACE(name_normalized, ' LLC$', '');
        UPDATE loans_raw SET name_normalized = REGEXP_REPLACE(name_normalized, ' INC$', '');
        UPDATE loans_raw SET name_normalized = REGEXP_REPLACE(name_normalized, ' L L C$', '');
        UPDATE loans_raw SET name_normalized = REGEXP_REPLACE(name_normalized, ' CORP$', '');
        UPDATE loans_raw SET name_normalized = REGEXP_REPLACE(name_normalized, ' CO$', '');
        UPDATE loans_raw SET name_normalized = REGEXP_REPLACE(name_normalized, ' COMPANY$', '');
        UPDATE loans_raw SET name_normalized = REGEXP_REPLACE(name_normalized, ' LTD$', '');
        UPDATE loans_raw SET name_normalized = TRIM(name_normalized);
    """)
    
    print("Generating profile report...")
    row_count = con.execute("SELECT COUNT(*) FROM loans_raw").fetchone()[0]
    count_by_state = con.execute("SELECT BorrowerState, COUNT(*) as c FROM loans_raw GROUP BY BorrowerState ORDER BY c DESC").df().to_markdown(index=False)
    count_by_year = con.execute("SELECT EXTRACT(YEAR FROM DateApproved) as yr, COUNT(*) as c FROM loans_raw GROUP BY yr ORDER BY yr").df().to_markdown(index=False)
    
    null_rates_queries = []
    for col in expected_columns:
        null_rates_queries.append(f"SUM(CASE WHEN {col} IS NULL THEN 1 ELSE 0 END)*100.0/COUNT(*) AS \"{col}_null_pct\"")
    null_rates_df = con.execute(f"SELECT {', '.join(null_rates_queries)} FROM loans_raw").df()
    null_rates = null_rates_df.T
    null_rates.columns = ['Null Percentage']
    null_rates = null_rates.to_markdown()
    
    amounts_df = con.execute("""
        SELECT 
            MIN(CurrentApprovalAmount) as min_approved,
            MAX(CurrentApprovalAmount) as max_approved,
            SUM(CurrentApprovalAmount) as sum_approved,
            MIN(ForgivenessAmount) as min_forgiven,
            MAX(ForgivenessAmount) as max_forgiven,
            SUM(ForgivenessAmount) as sum_forgiven
        FROM loans_raw
    """).df()
    
    report = f"""# Stage 2 Normalization Profile
    
## Overall
- Total Rows: {row_count}

## Amounts
{amounts_df.to_markdown(index=False)}

## Loans by Year
{count_by_year}

## Null Rates
{null_rates}

## Loans by State
{count_by_state}
"""
    os.makedirs('reports', exist_ok=True)
    with open('reports/02_profile.md', 'w') as f:
        f.write(report)
        
    print("Stage 2 Complete.")

if __name__ == "__main__":
    main()
