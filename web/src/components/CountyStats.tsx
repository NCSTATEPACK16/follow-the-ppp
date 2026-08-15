import { useEffect, useState } from "react";
import { getCountyStats, getNationalCount } from "../lib/countyStats";
import { formatCompactAmount, formatFullAmount } from "../lib/format";
import type { CountyStats as Stats } from "../types";

interface CountyStatsProps {
  fips: string;
  /** From the tile, so the header renders before the payload arrives. */
  name: string;
  state: string;
}

/**
 * Aggregate statistics for one county.
 *
 * A dollar total alone cannot answer "is that a lot?" — the rank chips and
 * the state share exist to answer it, which is why they sit directly under
 * the headline rather than in a table below the fold.
 */
export function CountyStats({ fips, name, state }: CountyStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [nationalCount, setNationalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    Promise.all([getCountyStats(fips), getNationalCount()])
      .then(([county, count]) => {
        if (cancelled) return;
        setStats(county);
        setNationalCount(count);
      })
      .catch(() => {
        // "The payload didn't arrive" and "this county has no PPP loans" are
        // opposite claims. Collapsing the first into the second is how a
        // missing R2 upload read as a fact about every county in the country.
        if (!cancelled) {
          setStats(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fips, attempt]);

  const perJob =
    stats && stats.jobs_reported
      ? Math.round(stats.sum_approved / stats.jobs_reported)
      : null;

  return (
    <section className="county-stats">
      {/* The payload is authoritative on identity when it has arrived; the
          tile props only stand in until it does. */}
      <h2 className="county-name">
        {stats?.name ?? name}, {stats?.state ?? state}
      </h2>

      {loading && <p className="county-loading">Loading statistics…</p>}

      {!loading && failed && (
        <p className="county-empty">
          Couldn't load county statistics.{" "}
          <button
            type="button"
            className="county-retry"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </p>
      )}

      {!loading && !failed && !stats && (
        <p className="county-empty">
          No PPP statistics for this county. Connecticut's planning regions and
          the territories have no counterpart in the Census county file, so they
          are excluded from these aggregates.
        </p>
      )}

      {stats && (
        <>
          <p className="county-hero tnum">
            {formatCompactAmount(stats.sum_approved)}
          </p>
          <p className="county-hero-label">PPP dollars approved</p>

          <div className="county-ribbon">
            <div className="county-chip">
              <div className="county-chip-n tnum">
                #{stats.state_rank.toLocaleString()}
              </div>
              <div className="county-chip-l">
                of {stats.state_n} {stats.state} counties
              </div>
            </div>
            <div className="county-chip">
              <div className="county-chip-n tnum">
                #{stats.nat_rank.toLocaleString()}
              </div>
              <div className="county-chip-l">
                of {nationalCount?.toLocaleString() ?? "—"} nationally
              </div>
            </div>
            <div className="county-chip">
              <div className="county-chip-n tnum">
                {stats.pct_state === null ? "—" : `${stats.pct_state}%`}
              </div>
              <div className="county-chip-l">of {stats.state}'s dollars</div>
            </div>
          </div>

          <div className="county-row">
            <span>Forgiven</span>
            <span className="tnum">
              <strong>{formatCompactAmount(stats.sum_forgiven)}</strong>{" "}
              <span className="county-muted">
                {stats.forg_rate === null ? "" : `${stats.forg_rate}%`}
              </span>
            </span>
          </div>
          <div className="county-bar">
            <div
              className="county-bar-fill"
              // Clamped at 100 for the bar only: some counties record more
              // forgiveness than approval, and an overflowing bar is a
              // rendering bug, but the true rate is printed above.
              style={{ width: `${Math.min(100, stats.forg_rate ?? 0)}%` }}
            />
          </div>

          <div className="county-grid">
            <div className="county-cell">
              <div className="county-cell-n tnum">
                {stats.loan_count.toLocaleString()}
              </div>
              <div className="county-cell-l">loans</div>
            </div>
            <div className="county-cell">
              <div className="county-cell-n tnum">
                {stats.median_loan === null
                  ? "—"
                  : formatFullAmount(stats.median_loan)}
              </div>
              <div className="county-cell-l">median loan</div>
            </div>
            {stats.jobs_reported !== null && (
              <div className="county-cell">
                <div className="county-cell-n tnum">
                  {stats.jobs_reported.toLocaleString()}
                </div>
                <div className="county-cell-l">jobs reported*</div>
              </div>
            )}
            {perJob !== null && (
              <div className="county-cell">
                <div className="county-cell-n tnum">
                  {formatFullAmount(perJob)}
                </div>
                <div className="county-cell-l">per job reported*</div>
              </div>
            )}
          </div>

          <p className="county-caveat">
            {stats.approx_pct !== null && (
              <>
                {stats.approx_pct}% of pins here are ZIP-centroid
                approximations, not exact addresses.
                <br />
              </>
            )}
            {stats.jobs_reported !== null && (
              <>*Jobs are self-reported at application — not verified, and not
              jobs saved.</>
            )}
          </p>
        </>
      )}
    </section>
  );
}
