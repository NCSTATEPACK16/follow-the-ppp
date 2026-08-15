import type { Theme } from "../lib/useTheme";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/**
 * Sits beside the gear in both shells. The glyph shows what a tap *gets* you —
 * a moon while the map is light — which is the convention every OS uses and
 * the only one that survives being seen without a label.
 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const toDark = theme === "light";
  const label = toDark ? "Switch to dark map" : "Switch to light map";

  return (
    <button
      type="button"
      className="gear-button theme-toggle"
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-pressed={!toDark}
    >
      <span aria-hidden="true">{toDark ? "☾" : "☀"}</span>
    </button>
  );
}
