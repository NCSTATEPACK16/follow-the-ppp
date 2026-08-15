import { useState } from "react";
import { LoanRow } from "./LoanRow";
import type { LoanRecord } from "../types";

interface TopLoansPanelProps {
  loans: LoanRecord[];
  onSelect: (loan: LoanRecord) => void;
}

const MIN_AMOUNT = 5_000_000; // must match TOP_LOANS_MIN in scripts/06_search_index.py

export function TopLoansPanel({ loans, onSelect }: TopLoansPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="top-loans-panel">
      <button
        type="button"
        className="top-loans-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Largest loans (${(MIN_AMOUNT / 1_000_000).toFixed(0)}M+)
        {loans.length > 0 && ` — ${loans.length}`}
        <span className="top-loans-toggle-arrow">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          {loans.length === 0 && <div className="search-status">Loading…</div>}
          {loans.length > 0 && (
            <ul className="search-results top-loans-list">
              {loans.map((loan) => (
                <LoanRow key={loan.loan_number} loan={loan} onSelect={onSelect} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
