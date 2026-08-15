import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ensurePmtilesProtocol } from "../lib/pmtilesProtocol";
import { buildMapStyle, basemapUrl } from "./style";
import { buildLoansFilter, filtersActive } from "./filters";
import { DEFAULT_VIEW } from "../lib/config";
import type { DeepLinkState } from "../lib/url";
import type { CountyTileProps, Filters, LoanRecord, LoanTileProps } from "../types";

ensurePmtilesProtocol();

function topLoansToGeoJson(loans: LoanRecord[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: loans.map((loan) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [loan.lng, loan.lat] },
      // Short keys mirror the tile layer's schema (scripts/05_tiles.py), so
      // both layers share one color expression and one click payload —
      // amounts in integer cents, as the tiles store them.
      properties: {
        id: loan.loan_number,
        n: loan.borrower_name,
        a: Math.round(loan.approved_amount * 100),
        f: Math.round((loan.forgiven_amount ?? 0) * 100),
        s: loan.loan_status ?? "",
        p: loan.geo_precision,
      },
    })),
  };
}

/** Pins sized for a fingertip rather than a cursor. Read once — a device does
 *  not switch pointer types mid-session in any way that warrants a restyle. */
const COARSE_POINTER =
  typeof window !== "undefined" &&
  window.matchMedia?.("(pointer: coarse)").matches === true;

/** Filter value for the county selection layers when nothing is selected. */
const NO_SELECTION = "__none__";

/** Runs `apply` now if the style is ready, otherwise on the next style load. */
function whenStyled(map: MlMap, apply: () => void): void {
  if (map.isStyleLoaded()) apply();
  else map.once("load", apply);
}

/**
 * Pushes the current filter state onto the map's layers.
 *
 * Split out of its effect because a theme switch replaces every layer, and
 * the new ones have to be told the same things the old ones knew.
 */
function applyFilters(map: MlMap, filters: Filters): void {
  const active = filtersActive(filters);
  const loansFilter = buildLoansFilter(filters) as never;
  map.setFilter("loans-circle", loansFilter);
  // The hit layer must filter identically, or a filtered-out pin would
  // still be tappable through an invisible target.
  map.setFilter("loans-hit", loansFilter);
  // counties-fill and zips-circle show pre-computed aggregates baked in
  // at tile-build time — they can't be re-filtered client-side. Dim them
  // when a filter is active instead of silently ignoring it, so a
  // zoomed-out view doesn't look like the filter did nothing.
  map.setPaintProperty("counties-fill", "fill-opacity", active ? 0.12 : 0.62);
  map.setPaintProperty("zips-circle", "circle-opacity", active ? 0.1 : 0.6);
  // Dim the selection ring alongside its fill, or a highlighted county
  // floats over a dimmed map looking like the filter missed it.
  map.setPaintProperty("counties-selected", "line-opacity", active ? 0.25 : 1);
  map.setPaintProperty("counties-selected-halo", "line-opacity", active ? 0.2 : 0.9);
}

function applySelection(map: MlMap, selectedFips: string | null): void {
  const filter = ["==", ["get", "fips"], selectedFips ?? NO_SELECTION];
  map.setFilter("counties-selected", filter as never);
  map.setFilter("counties-selected-halo", filter as never);
}

function applyTopLoans(map: MlMap, topLoans: LoanRecord[]): void {
  const source = map.getSource("top-loans") as maplibregl.GeoJSONSource | undefined;
  source?.setData(topLoansToGeoJson(topLoans));
}

interface MapViewProps {
  filters: Filters;
  topLoans: LoanRecord[];
  /** Paint the dark basemap. Swapping this restyles the live map in place. */
  dark: boolean;
  initialView: DeepLinkState;
  reducedMotion: boolean;
  selectedFips: string | null;
  onLoanClick: (props: LoanTileProps) => void;
  onCountyClick: (props: CountyTileProps) => void;
  onViewChange: (v: { zoom: number; lat: number; lng: number }) => void;
  onMapReady: (map: MlMap) => void;
}

export function MapView({
  filters,
  topLoans,
  dark,
  initialView,
  reducedMotion,
  selectedFips,
  onLoanClick,
  onCountyClick,
  onViewChange,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);

  // The map-init effect below runs once and wires up event handlers that
  // live for the map's whole lifetime. Route them through refs so they
  // always call the latest callback instead of closing over the props from
  // the render that constructed the map.
  const onLoanClickRef = useRef(onLoanClick);
  const onCountyClickRef = useRef(onCountyClick);
  const onViewChangeRef = useRef(onViewChange);
  const onMapReadyRef = useRef(onMapReady);
  const topLoansRef = useRef(topLoans);
  // The theme effect below rebuilds every layer, so it also has to restore the
  // filter and selection state the replaced layers were carrying.
  const filtersRef = useRef(filters);
  const selectedFipsRef = useRef(selectedFips);
  const darkRef = useRef(dark);
  useEffect(() => {
    onLoanClickRef.current = onLoanClick;
    onCountyClickRef.current = onCountyClick;
    onViewChangeRef.current = onViewChange;
    onMapReadyRef.current = onMapReady;
    topLoansRef.current = topLoans;
    filtersRef.current = filters;
    selectedFipsRef.current = selectedFips;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    fetch(basemapUrl(darkRef.current))
      .then((r) => r.json())
      .then((basemap: StyleSpecification) => {
        if (cancelled || !containerRef.current) return;

        // A deep link must land exactly where it points, immediately —
        // animating it is a bug. Only the cold, no-deep-link load gets the
        // camera move.
        const animateIn =
          !reducedMotion && !initialView.loan && !initialView.fromHash;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: buildMapStyle(basemap, {
            coarsePointer: COARSE_POINTER,
            dark: darkRef.current,
          }),
          center: [initialView.lng, initialView.lat],
          zoom: animateIn ? initialView.zoom - 1.5 : initialView.zoom,
        });
        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl(), "top-right");

        map.on("moveend", () => {
          const c = map.getCenter();
          onViewChangeRef.current({ zoom: map.getZoom(), lat: c.lat, lng: c.lng });
        });

        // Taps land on loans-hit, the padded transparent layer above the
        // drawn pins — the smallest pin is ~2px against a ~44px fingertip.
        map.on("click", "loans-hit", (e) => {
          const feature = e.features?.[0];
          if (feature) onLoanClickRef.current(feature.properties as LoanTileProps);
        });
        map.on("mouseenter", "loans-hit", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "loans-hit", () => {
          map.getCanvas().style.cursor = "";
        });

        // County taps are a zoomed-out gesture: counties-fill stops at
        // COUNTY_MAX_ZOOM, where ZIP dots and then pins take over.
        map.on("click", "counties-fill", (e) => {
          const feature = e.features?.[0];
          if (feature) onCountyClickRef.current(feature.properties as CountyTileProps);
        });
        map.on("mouseenter", "counties-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "counties-fill", () => {
          map.getCanvas().style.cursor = "";
        });

        // top-loans-circle carries the same short-key schema as the tile
        // layer (see topLoansToGeoJson), so a tap here opens an already
        // readable card while the full record is fetched.
        map.on("click", "top-loans-circle", (e) => {
          const feature = e.features?.[0];
          if (feature) {
            onLoanClickRef.current(feature.properties as LoanTileProps);
          }
        });
        map.on("mouseenter", "top-loans-circle", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "top-loans-circle", () => {
          map.getCanvas().style.cursor = "";
        });

        // The top-loans source and its two layers live in buildMapStyle now;
        // only the data arrives late, once top_loans.json resolves.
        const seedTopLoans = () => {
          const source = map.getSource("top-loans") as
            | maplibregl.GeoJSONSource
            | undefined;
          source?.setData(topLoansToGeoJson(topLoansRef.current));
        };
        if (map.isStyleLoaded()) seedTopLoans();
        else map.once("load", seedTopLoans);

        if (animateIn) {
          map.once("load", () => {
            map.easeTo({
              zoom: initialView.zoom,
              duration: 1400,
              easing: (t) => 1 - Math.pow(1 - t, 3),
            });
          });
        }

        onMapReadyRef.current(map);
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Only construct the map once; view/filter updates below are imperative.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenStyled(map, () => applyFilters(map, filters));
  }, [filters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenStyled(map, () => applySelection(map, selectedFips));
  }, [selectedFips]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenStyled(map, () => applyTopLoans(map, topLoans));
  }, [topLoans]);

  // Theme switch. The pin and county colours are chosen against the basemap
  // they sit on, so the two change together or neither does — which means a
  // full setStyle rather than a handful of setPaintProperty calls.
  //
  // setStyle replaces every source and layer, so the camera survives but the
  // filter, the county selection and the top-loans GeoJSON do not: they are
  // pushed back on once the new style has loaded. The effects above are keyed
  // on their own props and will not re-run for a theme change.
  useEffect(() => {
    if (dark === darkRef.current) return;
    darkRef.current = dark;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    fetch(basemapUrl(dark))
      .then((r) => r.json())
      .then((basemap: StyleSpecification) => {
        if (cancelled || mapRef.current !== map) return;
        map.setStyle(
          buildMapStyle(basemap, { coarsePointer: COARSE_POINTER, dark }),
          { diff: false },
        );
        // `on`, not `once`: styledata fires on intermediate states too, and
        // the first one can arrive before the data layers exist. Keep
        // listening until they do, then unsubscribe.
        const restore = () => {
          if (cancelled || mapRef.current !== map) {
            map.off("styledata", restore);
            return;
          }
          if (!map.getLayer("loans-circle")) return;
          map.off("styledata", restore);
          applyFilters(map, filtersRef.current);
          applySelection(map, selectedFipsRef.current);
          applyTopLoans(map, topLoansRef.current);
        };
        map.on("styledata", restore);
      })
      .catch(() => {
        // A basemap that won't load is not worth blanking the map for: the
        // user keeps the theme they could already see.
      });

    return () => {
      cancelled = true;
    };
  }, [dark]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}

export { DEFAULT_VIEW };
