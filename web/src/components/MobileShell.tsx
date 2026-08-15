import { useEffect, useState, type ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";

interface MobileShellProps {
  onHelpClick: () => void;
  /** Search field, rendered into the top bar. */
  search: ReactNode;
  /** Default sheet content: filters, top loans, export. */
  explore: ReactNode;
  /** A selected loan, or null. */
  detail: ReactNode;
  /** A selected county, or null. */
  county: ReactNode;
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
  search,
  explore,
  detail,
  county,
  reducedMotion = false,
}: MobileShellProps) {
  const selection = county ?? detail;
  // Opens at peek. This is a map: the map is the content, and the legend and
  // the licence-required attribution both live on it. Anything taller as a
  // default would cover them before the user has asked for anything.
  const [detent, setDetent] = useState(0);

  // A new selection returns the sheet to peek: the user tapped something on
  // the map, so the map is what they are looking at. Comparing counties one
  // after another should never require re-collapsing the sheet each time.
  const selectionKey = county ? "county" : detail ? "detail" : "none";
  useEffect(() => {
    if (selectionKey !== "none") setDetent(0);
  }, [selectionKey, county, detail]);

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
          <button
            type="button"
            className="gear-button"
            onClick={onHelpClick}
            aria-label="Help — how filters and search work"
          >
            ⚙
          </button>
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
