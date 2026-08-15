# Stage 7b — Loan detail shards

Source: `data/interim/loan_lookup-240930-v1.parquet`
Output: `data/interim/details-240930-v1/<prefix>.json.gz` (gzip, served with Content-Encoding: gzip)

| Metric | Value |
|---|---|
| Shards | 9,000 |
| Rows | 11,365,188 |
| Uncompressed | 2,215 MB |
| Stored (gzip) | 701 MB |
| Mean shard | 80 KB |
| Largest shard | 4998 at 100 KB |
| Build time | 2.9 min |

## Acceptance
- Row count matches the source exactly (11,365,188 = 11,365,188).
- 25 sampled loans were re-read from their shard by the same string slice the
  frontend performs (`loan_number[:4]` for the file, `loan_number[4:]` for the
  key) and matched on borrower name.

## Why
A pin tap needs one row, not a SQL engine. Answering it from
loan_lookup.parquet required DuckDB-WASM: 6.8MB of compressed wasm to download
and 34MB to compile before the first byte of the answer. Measured against R2,
the query itself was only ~1.1s and five range requests — the boot was the
wait, and on iOS Safari over cellular it dominated everything.

One shard is one `fetch()` and no wasm. DuckDB-WASM still backs name search,
where the user has typed and expects to wait.
