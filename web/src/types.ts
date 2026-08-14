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
