import { useEffect, useRef, useState } from "react";
import { prewarmSearch, searchByName } from "../lib/search";
import { LoanRow } from "./LoanRow";
import type { LoanRecord } from "../types";

interface SearchBoxProps {
  states: string[];
  onSelect: (loan: LoanRecord) => void;
  onResultsChange?: (results: LoanRecord[]) => void;
}

const DEBOUNCE_MS = 250;

export function SearchBox({ states, onSelect, onResultsChange }: SearchBoxProps) {
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
        const rows = await searchByName(query, states);
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
  }, [query, states]);

  return (
    <div className="search-box">
      <input
        type="text"
        placeholder="Search borrower name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          // Start the DuckDB boot here rather than on page load: this is the
          // first moment the engine is on the path to an answer, and it buys
          // the ~250ms debounce plus however long the user takes to type.
          prewarmSearch();
          if (results.length) setOpen(true);
        }}
      />
      {loading && <div className="search-status">Searching…</div>}
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((loan) => (
            <LoanRow
              key={loan.loan_number}
              loan={loan}
              onSelect={(l) => {
                onSelect(l);
                setOpen(false);
              }}
            />
          ))}
        </ul>
      )}
      {open && !loading && query.trim().length >= 2 && results.length === 0 && (
        <div className="search-status">No matches in the indexed data.</div>
      )}
    </div>
  );
}
