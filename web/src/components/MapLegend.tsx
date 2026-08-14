import { useState } from "react";

/**
 * The persistent secondary encoding for the pin palette. Two hues alone
 * cannot carry identity — this is what pairs them with words.
 * See docs/design-spec.md §3.6.
 */
export function MapLegend() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        className="map-legend-chip"
        onClick={() => setOpen(true)}
      >
        Legend
      </button>
    );
  }

  return (
    <div className="map-legend" role="region" aria-label="Map legend">
      <button
        type="button"
        className="map-legend-close"
        onClick={() => setOpen(false)}
        aria-label="Hide legend"
      >
        ×
      </button>
      <ul>
        <li>
          <span className="legend-dot" data-state="forgiven" /> Forgiven
        </li>
        <li>
          <span className="legend-dot" data-state="unforgiven" /> Not forgiven
        </li>
        <li>
          <span className="legend-dot legend-dot-approx" /> Approximate location
        </li>
      </ul>
    </div>
  );
}
