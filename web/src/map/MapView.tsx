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
      // `f` mirrors the tile layer's short key so both layers can share one
      // color expression.
      properties: { id: loan.loan_number, f: loan.forgiven_amount ?? 0 },
    })),
  };
}

interface MapViewProps {
  filters: Filters;
  topLoans: LoanRecord[];
  initialView: DeepLinkState;
  reducedMotion: boolean;
  onLoanClick: (props: LoanTileProps) => void;
  onViewChange: (v: { zoom: number; lat: number; lng: number }) => void;
  onMapReady: (map: MlMap) => void;
}

export function MapView({
  filters,
  topLoans,
  initialView,
  reducedMotion,
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

        // A deep link must land exactly where it points, immediately —
        // animating it is a bug. Only the cold, no-deep-link load gets the
        // camera move.
        const animateIn =
          !reducedMotion && !initialView.loan && !initialView.fromHash;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: buildMapStyle(basemap),
          center: [initialView.lng, initialView.lat],
          zoom: animateIn ? initialView.zoom - 1.5 : initialView.zoom,
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
              // Emphasis via size + ring, not a third hue: gold #f0b400
              // failed the lightness band (L 0.803) and sat at 1.79:1
              // contrast on the light basemap. Size and ring compose with
              // the status color instead of overriding it, keeping the map
              // at two hues. See docs/design-spec.md §3.5.
              "circle-radius": 11,
              "circle-color": [
                "case",
                [">", ["get", "f"], 0],
                "#2a78d6",
                "#eb6834",
              ],
              "circle-opacity": 0.9,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fcfcfb",
            },
          });
        };
        if (map.isStyleLoaded()) addTopLoansLayer();
        else map.once("load", addTopLoansLayer);

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
