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

/** Unknown-until-loaded, rather than a claim the field is empty. */
const PENDING = "…";

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
          <p className="detail-card-place tnum">
            {loan ? `${loan.city}, ${loan.state} · ${loan.zip}` : PENDING}
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

          <dl className="detail-card-fields">
            <dt>Approved</dt>
            <dd className="tnum">{loan ? (loan.date_approved ?? "Unknown") : PENDING}</dd>
            <dt>Lender</dt>
            <dd>{loan ? (loan.originating_lender ?? "Unknown") : PENDING}</dd>
            <dt>Business type</dt>
            <dd>{loan ? (loan.business_type ?? "Unknown") : PENDING}</dd>
            <dt>Jobs reported</dt>
            <dd className="tnum">
              {loan ? (loan.jobs_reported ?? "Not reported") : PENDING}
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
