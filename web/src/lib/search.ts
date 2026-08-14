import * as duckdb from "@duckdb/duckdb-wasm";
import { SEARCH_INDEX_URL } from "./config";
import type { LoanRecord } from "../types";

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

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

/** Debounced-caller-friendly: fires one query per call, caller handles debounce. */
export async function searchByName(query: string, limit = 50): Promise<LoanRecord[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const conn = await getConn();
  const escaped = normalizeName(trimmed).replace(/'/g, "''");
  const result = await conn.query(`
    SELECT * FROM parquet_scan('search_index.parquet')
    WHERE name_normalized ILIKE '%${escaped}%'
    ORDER BY approved_amount DESC
    LIMIT ${limit}
  `);
  return result.toArray().map((r) => rowToLoan(r.toJSON() as Record<string, unknown>));
}

/** The biggest loans in the index — used to seed the "Largest loans" panel so there's something to see before any search. */
export async function getTopLoans(
  minAmount = 5_000_000,
  limit = 200,
): Promise<LoanRecord[]> {
  const conn = await getConn();
  const result = await conn.query(`
    SELECT * FROM parquet_scan('search_index.parquet')
    WHERE approved_amount >= ${minAmount}
    ORDER BY approved_amount DESC
    LIMIT ${limit}
  `);
  return result.toArray().map((r) => rowToLoan(r.toJSON() as Record<string, unknown>));
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
