import { useCallback, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { MapView } from "./map/MapView";
import { SearchBox } from "./components/SearchBox";
import { FilterPanel } from "./components/FilterPanel";
import { DetailCard } from "./components/DetailCard";
import { Footer } from "./components/Footer";
import { AboutPanel } from "./components/AboutPanel";
import { getLoanByNumber } from "./lib/search";
import { downloadKml } from "./lib/kml";
import { parseDeepLink, writeDeepLink } from "./lib/url";
import { DEFAULT_FILTERS } from "./types";
import type { Filters, LoanRecord, LoanTileProps } from "./types";
import "./App.css";

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
  const [lastSearchResults, setLastSearchResults] = useState<LoanRecord[]>([]);

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
      writeDeepLink({ loan: selectedLoan?.loanNumber ?? null, ...v });
    },
    [selectedLoan],
  );

  const handleSearchSelect = useCallback((loan: LoanRecord) => {
    setSelectedLoan({ loanNumber: loan.loan_number, preview: loan });
    mapRef.current?.flyTo({ center: [loan.lng, loan.lat], zoom: 13 });
    writeDeepLink({ loan: loan.loan_number, ...viewRef.current, lat: loan.lat, lng: loan.lng });
  }, []);

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
        initialView={initialLink}
        onLoanClick={handleTileClick}
        onViewChange={handleViewChange}
        onMapReady={handleMapReady}
      />

      <div className="app-panel app-panel-left">
        <h1>PPP Loan Map — North Carolina</h1>
        <SearchBox onSelect={handleSearchSelect} onResultsChange={setLastSearchResults} />
        <FilterPanel filters={filters} onChange={setFilters} />
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
    </div>
  );
}
