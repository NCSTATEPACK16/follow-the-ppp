import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { basemapUrl, buildMapStyle, COUNTY_MAX_ZOOM } from "./style";

const BASEMAP = {
  version: 8,
  name: "test",
  sources: { basetiles: { type: "raster", tiles: [] } },
  layers: [{ id: "background", type: "background" }],
} as unknown as StyleSpecification;

function layer(style: StyleSpecification, id: string) {
  const found = style.layers.find((l) => l.id === id);
  if (!found) throw new Error(`no layer ${id} in ${style.layers.map((l) => l.id)}`);
  return found as never as { paint: Record<string, unknown>; filter?: unknown[] } & Record<
    string,
    unknown
  >;
}

/** Pull the output stops out of ["interpolate", interp, input, in, out, ...]. */
function outputs(expr: unknown): number[] {
  const parts = expr as unknown[];
  return parts.slice(4).filter((_, i) => i % 2 === 0) as number[];
}

describe("loan pins", () => {
  it("rings every pin so overlapping loans stay countable", () => {
    const paint = layer(buildMapStyle(BASEMAP), "loans-circle").paint;
    expect(paint["circle-stroke-width"]).toBeTruthy();
    expect(paint["circle-stroke-color"]).toBeTruthy();
  });

  it("scales radii up for touch input", () => {
    const fine = outputs(layer(buildMapStyle(BASEMAP), "loans-circle").paint["circle-radius"]);
    const coarse = outputs(
      layer(buildMapStyle(BASEMAP, { coarsePointer: true }), "loans-circle").paint[
        "circle-radius"
      ],
    );
    expect(coarse.length).toBe(fine.length);
    coarse.forEach((r, i) => expect(r).toBeGreaterThan(fine[i]));
  });

  it("keeps area proportional to dollars by scaling every stop equally", () => {
    // Area encodes the loan amount. Scaling stops unevenly would make the
    // touch build tell a different story than the desktop one.
    const fine = outputs(layer(buildMapStyle(BASEMAP), "loans-circle").paint["circle-radius"]);
    const coarse = outputs(
      layer(buildMapStyle(BASEMAP, { coarsePointer: true }), "loans-circle").paint[
        "circle-radius"
      ],
    );
    const ratios = coarse.map((r, i) => r / fine[i]);
    ratios.forEach((r) => expect(r).toBeCloseTo(ratios[0], 5));
  });

  it("distinguishes approximate pins by hue rather than a grey outline", () => {
    // Grey competed with the blue/orange forgiveness encoding. Precision now
    // rides on the pin's own status colour.
    const paint = layer(buildMapStyle(BASEMAP), "loans-circle").paint;
    expect(JSON.stringify(paint["circle-stroke-color"])).toContain("zip_centroid");
  });
});

describe("dark theme", () => {
  it("serves a different basemap per theme", () => {
    expect(basemapUrl(true)).not.toBe(basemapUrl(false));
    expect(basemapUrl(true)).toContain("dark-matter");
  });

  it("keeps brighter meaning more dollars on the dark ramp too", () => {
    // Inverting the light ramp would put the palest fill on the *smallest*
    // county totals over a dark ground, which reads as more, not less.
    const stops = layer(buildMapStyle(BASEMAP, { dark: true }), "counties-fill").paint[
      "fill-color"
    ] as unknown[];
    const colors = stops.slice(4).filter((_, i) => i % 2 === 0) as string[];
    const luminance = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    colors.forEach((c, i) => {
      if (i > 0) expect(luminance(c)).toBeGreaterThan(luminance(colors[i - 1]));
    });
  });

  it("takes the spec's dark pin steps rather than filtering the light ones", () => {
    // docs/design-spec.md §3.7. Blue/orange stays the forgiveness encoding in
    // both themes (§3.2), but the steps that hold against a near-black
    // basemap are not the ones picked against a near-white one.
    const color = JSON.stringify(
      layer(buildMapStyle(BASEMAP, { dark: true }), "loans-circle").paint["circle-color"],
    );
    expect(color).toContain("#3987e5");
    expect(color).toContain("#d95926");
    expect(color).not.toContain("#eb6834");
  });

  it("rings pins in the ground colour, not a fixed white", () => {
    const stroke = (dark: boolean) =>
      JSON.stringify(
        layer(buildMapStyle(BASEMAP, { dark }), "top-loans-circle").paint[
          "circle-stroke-color"
        ],
      );
    expect(stroke(true)).not.toBe(stroke(false));
  });
});

describe("hit targets", () => {
  it("adds a transparent hit layer larger than the drawn pin", () => {
    const style = buildMapStyle(BASEMAP);
    const hit = layer(style, "loans-hit");
    expect(hit.paint["circle-opacity"]).toBe(0);

    const drawn = outputs(layer(style, "loans-circle").paint["circle-radius"]);
    const target = outputs(hit.paint["circle-radius"]);
    target.forEach((r, i) => expect(r).toBeGreaterThan(drawn[i]));
  });

  it("puts the hit layer above the pins so it wins the tap", () => {
    const ids = buildMapStyle(BASEMAP).layers.map((l) => l.id);
    expect(ids.indexOf("loans-hit")).toBeGreaterThan(ids.indexOf("loans-circle"));
  });
});

describe("top loans emphasis", () => {
  it("blurs only the top-loans layer, never the dense pin layer", () => {
    // Halos on the dense layer merge into a wash that reads as density the
    // data does not contain. See the spec's Stage 2 note.
    const style = buildMapStyle(BASEMAP);
    expect(layer(style, "loans-circle").paint["circle-blur"]).toBeUndefined();
    expect(layer(style, "top-loans-halo").paint["circle-blur"]).toBeGreaterThan(0);
  });
});

describe("counties", () => {
  it("fades borders in by zoom instead of drawing them at national scale", () => {
    const paint = layer(buildMapStyle(BASEMAP), "counties-line").paint;
    const opacity = outputs(paint["line-opacity"]);
    expect(opacity[0]).toBeLessThan(opacity[opacity.length - 1]);
  });

  it("carries a selection layer that starts matching nothing", () => {
    const selected = layer(buildMapStyle(BASEMAP), "counties-selected");
    expect(JSON.stringify(selected.filter)).toContain("fips");
  });

  it("stops the county layers at the zoom where ZIP dots take over", () => {
    const style = buildMapStyle(BASEMAP);
    for (const id of ["counties-fill", "counties-line", "counties-selected"]) {
      expect(layer(style, id).maxzoom).toBe(COUNTY_MAX_ZOOM);
    }
  });
});
