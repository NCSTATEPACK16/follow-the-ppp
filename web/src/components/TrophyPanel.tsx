import { useEffect, useState } from "react";
import { formatCompactAmount, spokenAmount } from "../lib/format";
import { getTopCounties } from "../lib/countyStats";
import { getTopCities } from "../lib/topCities";
import type { CityStats, CountyStats, CountyTileProps, LoanRecord } from "../types";
import { LoanRow } from "./LoanRow";

type Tab = "counties" | "cities" | "loans";

interface TrophyPanelProps {
  onClose: () => void;
  /** Already loaded by App on mount — reused rather than fetched again. */
  topLoans: LoanRecord[];
  onSelectLoan: (loan: LoanRecord) => void;
  onSelectCounty: (county: CountyTileProps) => void;
  onSelectCity: (city: CityStats) => void;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "counties", label: "Counties" },
  { key: "cities", label: "Cities" },
  { key: "loans", label: "Loans" },
];

/**
 * "Cool stats" — the top 10 counties, cities, and individual loans by
 * dollars approved, in one place for a reader who wants the highlights
 * without panning around.
 *
 * Counties and cities are fetched lazily on first open, the same pattern as
 * `CountyStats`: most visitors never open this, so it shouldn't cost anyone
 * a byte on page load.
 */
export function TrophyPanel({
  onClose,
  topLoans,
  onSelectLoan,
  onSelectCounty,
  onSelectCity,
}: TrophyPanelProps) {
  const [tab, setTab] = useState<Tab>("counties");
  const [counties, setCounties] = useState<(CountyStats & { fips: string })[] | null>(null);
  const [cities, setCities] = useState<CityStats[] | null>(null);
  const [failed, setFailed] = useState<Tab | null>(null);

  useEffect(() => {
    getTopCounties()
      .then(setCounties)
      .catch(() => setFailed("counties"));
    getTopCities()
      .then(setCities)
      .catch(() => setFailed("cities"));
  }, []);

  const topTen = topLoans.slice(0, 10);

  return (
    <div className="about-overlay" onClick={onClose}>
      <div className="about-panel trophy-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="detail-card-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="about-panel-body">
          <h2>🏆 Cool stats</h2>
          <p className="trophy-subtitle">The biggest PPP numbers on the map, by dollars approved.</p>

          <div className="trophy-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className="trophy-tab"
                data-active={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "counties" && (
            <ul className="search-results trophy-list">
              {counties === null && failed !== "counties" && (
                <li className="search-status">Loading…</li>
              )}
              {failed === "counties" && (
                <li className="search-status">Couldn't load county rankings.</li>
              )}
              {counties?.map((c) => (
                <li key={c.fips}>
                  <button
                    type="button"
                    className="loan-row trophy-row"
                    onClick={() => onSelectCounty(c)}
                  >
                    <span className="trophy-rank">#{c.nat_rank}</span>
                    <span className="loan-row-main">
                      <span className="loan-row-name">
                        {c.name}, {c.state}
                      </span>
                      <span className="loan-row-meta">
                        {c.loan_count.toLocaleString()} loans
                      </span>
                    </span>
                    <span
                      className="loan-row-amount tnum"
                      aria-label={spokenAmount(c.sum_approved)}
                    >
                      {formatCompactAmount(c.sum_approved)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tab === "cities" && (
            <ul className="search-results trophy-list">
              {cities === null && failed !== "cities" && (
                <li className="search-status">Loading…</li>
              )}
              {failed === "cities" && (
                <li className="search-status">Couldn't load city rankings.</li>
              )}
              {cities?.map((c, i) => (
                <li key={`${c.city}-${c.state}`}>
                  <button
                    type="button"
                    className="loan-row trophy-row"
                    onClick={() => onSelectCity(c)}
                  >
                    <span className="trophy-rank">#{i + 1}</span>
                    <span className="loan-row-main">
                      <span className="loan-row-name">
                        {c.city}, {c.state}
                      </span>
                      <span className="loan-row-meta">
                        {c.loan_count.toLocaleString()} loans
                      </span>
                    </span>
                    <span
                      className="loan-row-amount tnum"
                      aria-label={spokenAmount(c.sum_approved)}
                    >
                      {formatCompactAmount(c.sum_approved)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tab === "loans" && (
            <ul className="search-results trophy-list">
              {topTen.length === 0 && <li className="search-status">Loading…</li>}
              {topTen.map((loan) => (
                <LoanRow key={loan.loan_number} loan={loan} onSelect={onSelectLoan} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
