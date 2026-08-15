export type GeoPrecision = "rooftop" | "street" | "zip_centroid" | "none";

/** A row from the search_state_NC.parquet index, or a click on the `loans` tile layer. */
export interface LoanRecord {
  loan_number: string;
  borrower_name: string;
  city: string;
  state: string;
  zip: string;
  naics: string | null;
  business_type: string | null;
  jobs_reported: number | null;
  date_approved: string | null;
  approved_amount: number;
  forgiven_amount: number | null;
  loan_status: string | null;
  originating_lender: string | null;
  lat: number;
  lng: number;
  geo_precision: GeoPrecision;
}

/** Minimal properties baked into loans-240930-v1.pmtiles (short keys to keep tiles small). */
export interface LoanTileProps {
  id: string;
  n: string; // borrower name, truncated
  a: number; // approved amount, integer cents
  f: number; // forgiven amount, integer cents
  s: string; // loan status, truncated
  nc: string; // NAICS 2-digit sector
  p: GeoPrecision;
}

/** One county's entry in county_stats.json (scripts/07_county_stats.py). */
export interface CountyStats {
  name: string;
  state: string;
  loan_count: number;
  sum_approved: number;
  sum_forgiven: number;
  median_loan: number | null;
  jobs_reported: number | null;
  /** Competition rank by approved dollars, 1 = largest. Ties share a rank. */
  state_rank: number;
  state_n: number;
  nat_rank: number;
  /** Share of the state's approved dollars, one decimal. */
  pct_state: number | null;
  /** Forgiven / approved. Can exceed 100 — clamp the bar, not the number. */
  forg_rate: number | null;
  /** Share of loans at zip_centroid or unknown precision. */
  approx_pct: number | null;
}

/** Properties baked into counties-240930-v1.pmtiles. */
export interface CountyTileProps {
  fips: string;
  name: string;
  state: string;
  loan_count: number;
  sum_approved: number;
  sum_forgiven: number;
}

export interface Filters {
  minAmount: number | null;
  maxAmount: number | null;
  forgivenessStatus: "any" | "forgiven" | "not_forgiven";
  naicsSector: string | null; // 2-digit
}

export const DEFAULT_FILTERS: Filters = {
  minAmount: null,
  maxAmount: null,
  forgivenessStatus: "any",
  naicsSector: null,
};
