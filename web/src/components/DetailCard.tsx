import { useEffect, useState } from "react";
import { getLoanByNumber } from "../lib/search";
import { precisionLabel } from "../lib/precision";
import { SBA_SOURCE_URL } from "../lib/config";
import { formatFullAmount, isForgiven, spokenAmount } from "../lib/format";
import type { LoanRecord, LoanTileProps } from "../types";

interface DetailCardProps {
  loanNumber: string;
  /** A full record already in hand (a search hit) — skips the query entirely. */
  preview?: LoanRecord | null;
  /**
   * Properties of the tapped pin. The tile carries the borrower name, both
   * amounts, the status and the geocode precision, so the panel can be
   * readable on the same frame as the tap and let the remote query fill in
   * only what the tile cannot hold.
   */
  tile?: LoanTileProps | null;
  onClose: () => void;
}

/** Tile amounts are integer cents (see scripts/05_tiles.py build_loans). */
const CENTS = 100;

/**
 * What a field that the tile cannot carry says before the record lands.
 *
 * A bare "…" was indistinguishable from a truncated value, and on iOS Safari
 * the DuckDB boot plus range requests can take several seconds — long enough
 * that the ellipsis read as "this loan has no lender". Naming the state says
 * the value is coming, and says so in the field's own place instead of
 * replacing the whole card with a spinner.
 */
function pendingLabel(loading: boolean, failed: boolean): string {
  if (loading) return "Loading…";
  if (failed) return "Unavailable";
  return "Unknown";
}

export function DetailCard({ loanNumber, preview, tile, onClose }: DetailCardProps) {
  const [loan, setLoan] = useState<LoanRecord | null>(preview ?? null);
  const [loading, setLoading] = useState(!preview);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setFailed(false);
    getLoanByNumber(loanNumber)
      .then((result) => {
        if (cancelled) return;
        if (result) setLoan(result);
        else setNotFound(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loanNumber]);

  // Everything below reads through this: the full record when it has arrived,
  // otherwise whatever the tapped tile knew. The two never disagree — both
  // derive from the same SBA release — so the fields never rewrite themselves
  // under the reader, they only gain the ones the tile had no room for.
  const name = loan?.borrower_name ?? tile?.n ?? null;
  const approved = loan?.approved_amount ?? (tile ? tile.a / CENTS : null);
  const forgiven = loan?.forgiven_amount ?? (tile ? tile.f / CENTS : null);
  const status = loan?.loan_status ?? tile?.s ?? null;
  const precision = loan?.geo_precision ?? tile?.p ?? null;
  const forgivenState = isForgiven({ forgiven_amount: forgiven });

  const havePartial = name !== null && approved !== null;

  // One string for every field the tile could not carry, so they all say the
  // same thing at the same time rather than a row of mixed placeholders.
  const pending = pendingLabel(loading, failed);
  const pendingClass = loading ? "detail-card-pending" : undefined;

  return (
    <div className="detail-card">
      <button type="button" className="detail-card-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      {loading && !havePartial && <p>Loading record…</p>}
      {notFound && !havePartial && (
        <p>No record found for loan {loanNumber} in the indexed data.</p>
      )}

      {havePartial && (
        <>
          <h2 className="detail-card-name">{name}</h2>
          <p className={`detail-card-place tnum ${pendingClass ?? ""}`.trim()}>
            {loan ? `${loan.city}, ${loan.state} · ${loan.zip}` : pending}
          </p>

          <p
            className="detail-card-amount"
            aria-label={`Approved ${spokenAmount(approved as number)}`}
          >
            {formatFullAmount(approved as number)}
          </p>

          <p
            className="status-pill"
            data-state={forgivenState ? "forgiven" : "unforgiven"}
          >
            <span className="status-pill-dot" aria-hidden="true" />
            {forgivenState
              ? `Forgiven — ${formatFullAmount(forgiven ?? 0)}`
              : "Not forgiven"}
          </p>

          <dl className="detail-card-fields" aria-busy={loading && !loan}>
            <dt>Approved</dt>
            <dd className={`tnum ${pendingClass ?? ""}`.trim()}>
              {loan ? (loan.date_approved ?? "Unknown") : pending}
            </dd>
            <dt>Lender</dt>
            <dd className={pendingClass}>
              {loan ? (loan.originating_lender ?? "Unknown") : pending}
            </dd>
            <dt>Business type</dt>
            <dd className={pendingClass}>
              {loan ? (loan.business_type ?? "Unknown") : pending}
            </dd>
            <dt>Jobs reported</dt>
            <dd className={`tnum ${pendingClass ?? ""}`.trim()}>
              {loan ? (loan.jobs_reported ?? "Not reported") : pending}
            </dd>
            <dt>Status</dt>
            <dd>{status ?? "Unknown"}</dd>
          </dl>

          {precision !== null && precision !== "rooftop" && (
            <p className="detail-card-precision">
              ⚠ {precisionLabel(precision)} — the pin is not necessarily the
              business address.
            </p>
          )}

          {failed && (
            <p className="detail-card-precision">
              Couldn't load the full record — the figures above come from the
              map tile.
            </p>
          )}

          <p className="detail-card-disclaimer">
            A loan record is not evidence of wrongdoing.{" "}
            <a href={SBA_SOURCE_URL} target="_blank" rel="noreferrer">
              View SBA source data
            </a>
          </p>
        </>
      )}
    </div>
  );
}
