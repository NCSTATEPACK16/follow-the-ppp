import type { LoanRecord } from "../types";

/**
 * duckdb-wasm returns DATE columns as epoch-millisecond numbers/BigInts, not
 * strings. The detail shards (scripts/07b_detail_shards.py) already carry an
 * ISO date, which falls through this unchanged.
 */
export function formatDate(raw: unknown): string | null {
  if (raw == null) return null;
  const ms = Number(raw);
  if (!Number.isFinite(ms)) return String(raw);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * One loan row, however it arrived.
 *
 * Shared by the DuckDB path (name search) and the shard path (pin taps), so
 * the two sources cannot drift into disagreeing about what a record is — they
 * are the same rows from the same SBA release, and a visitor must not see the
 * card change when the same loan is reached a different way.
 */
export function rowToLoan(row: Record<string, unknown>): LoanRecord {
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
