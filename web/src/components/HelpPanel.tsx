interface HelpPanelProps {
  onClose: () => void;
}

export function HelpPanel({ onClose }: HelpPanelProps) {
  return (
    <div className="about-overlay" onClick={onClose}>
      <div className="about-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="detail-card-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="about-panel-body">
        <h2>How to use this map</h2>

        <h3>Search</h3>
        <p>
          Type at least 2 letters of a borrower's name — punctuation, case, and spacing don't
          matter ("chick fil a" matches "CHICK-FIL-A"). Results are sorted largest loan first;
          click one to jump to it. Name only — no address, lender, or NAICS matching.
        </p>
        <p>
          Same-named businesses show up in every state that has one. Use{" "}
          <strong>"Narrow search by state"</strong> above the search box to pick a state (or a
          few) first — it also searches noticeably faster than an unfiltered nationwide search.
        </p>

        <h3>Filters</h3>
        <p>
          <strong>Min/Max amount</strong>, <strong>Forgiveness status</strong>, and{" "}
          <strong>NAICS sector</strong> apply to individual loan pins once you're zoomed in close
          enough to see them (roughly city/neighborhood level) — they{" "}
          <strong>don't</strong> affect the shaded counties or dots you see zoomed out, since
          those are pre-computed totals. Those layers dim when a filter is active as a reminder
          they're still showing unfiltered numbers. <strong>Year</strong> and{" "}
          <strong>lender</strong> filters aren't available — left out of the map data to keep
          the file size small.
        </p>

        <h3>Colors</h3>
        <ul className="help-legend">
          <li><span className="legend-swatch legend-swatch-green" /> Forgiven loan</li>
          <li><span className="legend-swatch legend-swatch-red" /> Not forgiven (or undecided)</li>
          <li><span className="legend-swatch legend-swatch-gold" /> One of the largest loans ($5M+) — always shown, at any zoom</li>
          <li><span className="legend-swatch legend-swatch-hollow" /> Approximate location (ZIP centroid only); solid = exact address</li>
          <li><span className="legend-swatch legend-swatch-county" /> County shading — darker means more total dollars approved there</li>
        </ul>
        <p>Pin size also scales with loan amount — bigger pin, more money.</p>

        <h3>Loan status</h3>
        <p>Every loan record carries one of three statuses from the SBA data:</p>
        <ul>
          <li><strong>Paid in Full</strong> — repaid or forgiven; no balance remains.</li>
          <li><strong>Charged Off</strong> — borrower defaulted; the SBA wrote it off as a loss.</li>
          <li>
            <strong>Exemption 4</strong> — the SBA withheld the status, citing FOIA Exemption 4
            (confidential commercial information); not disclosed.
          </li>
        </ul>
        </div>
      </div>
    </div>
  );
}
