import type { Filters } from "../types";

/**
 * Build a MapLibre filter expression for the `loans-circle` layer.
 *
 * The tile schema (scripts/05_tiles.py) only carries id/n/a/f/s/nc/p to keep
 * loans.pmtiles small — no year or lender field is baked in, so those two
 * filters from the spec's Stage 7 list apply to search results only, not the
 * map layer. Amount, forgiveness status, and NAICS sector are all available.
 */
export function buildLoansFilter(filters: Filters): unknown[] | null {
  const clauses: unknown[] = ["all"];

  if (filters.minAmount != null) {
    clauses.push([">=", ["get", "a"], filters.minAmount * 100]);
  }
  if (filters.maxAmount != null) {
    clauses.push(["<=", ["get", "a"], filters.maxAmount * 100]);
  }
  if (filters.forgivenessStatus === "forgiven") {
    clauses.push([">", ["get", "f"], 0]);
  } else if (filters.forgivenessStatus === "not_forgiven") {
    clauses.push(["==", ["get", "f"], 0]);
  }
  if (filters.naicsSector) {
    clauses.push(["==", ["get", "nc"], filters.naicsSector]);
  }

  return clauses.length > 1 ? clauses : null;
}

export function filtersActive(filters: Filters): boolean {
  return (
    filters.minAmount != null ||
    filters.maxAmount != null ||
    filters.forgivenessStatus !== "any" ||
    filters.naicsSector != null
  );
}
