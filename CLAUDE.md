# PPP Loan Map

Static public map of ~11.5M SBA PPP loans. Data is FINAL and never changes.

## Invariants — do not violate
- `LoanNumber` and all ZIP fields are VARCHAR. Never int. Leading zeros matter.
- SBA 2024-09-30 release is the source of truth for ALL attributes.
  Geocodio (June 2021) supplies coordinates ONLY — it predates forgiveness data.
- Every record carries `geo_precision`. Approximate points must render
  visually distinct from rooftop points. Never silently equate them.
- Geocodio attribution (CC BY 4.0) must appear in the UI. Required by license.
- **$0 budget is a hard constraint.** No paid tier, no API key, no billing
  account anywhere in the stack. Total R2 storage (tiles + search Parquet)
  must stay under the 10GB free tier — check this at the end of every
  Stage 5/6 rebuild, not just once.
- `data/`, `tiles/`, `*.duckdb` stay gitignored.

## Stack
DuckDB (ETL) → tippecanoe → PMTiles on Cloudflare R2 → MapLibre GL JS.
DuckDB-WASM in the browser, querying a static Parquet index on R2, for
**name search only**. No backend service anywhere.

**A pin tap must never boot DuckDB-WASM.** The engine is 6.8MB of compressed
wasm to download and 34MB to compile, and on iOS Safari over cellular that
boot — not the query, which measured ~1.1s — was tens of seconds of blank
fields. Loan detail is served from the static prefix shards
(`scripts/07b_detail_shards.py`) as one ~80KB fetch; the parquet query survives
only as the fallback in `lib/search.ts`. DuckDB-WASM is prewarmed on search-box
*focus*, never on page load, where it competed with MapLibre for the same
cellular connection while the map was still drawing.

## Pipeline
Run scripts/ in numeric order (07b, 07c run between 07 and 08). Each is
idempotent and writes to reports/. Never skip a stage's acceptance check.

## Publishing (Stage 8)
`python scripts/08_upload_r2.py` is the only way assets reach the bucket, and
its manifest must stay in step with `web/src/lib/config.ts`. Anything the
frontend asks for that is not in the manifest 404s in production and nowhere
else — that is how `county_stats.json` shipped, never got uploaded, and made
every county on the live site report "no PPP statistics".

R2 serves these objects `immutable, max-age=31536000`. **A corrected file must
take a new name** (`counties-240930-v2.pmtiles`), because overwriting the old
name reaches nobody who has already visited. Only the unversioned JSON
sidecars, cached for an hour, may be overwritten in place.

Run `--verify` after any deploy: it reads every object back over the public URL,
which is the only check that matches what a visitor actually gets.

**r2.dev is rate limited.** The manifest is now 9,066 objects, and sweeping it
at 16 threads drew a 429 on every read — reporting all 9,000 freshly-uploaded
detail shards as failed when every one had landed. `head()` retries 429 with
backoff and the read pool is 6; a throttle is not a missing object. If a sweep
starts reporting mass failures, check for 429 before believing it.
