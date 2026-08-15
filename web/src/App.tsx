import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { MapView } from "./map/MapView";
import { SearchBox } from "./components/SearchBox";
import { StateFilter } from "./components/StateFilter";
import { FilterPanel } from "./components/FilterPanel";
import { TopLoansPanel } from "./components/TopLoansPanel";
import { DetailCard } from "./components/DetailCard";
import { Footer } from "./components/Footer";
import { AboutPanel } from "./components/AboutPanel";
import { HelpPanel } from "./components/HelpPanel";
import { CountyStats } from "./components/CountyStats";
import { MapLegend } from "./components/MapLegend";
import { MobileShell } from "./components/MobileShell";
import { ThemeToggle } from "./components/ThemeToggle";
import { useIsMobile } from "./lib/useIsMobile";
import { useTheme } from "./lib/useTheme";
import {
  getLoanByNumber,
  getRandomLoan,
  getTopLoans,
  prewarmSearch,
} from "./lib/search";
import { downloadKml } from "./lib/kml";
import { parseDeepLink, writeDeepLink } from "./lib/url";
import { usePrefersReducedMotion } from "./lib/useReducedMotion";
import { filtersActive } from "./map/filters";
import { DEFAULT_FILTERS } from "./types";
import type { CountyTileProps, Filters, LoanRecord, LoanTileProps } from "./types";
import "./App.css";

const LOANS_MIN_ZOOM = 9;

const initialLink = parseDeepLink();

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedLoan, setSelectedLoan] = useState<{
    loanNumber: string;
    preview: LoanRecord | null;
    /** Tile props from the tapped pin, so the panel paints without waiting. */
    tile: LoanTileProps | null;
  } | null>(
    initialLink.loan
      ? { loanNumber: initialLink.loan, preview: null, tile: null }
      : null,
  );
  const [selectedCounty, setSelectedCounty] = useState<CountyTileProps | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lastSearchResults, setLastSearchResults] = useState<LoanRecord[]>([]);
  const [zoom, setZoom] = useState(initialLink.zoom);
  const [topLoans, setTopLoans] = useState<LoanRecord[]>([]);
  const [randomLoading, setRandomLoading] = useState(false);
  const [searchStates, setSearchStates] = useState<string[]>([]);
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobile();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    getTopLoans().then(setTopLoans);
  }, []);

  // Boot the DuckDB worker while the user is still reading the map, so the
  // first tap on a pin pays for a lookup and not for a CDN download of the
  // wasm module. Idle-scheduled so it never competes with the map's own
  // first paint; the setTimeout is the Safari fallback.
  useEffect(() => {
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") {
      const handle = idle(() => prewarmSearch(), { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(prewarmSearch, 2000);
    return () => window.clearTimeout(handle);
  }, []);

  const mapRef = useRef<MlMap | null>(null);
  const viewRef = useRef({
    zoom: initialLink.zoom,
    lat: initialLink.lat,
    lng: initialLink.lng,
  });

  const handleMapReady = useCallback((map: MlMap) => {
    mapRef.current = map;
    if (initialLink.loan) {
      getLoanByNumber(initialLink.loan).then((loan) => {
        if (loan) map.flyTo({ center: [loan.lng, loan.lat], zoom: Math.max(map.getZoom(), 13) });
      });
    }
  }, []);

  const handleViewChange = useCallback(
    (v: { zoom: number; lat: number; lng: number }) => {
      viewRef.current = v;
      setZoom(v.zoom);
      writeDeepLink({ loan: selectedLoan?.loanNumber ?? null, ...v });
    },
    [selectedLoan],
  );

  const flyToAndSelect = useCallback((loan: LoanRecord) => {
    setSelectedLoan({ loanNumber: loan.loan_number, preview: loan, tile: null });
    mapRef.current?.flyTo({ center: [loan.lng, loan.lat], zoom: 13 });
    writeDeepLink({ loan: loan.loan_number, ...viewRef.current, lat: loan.lat, lng: loan.lng });
  }, []);

  const handleSearchSelect = flyToAndSelect;

  const handleRandomLoan = useCallback(async () => {
    setRandomLoading(true);
    try {
      const loan = await getRandomLoan();
      if (loan) flyToAndSelect(loan);
    } finally {
      setRandomLoading(false);
    }
  }, [flyToAndSelect]);

  const handleTileClick = useCallback((props: LoanTileProps) => {
    // Keep the tile's own properties: they are enough to render the headline
    // of the card immediately, instead of a "Loading record…" placeholder for
    // data that arrived with the pin.
    setSelectedLoan({ loanNumber: props.id, preview: null, tile: props });
    // A loan and a county never occupy the panel at once.
    setSelectedCounty(null);
    writeDeepLink({ loan: props.id, ...viewRef.current });
  }, []);

  const handleCountyClick = useCallback((props: CountyTileProps) => {
    // Tapping the selected county again clears it, so a stray tap while
    // comparing counties is one tap to undo rather than a hunt for a close
    // control.
    setSelectedCounty((current) => (current?.fips === props.fips ? null : props));
    setSelectedLoan(null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedLoan(null);
    writeDeepLink({ loan: null, ...viewRef.current });
  }, []);

  const handleExportKml = useCallback(() => {
    // Search results are the practical export surface for a DuckDB-WASM-only,
    // backend-free build: there's no server-side query to re-run against the
    // full filtered map, so "current view" means the current search result
    // set (falling back to the single selected loan, if any).
    const rows =
      lastSearchResults.length > 0
        ? lastSearchResults
        : selectedLoan?.preview
          ? [selectedLoan.preview]
          : [];
    if (rows.length === 0) {
      window.alert("Search for loans first, then export the results as KML.");
      return;
    }
    downloadKml(rows);
  }, [lastSearchResults, selectedLoan]);

  // Shared leaves. The mobile tree is a separate *layout*, but it composes
  // the same components, so the two shells can differ in arrangement and
  // never in behaviour.
  const searchControls = (
    <>
      <StateFilter selected={searchStates} onChange={setSearchStates} />
      <SearchBox
        states={searchStates}
        onSelect={handleSearchSelect}
        onResultsChange={setLastSearchResults}
      />
    </>
  );

  const exploreControls = (
    <>
      <button
        type="button"
        className="random-button"
        onClick={handleRandomLoan}
        disabled={randomLoading}
      >
        {randomLoading ? "Finding one…" : "🎲 Random loan"}
      </button>
      <TopLoansPanel loans={topLoans} onSelect={flyToAndSelect} />
      <FilterPanel filters={filters} onChange={setFilters} />
      {filtersActive(filters) && zoom < LOANS_MIN_ZOOM && (
        <p className="filter-zoom-notice">
          Filters only apply to individual loan pins. The shaded counties and
          dots you're seeing at this zoom are unfiltered totals — zoom in (past
          ~z{LOANS_MIN_ZOOM}) to see the filtered pins.
        </p>
      )}
      <button type="button" onClick={handleExportKml}>
        Export search results as KML
      </button>
    </>
  );

  // Shared between shells: on mobile it fills the sheet, on desktop the same
  // right-hand panel slot DetailCard uses. The desktop layout is unchanged —
  // it gains a payload for an existing panel, not a new panel.
  const countyCard = selectedCounty ? (
    <CountyStats
      fips={selectedCounty.fips}
      name={selectedCounty.name}
      state={selectedCounty.state}
    />
  ) : null;

  const detailCard = selectedLoan ? (
    <DetailCard
      loanNumber={selectedLoan.loanNumber}
      preview={selectedLoan.preview}
      tile={selectedLoan.tile}
      onClose={handleCloseDetail}
    />
  ) : null;

  // Identity of what is selected, so the mobile sheet can tell a *new*
  // selection from a re-render of the same one.
  const selectionId = selectedCounty
    ? `county:${selectedCounty.fips}`
    : selectedLoan
      ? `loan:${selectedLoan.loanNumber}`
      : null;

  const map = (
    <MapView
      filters={filters}
      dark={theme === "dark"}
      topLoans={topLoans}
      initialView={initialLink}
      reducedMotion={reducedMotion}
      selectedFips={selectedCounty?.fips ?? null}
      onLoanClick={handleTileClick}
      onCountyClick={handleCountyClick}
      onViewChange={handleViewChange}
      onMapReady={handleMapReady}
    />
  );

  const overlays = (
    <>
      <MapLegend />
      <Footer onAboutClick={() => setAboutOpen(true)} />
      {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </>
  );

  if (isMobile) {
    return (
      <div className="app-shell">
        {map}
        <MobileShell
          reducedMotion={reducedMotion}
          onHelpClick={() => setHelpOpen(true)}
          theme={theme}
          onThemeToggle={toggleTheme}
          selectionId={selectionId}
          search={searchControls}
          explore={exploreControls}
          detail={detailCard}
          county={countyCard}
        />
        {overlays}
      </div>
    );
  }

  return (
    <div className="app-shell">
      {map}

      <div className="app-panel app-panel-left">
        <div className="app-panel-header">
          <div>
            <h1>PPP Loan Map</h1>
            {/* Figures computed in reports/02_profile.md (Stage 2), not
                estimated: 11,365,188 loans, $787.5B approved. */}
            <p className="app-subtitle tnum">
              11.4M loans · $787B approved · 2020–2021
            </p>
          </div>
          <div className="app-panel-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button
              type="button"
              className="gear-button"
              onClick={() => setHelpOpen(true)}
              aria-label="Help — how filters and search work"
              title="Help — how filters and search work"
            >
              ⚙
            </button>
          </div>
        </div>
        {searchControls}
        {exploreControls}
      </div>

      {(countyCard || detailCard) && (
        <div className="app-panel app-panel-right">
          {countyCard ?? detailCard}
        </div>
      )}

      {overlays}
    </div>
  );
}
