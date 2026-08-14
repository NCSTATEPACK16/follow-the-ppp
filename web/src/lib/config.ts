// Base URLs for static assets. In production these point at the Cloudflare R2
// bucket (see spec Stage 8); in local dev they fall back to the symlinks in
// web/public/{tiles,data} that point at the repo's own tiles/ and data/interim/.
const TILES_BASE =
  import.meta.env.VITE_TILES_BASE_URL?.replace(/\/$/, "") ?? "/tiles";
const DATA_BASE =
  import.meta.env.VITE_DATA_BASE_URL?.replace(/\/$/, "") ?? "/data";

export const TILE_URLS = {
  counties: `${TILES_BASE}/counties-240930-v1.pmtiles`,
  zips: `${TILES_BASE}/zips-240930-v1.pmtiles`,
  loans: `${TILES_BASE}/loans-240930-v1.pmtiles`,
};

export const SEARCH_INDEX_URL = `${DATA_BASE}/search_state_NC.parquet`;

// North Carolina, roughly centered — this is the default camera. The
// underlying tiles are national (see reports/05_tiles.md), but this build's
// scope (config.yaml SCOPE=NC) and search index are NC-only.
export const DEFAULT_VIEW = {
  center: [-79.3, 35.5] as [number, number],
  zoom: 6.5,
};

export const SBA_SOURCE_URL = "https://data.sba.gov/dataset/ppp-foia";
export const GEOCODIO_URL = "https://www.geocod.io/geocoded-ppp-loan-data";
export const DATA_VINTAGE = "SBA FOIA release, 2024-09-30";
export const GEOCODE_VINTAGE = "Geocodio, June 2021";
