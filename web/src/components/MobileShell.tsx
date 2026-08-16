import { useEffect, useState, type ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";
import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "../lib/useTheme";

interface MobileShellProps {
  onHelpClick: () => void;
  onTrophyClick: () => void;
  theme?: Theme;
  onThemeToggle?: () => void;
  /** Search field, rendered into the top bar. */
  search: ReactNode;
  /** Default sheet content: filters, top loans, export. */
  explore: ReactNode;
  /** A selected loan, or null. */
  detail: ReactNode;
  /** A selected county, or null. */
  county: ReactNode;
  /**
   * Identity of the current selection ("loan:123", "county:37001", null).
   *
   * `detail` and `county` are freshly-constructed elements on every render, so
   * they cannot say whether the selection *changed*. Without this the sheet
   * re-snapped to its default on every unrelated re-render — a map pan while
   * the sheet was open dragged it shut under the reader's finger.
   */
  selectionId?: string | null;
  reducedMotion?: boolean;
}

/**
 * Phone layout: a compact top bar and one bottom sheet.
 *
 * The desktop sidebar carries the title, filters, search, top loans and
 * export all at once; at 390px that covers three quarters of the screen and
 * leaves the map a sliver. Here the same content moves into a single sheet
 * whose payload switches with the selection, so only one surface ever
 * competes with the map.
 */
export function MobileShell({
  onHelpClick,
  onTrophyClick,
  theme = "light",
  onThemeToggle,
  search,
  explore,
  detail,
  county,
  selectionId = null,
  reducedMotion = false,
}: MobileShellProps) {
  const selection = county ?? detail;
  // Opens at peek. This is a map: the map is the content, and the legend and
  // the licence-required attribution both live on it. Anything taller as a
  // default would cover them before the user has asked for anything.
  const [detent, setDetent] = useState(0);

  // Where each kind of selection lands the sheet.
  //
  // A loan opens at half: the card is a dozen fields deep, and at peek the
  // reader sees a name and has to drag before they can tell which of several
  // overlapping pins they actually hit. Half shows the whole record and still
  // leaves the map — and the tapped pin — visible above it.
  //
  // A county stays at peek. It is a browsing gesture: the headline total is
  // the answer, and comparing counties one after another must not bury the
  // map being compared.
  const selectionKey = county ? "county" : detail ? "detail" : "none";
  useEffect(() => {
    if (selectionKey === "county") setDetent(0);
    else if (selectionKey === "detail") setDetent(1);
    // Keyed on the selection's identity, never on the elements: a re-render
    // that carries the same selection must leave the sheet where the user
    // last put it.
  }, [selectionKey, selectionId]);

  const label = county
    ? "County statistics"
    : detail
      ? "Loan details"
      : "Search and filters";

  return (
    <>
      <div className="mobile-bar">
        <div className="mobile-bar-row">
          <h1 className="mobile-title">PPP Loan Map</h1>
          <div className="app-panel-actions">
            {onThemeToggle && <ThemeToggle theme={theme} onToggle={onThemeToggle} />}
            <button
              type="button"
              className="gear-button"
              onClick={onTrophyClick}
              aria-label="Cool stats — top counties, cities and loans"
            >
              🏆
            </button>
            <button
              type="button"
              className="gear-button"
              onClick={onHelpClick}
              aria-label="Help — how filters and search work"
            >
              ⚙
            </button>
          </div>
        </div>
        {search}
      </div>

      <BottomSheet
        detent={detent}
        onDetentChange={setDetent}
        label={label}
        reducedMotion={reducedMotion}
      >
        {selection ?? explore}
      </BottomSheet>
    </>
  );
}
