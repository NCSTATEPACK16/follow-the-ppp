import { useState } from "react";
import { STATE_CODES, stateLabel } from "../lib/states";

interface StateFilterProps {
  selected: string[];
  onChange: (states: string[]) => void;
}

export function StateFilter({ selected, onChange }: StateFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = (code: string) => {
    onChange(
      selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code],
    );
  };

  const summary =
    selected.length === 0
      ? "Any state"
      : selected.length <= 3
        ? selected.join(", ")
        : `${selected.length} states`;

  return (
    <div className="state-filter">
      <button
        type="button"
        className="state-filter-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Narrow search by state: {summary}
        <span className="top-loans-toggle-arrow">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="state-filter-body">
          <p className="state-filter-hint">
            Pick one or more states to search only there — helps tell same-named businesses in
            different states apart.
          </p>
          {selected.length > 0 && (
            <button type="button" className="state-filter-clear" onClick={() => onChange([])}>
              Clear ({selected.length})
            </button>
          )}
          <ul className="state-filter-list">
            {STATE_CODES.map((code) => (
              <li key={code}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(code)}
                    onChange={() => toggle(code)}
                  />
                  {stateLabel(code)} ({code})
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
