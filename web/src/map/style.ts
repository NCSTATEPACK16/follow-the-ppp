import type { StyleSpecification } from "maplibre-gl";
import { TILE_URLS } from "../lib/config";

// Basemap: CARTO's free "Positron" vector style — no API key, no billing.
const BASEMAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/**
 * Zoom-driven layer switching: counties (0-6) -> ZIP points (6-9) -> individual
 * loan pins (9-14+), matching the zoom ranges baked into each pmtiles archive
 * (see scripts/05_tiles.py). Circle radius encodes sqrt(amount) so *area*
 * reads proportionally to dollars, not radius.
 */
export function buildMapStyle(basemap: StyleSpecification): StyleSpecification {
  return {
    ...basemap,
    sources: {
      ...basemap.sources,
      counties: {
        type: "vector",
        url: `pmtiles://${TILE_URLS.counties}`,
      },
      zips: {
        type: "vector",
        url: `pmtiles://${TILE_URLS.zips}`,
      },
      loans: {
        type: "vector",
        url: `pmtiles://${TILE_URLS.loans}`,
      },
    },
    layers: [
      ...basemap.layers,
      {
        id: "counties-fill",
        type: "fill",
        source: "counties",
        "source-layer": "counties",
        maxzoom: 7,
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "sum_approved"],
            0,
            "#cde2fb",
            1_000_000,
            "#86b6ef",
            10_000_000,
            "#3987e5",
            100_000_000,
            "#1c5cab",
            1_000_000_000,
            "#0d366b",
          ],
          "fill-opacity": 0.75,
          "fill-outline-color": "#ffffff",
        },
      },
      {
        id: "zips-circle",
        type: "circle",
        source: "zips",
        "source-layer": "zips",
        minzoom: 6,
        maxzoom: 10,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["sqrt", ["max", ["get", "sum_approved"], 0]],
            0,
            1,
            300,
            3,
            3000,
            10,
            10000,
            22,
          ],
          "circle-color": "#1c5cab",
          // Cross-fade out as individual pins fade in (loans-circle minzoom 9).
          // Without this, blue ZIP aggregates and blue "forgiven" pins overlap
          // at z9-10 and read as the same encoding. Also one fewer layer
          // drawing at z10.
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            0.6,
            10,
            0,
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0d366b",
        },
      },
      {
        id: "loans-circle",
        type: "circle",
        source: "loans",
        "source-layer": "loans",
        minzoom: 9,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["sqrt", ["max", ["/", ["get", "a"], 100], 0]],
            0,
            1.5,
            30,
            2.5,
            300,
            5,
            3000,
            10,
            30000,
            18,
          ],
          // Identity by forgiveness state. Blue/orange, not green/red:
          // green/red measured CVD deltaE 6.0 under deuteranopia (unusable
          // for ~8% of male visitors) and green="good"/red="bad" imposes a
          // moral reading the project explicitly disowns — an unforgiven
          // loan is frequently just a loan that was repaid.
          // See docs/design-spec.md §3.2.
          "circle-color": [
            "case",
            [">", ["get", "f"], 0],
            "#2a78d6",
            "#eb6834",
          ],
          // Approximate-precision points (zip_centroid / street) render
          // hollow and translucent so they never look identical to a
          // rooftop-precision pin.
          "circle-opacity": [
            "case",
            ["==", ["get", "p"], "zip_centroid"],
            0.25,
            ["==", ["get", "p"], "street"],
            0.55,
            0.85,
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "p"], "zip_centroid"],
            1.5,
            0,
          ],
          "circle-stroke-color": "#52514e",
        },
      },
    ],
  } as StyleSpecification;
}

export { BASEMAP_STYLE_URL };
