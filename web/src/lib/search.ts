import * as duckdb from "@duckdb/duckdb-wasm";
import { SEARCH_INDEX_URL, STATE_INDEX_BASE_URL, TOP_LOANS_URL } from "./config";
import type { LoanRecord } from "../types";

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;
const registeredStateFiles = new Set<string>();

/**
 * Boots duckdb-wasm using its jsdelivr-hosted worker/wasm bundles (the
 * officially recommended pattern for bundlers that don't want to wire up
 * worker imports by hand) and registers the NC search index as a remote
 * Parquet source queried via HTTP range requests — no server, no API key.
 */
async function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundles = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(bundles);
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {
          type: "text/javascript",
        }),
      );
      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);

      // The worker resolves URLs against its own script origin (the jsdelivr
      // CDN), not the page's — a relative path like "/data/..." fails there,
      // so always pass an absolute URL.
      const absoluteUrl = new URL(SEARCH_INDEX_URL, window.location.href).href;
      await db.registerFileURL(
        "search_index.parquet",
        absoluteUrl,
        duckdb.DuckDBDataProtocol.HTTP,
        false,
      );
      return db;
    })();
  }
  return dbPromise;
}

async function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) {
    connPromise = getDb().then((db) => db.connect());
  }
  return connPromise;
}

/**
 * Registers a per-state shard (data/states/<CODE>.parquet, see
 * scripts/06_search_index.py) under a stable alias the first time it's
 * needed, so a state-filtered search scans only that shard instead of the
 * ~500MB national file — the only way substring name search stays fast at
 * national scope.
 */
async function ensureStateFilesRegistered(codes: string[]): Promise<string[]> {
  const db = await getDb();
  const aliases: string[] = [];
  for (const code of codes) {
    const alias = `search_state_${code}.parquet`;
    aliases.push(alias);
    if (registeredStateFiles.has(alias)) continue;
    const absoluteUrl = new URL(`${STATE_INDEX_BASE_URL}/${code}.parquet`, window.location.href)
      .href;
    await db.registerFileURL(alias, absoluteUrl, duckdb.DuckDBDataProtocol.HTTP, false);
    registeredStateFiles.add(alias);
  }
  return aliases;
}

/** The FROM-clause source for a query: the national file, or a union of the selected states' shards. */
async function searchSource(states: string[]): Promise<string> {
  if (states.length === 0) return `parquet_scan('search_index.parquet')`;
  const aliases = await ensureStateFilesRegistered(states);
  return `parquet_scan([${aliases.map((a) => `'${a}'`).join(", ")}])`;
}

/**
 * Mirrors scripts/02_normalize.py's name_normalized derivation exactly:
 * punctuation becomes a SPACE, not nothing — "CHICK-FIL-A" -> "CHICK FIL A".
 * Stripping to nothing (the previous bug here) produced "CHICKFILA", which
 * never matches the space-separated indexed value.
 */
function normalizeName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** duckdb-wasm returns DATE columns as epoch-millisecond numbers/BigInts, not strings. */
function formatDate(raw: unknown): string | null {
  if (raw == null) return null;
  const ms = Number(raw);
  if (!Number.isFinite(ms)) return String(raw);
  return new Date(ms).toISOString().slice(0, 10);
}

function rowToLoan(row: Record<string, unknown>): LoanRecord {
  return {
    loan_number: String(row.loan_number),
    borrower_name: String(row.borrower_name ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    zip: String(row.zip ?? ""),
    naics: row.naics != null ? String(row.naics) : null,
    business_type: row.business_type != null ? String(row.business_type) : null,
    jobs_reported: row.jobs_reported != null ? Number(row.jobs_reported) : null,
    date_approved: formatDate(row.date_approved),
    approved_amount: Number(row.approved_amount ?? 0),
    forgiven_amount: row.forgiven_amount != null ? Number(row.forgiven_amount) : null,
    loan_status: row.loan_status != null ? String(row.loan_status) : null,
    originating_lender:
      row.originating_lender != null ? String(row.originating_lender) : null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    geo_precision: (row.geo_precision as LoanRecord["geo_precision"]) ?? "none",
  };
}

/** Only ever built from the fixed STATE_LABELS dropdown, but validated anyway before it's interpolated into SQL/file paths. */
function validStateCodes(states: string[]): string[] {
  return states.filter((s) => /^[A-Z]{2}$/.test(s));
}

/**
 * Debounced-caller-friendly: fires one query per call, caller handles debounce.
 * With no states selected, scans the full national index (~10-15s per query
 * at this data size). Selecting one or more states scans only those shards —
 * much faster, and the only way to tell same-named businesses in different
 * states apart without opening every result.
 */
export async function searchByName(
  query: string,
  states: string[] = [],
  limit = 50,
): Promise<LoanRecord[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const conn = await getConn();
  const escaped = normalizeName(trimmed).replace(/'/g, "''");
  const source = await searchSource(validStateCodes(states));
  const result = await conn.query(`
    SELECT * FROM ${source}
    WHERE name_normalized ILIKE '%${escaped}%'
    ORDER BY approved_amount DESC
    LIMIT ${limit}
  `);
  return result.toArray().map((r) => rowToLoan(r.toJSON() as Record<string, unknown>));
}

let topLoansPromise: Promise<LoanRecord[]> | null = null;

/**
 * The biggest loans (>= $5M, see scripts/06_search_index.py TOP_LOANS_MIN) —
 * seeds the "Largest loans" panel so there's something to see before any
 * search. Fetched as a static precomputed JSON file rather than queried live
 * against the 499MB national parquet: that used to run on every page load
 * and, since duckdb-wasm's worker is single-threaded, blocked any search the
 * user typed until the ~20s scan finished. This data barely changes (fixed
 * to the SBA FOIA vintage), so a plain fetch() never touches the DB worker.
 */
export async function getTopLoans(): Promise<LoanRecord[]> {
  if (!topLoansPromise) {
    topLoansPromise = fetch(TOP_LOANS_URL)
      .then((r) => r.json())
      .then((rows: Record<string, unknown>[]) => rows.map(rowToLoan));
  }
  return topLoansPromise;
}

/** USING SAMPLE takes a single-pass reservoir sample instead of sorting/scanning the whole table. */
export async function getRandomLoan(): Promise<LoanRecord | null> {
  const conn = await getConn();
  const result = await conn.query(`
    SELECT * FROM parquet_scan('search_index.parquet')
    USING SAMPLE 1 ROWS
  `);
  const rows = result.toArray();
  return rows.length ? rowToLoan(rows[0].toJSON() as Record<string, unknown>) : null;
}

export async function getLoanByNumber(loanNumber: string): Promise<LoanRecord | null> {
  const conn = await getConn();
  const escaped = loanNumber.replace(/'/g, "''");
  const result = await conn.query(`
    SELECT * FROM parquet_scan('search_index.parquet')
    WHERE loan_number = '${escaped}'
    LIMIT 1
  `);
  const rows = result.toArray();
  return rows.length ? rowToLoan(rows[0].toJSON() as Record<string, unknown>) : null;
}
