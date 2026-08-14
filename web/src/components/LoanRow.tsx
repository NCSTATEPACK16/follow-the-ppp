import { formatCompactAmount, isForgiven, spokenAmount } from "../lib/format";
import type { LoanRecord } from "../types";

interface LoanRowProps {
  loan: LoanRecord;
  onSelect: (loan: LoanRecord) => void;
}

/**
 * One row shared by search results and the largest-loans panel. The leading
 * dot repeats the map's forgiveness encoding so the list and the map teach
 * each other.
 */
export function LoanRow({ loan, onSelect }: LoanRowProps) {
  const forgiven = isForgiven(loan);
  return (
    <li>
      <button type="button" className="loan-row" onClick={() => onSelect(loan)}>
        <span
          className="legend-dot"
          data-state={forgiven ? "forgiven" : "unforgiven"}
          aria-hidden="true"
        />
        <span className="loan-row-main">
          <span className="loan-row-name">{loan.borrower_name}</span>
          <span className="loan-row-meta">
            {loan.city}, {loan.state} · {forgiven ? "Forgiven" : "Not forgiven"}
          </span>
        </span>
        <span
          className="loan-row-amount tnum"
          aria-label={spokenAmount(loan.approved_amount)}
        >
          {formatCompactAmount(loan.approved_amount)}
        </span>
      </button>
    </li>
  );
}
