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

        <h3>Searching by name</h3>
        <p>
          Type at least 2 characters of a borrower's name — partial names work fine, and you
          don't need exact spelling or punctuation. "chick fil a" matches "CHICK-FIL-A OF
          RALEIGH" just as well as the fully-punctuated version, since matching ignores case,
          punctuation, and spacing differences. Results appear in a dropdown list below the
          search box as you type (there's a short pause while it searches), sorted by loan
          amount, largest first. Click a result to jump the map to it and open its full record.
        </p>
        <p>
          Search only covers North Carolina loans, and only the fields shown on the detail card
          — it won't match on address, lender, or NAICS code, only borrower name.
        </p>

        <h3>Filters</h3>
        <p>
          <strong>Min/Max amount</strong>, <strong>Forgiveness status</strong>, and{" "}
          <strong>NAICS sector</strong> filter the individual loan pins you see once you're
          zoomed in close enough to view them (roughly city/neighborhood level).
        </p>
        <p>
          <strong>They do not filter the shaded counties or the dots you see when zoomed out</strong>{" "}
          — those are pre-computed totals baked in ahead of time and can't be recalculated
          on the fly. When a filter is active and you're zoomed out, those layers dim to signal
          they're showing unfiltered totals, not what your filter selected. Zoom in to see the
          filter actually take effect.
        </p>
        <p>
          Two filters from the original plan for this map — filtering by <strong>year</strong>{" "}
          and by <strong>lender</strong> — aren't available yet; the map data was built without
          those fields to keep the file size small.
        </p>

        <h3>Reading the pins</h3>
        <p>
          Pin size scales with loan amount — bigger pins, more money. Green means forgiven,
          red means not forgiven (or not yet decided). A hollow, faint pin means the location
          is approximate (only the ZIP code is known); a solid pin means the location is exact.
        </p>
        </div>
      </div>
    </div>
  );
}
