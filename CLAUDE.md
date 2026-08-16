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

## Public asset serving (`worker/`)
All public reads — the frontend's tile/data fetches (`VITE_TILES_BASE_URL`,
`VITE_DATA_BASE_URL` in Netlify) and `08_upload_r2.py`'s own `--verify` sweep
— go through a Cloudflare Worker (`worker/worker.js`, deployed to
`follow-the-ppp-assets.jbradner17.workers.dev`), not a raw `pub-*.r2.dev` URL.
Worker-to-R2 traffic uses the R2 binding, not the throttled public r2.dev
gateway, so it doesn't inherit the 429 problem above — this matters because
r2.dev getting hammered during a traffic spike (e.g. a front-page Reddit post)
is exactly the failure mode that would take the map down. Still $0: Workers'
free tier is 100K requests/day, and reads through a binding don't count
against R2 storage or incur egress charges.

Deploy changes with `cd worker && npx wrangler deploy` (needs `wrangler login`
once per machine). **Range requests are the entire reason this is a real file
and not a two-line passthrough** — pmtiles and duckdb-wasm's Parquet reads
both depend on them, and the R2 binding has a sharp edge here: `obj.range` is
populated even on a plain non-range `get()` (describing the whole object as
one range), so whether to answer `200` or `206` has to key off whether the
*client's request* had a `Range` header, never off `obj.range`'s mere
presence — get that wrong and every request silently becomes a 206, which
looks fine in a browser tab and breaks pmtiles/duckdb-wasm range-pruning in
ways that are hard to notice without checking status codes directly.
