// Base URLs for static assets. In production these point at the Cloudflare R2
// bucket (see spec Stage 8); in local dev they fall back to the symlinks in
// web/public/{tiles,data} that point at the repo's own tiles/ and data/interim/.
const TILES_BASE =
  import.meta.env.VITE_TILES_BASE_URL?.replace(/\/$/, "") ?? "/tiles";
const DATA_BASE =
  import.meta.env.VITE_DATA_BASE_URL?.replace(/\/$/, "") ?? "/data";

// Every asset here is served from R2 with `Cache-Control: immutable,
// max-age=31536000`, so a corrected file must take a NEW name — re-uploading
// over the old one reaches nobody who has already visited. The county tiles
// went to v2 when the FIPS join repair recovered $21.6B of counties that were
// rendering as $0; the search index went to v2 when it was re-sorted by
// loan_number for row-group pruning (scripts/06_search_index.py).
export const TILE_URLS = {
  counties: `${TILES_BASE}/counties-240930-v2.pmtiles`,
  zips: `${TILES_BASE}/zips-240930-v1.pmtiles`,
  loans: `${TILES_BASE}/loans-240930-v1.pmtiles`,
};

/** Name search with no state filter: the whole country, scanned. Sorted by
 *  state and name, which is what makes its per-state clustering compress. */
export const SEARCH_INDEX_URL = `${DATA_BASE}/search_index.parquet`;

/**
 * One loan by its number: tapping a pin, opening a `?loan=` link, or the
 * random-loan button.
 *
 * A second copy of the same records rather than a second use of the search
 * index, because the two want opposite physical layouts. A point lookup is
 * fast only when the file is sorted by the key it looks up, and sorting the
 * search index that way scattered the names it exists to compress — 523MB to
 * 638MB, and a 44% larger name column for every unfiltered search. Two files
 * cost storage, which the budget has, instead of speed, which it does not.
 */
export const LOAN_LOOKUP_URL = `${DATA_BASE}/loan_lookup-240930-v1.parquet`;

/**
 * The same records as loan_lookup.parquet, pre-sharded into 9,000 static
 * gzipped JSON files by the first four digits of the loan number
 * (scripts/07b_detail_shards.py). This is what a pin tap reads.
 *
 * The parquet above is now only the fallback for it: answering a tap from
 * parquet means booting DuckDB-WASM, which is 6.8MB of compressed wasm to
 * download and 34MB to compile before the query — measured as tens of seconds
 * on iOS Safari over cellular, against ~1.1s for the query itself. A shard is
 * one fetch of ~80KB and no wasm at all.
 */
export const DETAILS_BASE_URL = `${DATA_BASE}/details-240930-v1`;
export const STATE_INDEX_BASE_URL = `${DATA_BASE}/states`;
export const TOP_LOANS_URL = `${DATA_BASE}/top_loans.json`;
// Per-county aggregates for the county sheet (scripts/07_county_stats.py).
// Fetched lazily on the first county tap, never on page load.
export const COUNTY_STATS_URL = `${DATA_BASE}/county_stats.json`;
// Top 10 cities by dollars approved, for the trophy panel (scripts/07c_top_cities.py).
export const TOP_CITIES_URL = `${DATA_BASE}/top_cities.json`;

// Continental US, zoomed out enough to see the whole country — tiles and
// search are both national (see reports/05_tiles.md, config.yaml SCOPE).
export const DEFAULT_VIEW = {
  center: [-98.5, 39.5] as [number, number],
  zoom: 3.5,
};

export const SBA_SOURCE_URL = "https://data.sba.gov/dataset/ppp-foia";
export const GEOCODIO_URL = "https://www.geocod.io/geocoded-ppp-loan-data";
export const DATA_VINTAGE = "SBA FOIA release, 2024-09-30";
export const GEOCODE_VINTAGE = "Geocodio, June 2021";
