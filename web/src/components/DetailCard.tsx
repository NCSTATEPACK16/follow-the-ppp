import { useEffect, useState } from "react";
import { getLoanByNumber } from "../lib/search";
import { precisionLabel } from "../lib/precision";
import { SBA_SOURCE_URL } from "../lib/config";
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
          <h2>{loan.borrower_name}</h2>
          <dl>
            <dt>Location</dt>
            <dd>
              {loan.city}, {loan.state} {loan.zip}
            </dd>
            <dt>Approved amount</dt>
            <dd>${loan.approved_amount.toLocaleString()}</dd>
            <dt>Forgiven amount</dt>
            <dd>
              {(loan.forgiven_amount ?? 0) > 0
                ? `$${(loan.forgiven_amount ?? 0).toLocaleString()}`
                : "Not forgiven (yet, or not applied)"}
            </dd>
            <dt>Loan status</dt>
            <dd>{loan.loan_status ?? "Unknown"}</dd>
            <dt>Business type</dt>
            <dd>{loan.business_type ?? "Unknown"}</dd>
            <dt>Jobs reported</dt>
            <dd>{loan.jobs_reported ?? "Not reported"}</dd>
            <dt>Date approved</dt>
            <dd>{loan.date_approved ?? "Unknown"}</dd>
            <dt>Lender</dt>
            <dd>{loan.originating_lender ?? "Unknown"}</dd>
            <dt>Location precision</dt>
            <dd>{precisionLabel(loan.geo_precision)}</dd>
          </dl>
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
