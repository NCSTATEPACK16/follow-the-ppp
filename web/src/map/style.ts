import type { StyleSpecification } from "maplibre-gl";
import { TILE_URLS } from "../lib/config";

// Basemap: CARTO's free "Positron" vector style — no API key, no billing.
const BASEMAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** County polygons stop where ZIP dots take over. Tiles are built z0–6. */
export const COUNTY_MAX_ZOOM = 7;

/** Radii multiplier on touch input. A fingertip is ~44px; a mouse cursor is 1px. */
const TOUCH_SCALE = 1.4;

/** Extra radius on the invisible tap layer, in px. */
const HIT_PADDING = 8;

const FORGIVEN = "#2a78d6";
const UNFORGIVEN = "#eb6834";
const RING = "#fcfcfb";

/** Pin identity: forgiven or not. Used for fill and, on approximate pins, the ring. */
const STATUS_COLOR = ["case", [">", ["get", "f"], 0], FORGIVEN, UNFORGIVEN];

/**
 * ["interpolate", ["linear"], input, in0, out0 * scale, ...]
 *
 * Every output scales by the same factor so circle *area* keeps encoding
 * dollars — a touch build that scaled stops unevenly would tell a different
 * story than the desktop one.
 */
function radiusRamp(
  input: unknown,
  stops: Array<[number, number]>,
  scale: number,
  padding = 0,
) {
  const ramp: unknown[] = ["interpolate", ["linear"], input];
  for (const [at, radius] of stops) {
    ramp.push(at, radius * scale + padding);
  }
  return ramp;
}

/** sqrt(amount) so area, not radius, reads proportional to dollars. */
const LOAN_RADIUS_INPUT = ["sqrt", ["max", ["/", ["get", "a"], 100], 0]];
const LOAN_RADIUS_STOPS: Array<[number, number]> = [
  [0, 2],
  [30, 3],
  [300, 5.5],
  [3000, 10],
  [30000, 18],
];

const ZIP_RADIUS_INPUT = ["sqrt", ["max", ["get", "sum_approved"], 0]];
const ZIP_RADIUS_STOPS: Array<[number, number]> = [
  [0, 1],
  [300, 3],
  [3000, 10],
  [10000, 22],
];

interface StyleOptions {
  /** True on touch devices — scales pins up to a usable tap size. */
  coarsePointer?: boolean;
}

/**
 * Zoom-driven layer switching: counties (0–7) -> ZIP points (6–10) ->
 * individual loan pins (9+), matching the zoom ranges baked into each pmtiles
 * archive (see scripts/05_tiles.py).
 */
export function buildMapStyle(
  basemap: StyleSpecification,
  { coarsePointer = false }: StyleOptions = {},
): StyleSpecification {
  const scale = coarsePointer ? TOUCH_SCALE : 1;

  return {
    ...basemap,
    sources: {
      ...basemap.sources,
      counties: { type: "vector", url: `pmtiles://${TILE_URLS.counties}` },
      zips: { type: "vector", url: `pmtiles://${TILE_URLS.zips}` },
      loans: { type: "vector", url: `pmtiles://${TILE_URLS.loans}` },
      // Populated imperatively by MapView once top_loans.json resolves.
      "top-loans": {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    layers: [
      ...basemap.layers,

      {
        id: "counties-fill",
        type: "fill",
        source: "counties",
        "source-layer": "counties",
        maxzoom: COUNTY_MAX_ZOOM,
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "sum_approved"],
            0, "#e8f0fb",
            1_000_000, "#c3d9f6",
            10_000_000, "#7fb0e8",
            100_000_000, "#3d7fc9",
            1_000_000_000, "#1d4f8a",
          ],
          // Quieter than the old 0.75: the fill is context for the pins, not
          // the subject.
          "fill-opacity": 0.62,
        },
      },
      {
        id: "counties-line",
        type: "line",
        source: "counties",
        "source-layer": "counties",
        maxzoom: COUNTY_MAX_ZOOM,
        paint: {
          "line-color": "#8a97a8",
          "line-width": 0.6,
          // At national zoom 3,234 borders shout louder than the data they
          // organise. Fade them in as counties become individually readable.
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3, 0.05,
            5, 0.22,
            6.5, 0.4,
          ],
        },
      },
      // Selection: a light halo under a dark ring, so it holds against both
      // the palest and the darkest fill. Filter is swapped by MapView.
      {
        id: "counties-selected-halo",
        type: "line",
        source: "counties",
        "source-layer": "counties",
        maxzoom: COUNTY_MAX_ZOOM,
        filter: ["==", ["get", "fips"], "__none__"],
        paint: { "line-color": RING, "line-width": 4.5, "line-opacity": 0.9 },
      },
      {
        id: "counties-selected",
        type: "line",
        source: "counties",
        "source-layer": "counties",
        maxzoom: COUNTY_MAX_ZOOM,
        filter: ["==", ["get", "fips"], "__none__"],
        paint: { "line-color": "#12263f", "line-width": 2.2 },
      },

      {
        id: "zips-circle",
        type: "circle",
        source: "zips",
        "source-layer": "zips",
        minzoom: 6,
        maxzoom: 10,
        paint: {
          "circle-radius": radiusRamp(ZIP_RADIUS_INPUT, ZIP_RADIUS_STOPS, scale),
          "circle-color": "#1c5cab",
          // Cross-fade out as individual pins fade in, so blue ZIP aggregates
          // and blue "forgiven" pins never read as the same encoding.
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 10, 0],
          "circle-stroke-width": 1,
          "circle-stroke-color": RING,
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.7, 10, 0],
        },
      },

      {
        id: "loans-circle",
        type: "circle",
        source: "loans",
        "source-layer": "loans",
        minzoom: 9,
        paint: {
          "circle-radius": radiusRamp(LOAN_RADIUS_INPUT, LOAN_RADIUS_STOPS, scale),
          // Blue/orange, not green/red: green/red measured CVD deltaE 6.0
          // under deuteranopia and imposes a moral reading the project
          // disowns — an unforgiven loan is frequently just one that was
          // repaid. See docs/design-spec.md §3.2.
          "circle-color": STATUS_COLOR,
          // Approximate points stay visibly translucent — they must never
          // look identical to a rooftop-precision pin.
          "circle-opacity": [
            "case",
            ["==", ["get", "p"], "zip_centroid"], 0.28,
            ["==", ["get", "p"], "street"], 0.62,
            0.9,
          ],
          // A light ring on every pin is the single biggest legibility win in
          // dense clusters: without it two $2M loans and one $4M loan look
          // identical. Approximate pins ring in their own status hue instead,
          // so precision stops competing with the forgiveness encoding the
          // way the old grey outline did.
          "circle-stroke-width": 1.6,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "p"], "zip_centroid"], STATUS_COLOR,
            ["==", ["get", "p"], "none"], STATUS_COLOR,
            RING,
          ],
        },
      },
      // Invisible tap target. The smallest drawn pin is ~2px against a ~44px
      // fingertip; padding the hit area keeps small loans reachable without
      // drawing them larger, which would break area-encodes-dollars.
      {
        id: "loans-hit",
        type: "circle",
        source: "loans",
        "source-layer": "loans",
        minzoom: 9,
        paint: {
          "circle-radius": radiusRamp(
            LOAN_RADIUS_INPUT,
            LOAN_RADIUS_STOPS,
            scale,
            HIT_PADDING,
          ),
          "circle-opacity": 0,
          "circle-color": "#000000",
        },
      },

      // Halo lives only here. On the dense loans layer these merge into a
      // wash that reads as density the data does not contain; across ~100
      // widely spaced top loans it reads as emphasis.
      {
        id: "top-loans-halo",
        type: "circle",
        source: "top-loans",
        paint: {
          "circle-radius": 20 * scale,
          "circle-color": STATUS_COLOR,
          "circle-blur": 0.9,
          "circle-opacity": 0.4,
        },
      },
      {
        id: "top-loans-circle",
        type: "circle",
        source: "top-loans",
        paint: {
          // Emphasis via size + ring, not a third hue: gold #f0b400 failed the
          // lightness band and sat at 1.79:1 on the light basemap. See
          // docs/design-spec.md §3.5.
          "circle-radius": 11 * scale,
          "circle-color": STATUS_COLOR,
          "circle-opacity": 0.92,
          "circle-stroke-width": 2,
          "circle-stroke-color": RING,
        },
      },
    ],
  } as StyleSpecification;
}

export { BASEMAP_STYLE_URL };
