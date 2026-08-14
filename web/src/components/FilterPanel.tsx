import type { Filters } from "../types";
import { DEFAULT_FILTERS } from "../types";

interface FilterPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

// NAICS 2-digit sectors that actually appear in PPP data, per reports/04_aggregate.md top codes.
const NAICS_SECTORS: [string, string][] = [
  ["11", "Agriculture, Forestry, Fishing & Hunting"],
  ["23", "Construction"],
  ["31", "Manufacturing"],
  ["44", "Retail Trade"],
  ["48", "Transportation & Warehousing"],
  ["53", "Real Estate"],
  ["54", "Professional, Scientific & Technical Services"],
  ["56", "Administrative & Support Services"],
  ["62", "Health Care & Social Assistance"],
  ["72", "Accommodation & Food Services"],
  ["81", "Other Services"],
];

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  return (
    <div className="filter-panel">
      <h3>Filters</h3>

      <label>
        Min amount ($)
        <input
          type="number"
          min={0}
          value={filters.minAmount ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              minAmount: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </label>

      <label>
        Max amount ($)
        <input
          type="number"
          min={0}
          value={filters.maxAmount ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              maxAmount: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </label>

      <label>
        Forgiveness status
        <select
          value={filters.forgivenessStatus}
          onChange={(e) =>
            onChange({
              ...filters,
              forgivenessStatus: e.target.value as Filters["forgivenessStatus"],
            })
          }
        >
          <option value="any">Any</option>
          <option value="forgiven">Forgiven</option>
          <option value="not_forgiven">Not forgiven</option>
        </select>
      </label>

      <label>
        NAICS sector
        <select
          value={filters.naicsSector ?? ""}
          onChange={(e) =>
            onChange({ ...filters, naicsSector: e.target.value || null })
          }
        >
          <option value="">All sectors</option>
          {NAICS_SECTORS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <button type="button" onClick={() => onChange(DEFAULT_FILTERS)}>
        Reset filters
      </button>
    </div>
  );
}
