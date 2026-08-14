import { useEffect, useRef, useState } from "react";
import { searchByName } from "../lib/search";
import type { LoanRecord } from "../types";

interface SearchBoxProps {
  onSelect: (loan: LoanRecord) => void;
  onResultsChange?: (results: LoanRecord[]) => void;
}

const DEBOUNCE_MS = 250;

export function SearchBox({ onSelect, onResultsChange }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LoanRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    timerRef.current = window.setTimeout(async () => {
      try {
        const rows = await searchByName(query);
        setResults(rows);
        onResultsChange?.(rows);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [query]);

  return (
    <div className="search-box">
      <input
        type="text"
        placeholder="Search borrower name (NC)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {loading && <div className="search-status">Searching…</div>}
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((loan) => (
            <li
              key={loan.loan_number}
              onClick={() => {
                onSelect(loan);
                setOpen(false);
              }}
            >
              <strong>{loan.borrower_name}</strong>
              <span>
                {loan.city}, {loan.state} — ${loan.approved_amount.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && query.trim().length >= 2 && results.length === 0 && (
        <div className="search-status">No matches in the indexed data.</div>
      )}
    </div>
  );
}
