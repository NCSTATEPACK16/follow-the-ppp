import { useEffect, useState } from "react";
import { getLoanByNumber } from "../lib/search";
import { precisionLabel } from "../lib/precision";
import { SBA_SOURCE_URL } from "../lib/config";
import { formatFullAmount, isForgiven, spokenAmount } from "../lib/format";
import type { LoanRecord } from "../types";

interface DetailCardProps {
  loanNumber: string;
  preview?: LoanRecord | null;
  onClose: () => void;
}

export function DetailCard({ loanNumber, preview, onClose }: DetailCardProps) {
  const [loan, setLoan] = useState<LoanRecord | null>(preview ?? null);
  const [loading, setLoading] = useState(!preview);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    getLoanByNumber(loanNumber).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result) setLoan(result);
      else setNotFound(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loanNumber]);

  return (
    <div className="detail-card">
      <button type="button" className="detail-card-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      {loading && !loan && <p>Loading record…</p>}
      {notFound && !loan && <p>No record found for loan {loanNumber} in the indexed data.</p>}

      {loan && (
        <>
          <h2 className="detail-card-name">{loan.borrower_name}</h2>
          <p className="detail-card-place tnum">
            {loan.city}, {loan.state} · {loan.zip}
          </p>

          <p
            className="detail-card-amount"
            aria-label={`Approved ${spokenAmount(loan.approved_amount)}`}
          >
            {formatFullAmount(loan.approved_amount)}
          </p>

          <p
            className="status-pill"
            data-state={isForgiven(loan) ? "forgiven" : "unforgiven"}
          >
            <span className="status-pill-dot" aria-hidden="true" />
            {isForgiven(loan)
              ? `Forgiven — ${formatFullAmount(loan.forgiven_amount ?? 0)}`
              : "Not forgiven"}
          </p>

          <dl className="detail-card-fields">
            <dt>Approved</dt>
            <dd className="tnum">{loan.date_approved ?? "Unknown"}</dd>
            <dt>Lender</dt>
            <dd>{loan.originating_lender ?? "Unknown"}</dd>
            <dt>Business type</dt>
            <dd>{loan.business_type ?? "Unknown"}</dd>
            <dt>Jobs reported</dt>
            <dd className="tnum">{loan.jobs_reported ?? "Not reported"}</dd>
            <dt>Status</dt>
            <dd>{loan.loan_status ?? "Unknown"}</dd>
          </dl>

          {loan.geo_precision !== "rooftop" && (
            <p className="detail-card-precision">
              ⚠ {precisionLabel(loan.geo_precision)} — the pin is not
              necessarily the business address.
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
