import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ensurePmtilesProtocol } from "../lib/pmtilesProtocol";
import { buildMapStyle, BASEMAP_STYLE_URL } from "./style";
import { buildLoansFilter, filtersActive } from "./filters";
import { DEFAULT_VIEW } from "../lib/config";
import type { DeepLinkState } from "../lib/url";
import type { Filters, LoanRecord, LoanTileProps } from "../types";

ensurePmtilesProtocol();

function topLoansToGeoJson(loans: LoanRecord[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: loans.map((loan) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [loan.lng, loan.lat] },
      properties: { id: loan.loan_number },
    })),
  };
}

interface MapViewProps {
  filters: Filters;
  topLoans: LoanRecord[];
  initialView: DeepLinkState;
  onLoanClick: (props: LoanTileProps) => void;
  onViewChange: (v: { zoom: number; lat: number; lng: number }) => void;
  onMapReady: (map: MlMap) => void;
}

export function MapView({
  filters,
  topLoans,
  initialView,
  onLoanClick,
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
  const onViewChangeRef = useRef(onViewChange);
  const onMapReadyRef = useRef(onMapReady);
  const topLoansRef = useRef(topLoans);
  useEffect(() => {
    onLoanClickRef.current = onLoanClick;
    onViewChangeRef.current = onViewChange;
    onMapReadyRef.current = onMapReady;
    topLoansRef.current = topLoans;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    fetch(BASEMAP_STYLE_URL)
      .then((r) => r.json())
      .then((basemap: StyleSpecification) => {
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: buildMapStyle(basemap),
          center: [initialView.lng, initialView.lat],
          zoom: initialView.zoom,
        });
        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl(), "top-right");

        map.on("moveend", () => {
          const c = map.getCenter();
          onViewChangeRef.current({ zoom: map.getZoom(), lat: c.lat, lng: c.lng });
        });

        map.on("click", "loans-circle", (e) => {
          const feature = e.features?.[0];
          if (feature) onLoanClickRef.current(feature.properties as LoanTileProps);
        });
        map.on("mouseenter", "loans-circle", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "loans-circle", () => {
          map.getCanvas().style.cursor = "";
        });

        // top-loans-circle carries only the loan id (see topLoansToGeoJson) —
        // that's all onLoanClick needs, since DetailCard re-fetches the full
        // record by loan number regardless of how it was opened.
        map.on("click", "top-loans-circle", (e) => {
          const feature = e.features?.[0];
          if (feature) {
            onLoanClickRef.current({ id: feature.properties?.id } as LoanTileProps);
          }
        });
        map.on("mouseenter", "top-loans-circle", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "top-loans-circle", () => {
          map.getCanvas().style.cursor = "";
        });

        const addTopLoansLayer = () => {
          map.addSource("top-loans", {
            type: "geojson",
            data: topLoansToGeoJson(topLoansRef.current),
          });
          map.addLayer({
            id: "top-loans-circle",
            type: "circle",
            source: "top-loans",
            paint: {
              "circle-radius": 7,
              "circle-color": "#f0b400",
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#7a5b00",
            },
          });
        };
        if (map.isStyleLoaded()) addTopLoansLayer();
        else map.once("load", addTopLoansLayer);

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
    const active = filtersActive(filters);

    const apply = () => {
      map.setFilter("loans-circle", buildLoansFilter(filters) as never);
      // counties-fill and zips-circle show pre-computed aggregates baked in
      // at tile-build time — they can't be re-filtered client-side. Dim them
      // when a filter is active instead of silently ignoring it, so a
      // zoomed-out view doesn't look like the filter did nothing.
      map.setPaintProperty("counties-fill", "fill-opacity", active ? 0.12 : 0.75);
      map.setPaintProperty("zips-circle", "circle-opacity", active ? 0.1 : 0.6);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [filters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource("top-loans") as maplibregl.GeoJSONSource | undefined;
      source?.setData(topLoansToGeoJson(topLoans));
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [topLoans]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}

export { DEFAULT_VIEW };
