import { useEffect, useState } from "react";
import { getTopLoans } from "../lib/search";
import type { LoanRecord } from "../types";

interface TopLoansPanelProps {
  onSelect: (loan: LoanRecord) => void;
}

const MIN_AMOUNT = 5_000_000; // must match TOP_LOANS_MIN in scripts/06_search_index.py

export function TopLoansPanel({ onSelect }: TopLoansPanelProps) {
  const [loans, setLoans] = useState<LoanRecord[] | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    getTopLoans().then(setLoans);
  }, []);

  return (
    <div className="top-loans-panel">
      <button
        type="button"
        className="top-loans-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Largest loans (${(MIN_AMOUNT / 1_000_000).toFixed(0)}M+)
        {loans && ` — ${loans.length}`}
        <span className="top-loans-toggle-arrow">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          {!loans && <div className="search-status">Loading…</div>}
          {loans && loans.length === 0 && (
            <div className="search-status">None found.</div>
          )}
          {loans && loans.length > 0 && (
            <ul className="search-results top-loans-list">
              {loans.map((loan) => (
                <li key={loan.loan_number} onClick={() => onSelect(loan)}>
                  <strong>{loan.borrower_name}</strong>
                  <span>
                    {loan.city}, {loan.state} — ${loan.approved_amount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
