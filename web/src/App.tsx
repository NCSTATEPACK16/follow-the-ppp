import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { MapView } from "./map/MapView";
import { SearchBox } from "./components/SearchBox";
import { FilterPanel } from "./components/FilterPanel";
import { TopLoansPanel } from "./components/TopLoansPanel";
import { DetailCard } from "./components/DetailCard";
import { Footer } from "./components/Footer";
import { AboutPanel } from "./components/AboutPanel";
import { HelpPanel } from "./components/HelpPanel";
import { getLoanByNumber, getRandomLoan, getTopLoans } from "./lib/search";
import { downloadKml } from "./lib/kml";
import { parseDeepLink, writeDeepLink } from "./lib/url";
import { filtersActive } from "./map/filters";
import { DEFAULT_FILTERS } from "./types";
import type { Filters, LoanRecord, LoanTileProps } from "./types";
import "./App.css";

const LOANS_MIN_ZOOM = 9;

const initialLink = parseDeepLink();

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedLoan, setSelectedLoan] = useState<{
    loanNumber: string;
    preview: LoanRecord | null;
  } | null>(
    initialLink.loan ? { loanNumber: initialLink.loan, preview: null } : null,
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lastSearchResults, setLastSearchResults] = useState<LoanRecord[]>([]);
  const [zoom, setZoom] = useState(initialLink.zoom);
  const [topLoans, setTopLoans] = useState<LoanRecord[]>([]);
  const [randomLoading, setRandomLoading] = useState(false);

  useEffect(() => {
    getTopLoans().then(setTopLoans);
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
    setSelectedLoan({ loanNumber: loan.loan_number, preview: loan });
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
    setSelectedLoan({ loanNumber: props.id, preview: null });
    writeDeepLink({ loan: props.id, ...viewRef.current });
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

  return (
    <div className="app-shell">
      <MapView
        filters={filters}
        topLoans={topLoans}
        initialView={initialLink}
        onLoanClick={handleTileClick}
        onViewChange={handleViewChange}
        onMapReady={handleMapReady}
      />

      <div className="app-panel app-panel-left">
        <div className="app-panel-header">
          <h1>PPP Loan Map</h1>
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
        <SearchBox onSelect={handleSearchSelect} onResultsChange={setLastSearchResults} />
        <button
          type="button"
          className="random-button"
          onClick={handleRandomLoan}
          disabled={randomLoading}
        >
          {randomLoading ? "Finding one…" : "🎲 Random loan"}
        </button>
        <TopLoansPanel onSelect={flyToAndSelect} />
        <FilterPanel filters={filters} onChange={setFilters} />
        {filtersActive(filters) && zoom < LOANS_MIN_ZOOM && (
          <p className="filter-zoom-notice">
            Filters only apply to individual loan pins. The shaded counties and
            dots you're seeing at this zoom are unfiltered totals — zoom in
            (past ~z{LOANS_MIN_ZOOM}) to see the filtered pins.
          </p>
        )}
        <button type="button" onClick={handleExportKml}>
          Export search results as KML
        </button>
      </div>

      {selectedLoan && (
        <div className="app-panel app-panel-right">
          <DetailCard
            loanNumber={selectedLoan.loanNumber}
            preview={selectedLoan.preview}
            onClose={handleCloseDetail}
          />
        </div>
      )}

      <Footer onAboutClick={() => setAboutOpen(true)} />
      {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
