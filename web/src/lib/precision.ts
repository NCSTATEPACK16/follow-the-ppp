import type { GeoPrecision } from "../types";

/** Plain-language disclosure for the detail card. Never let a reader mistake an approximate point for an exact one. */
export function precisionLabel(p: GeoPrecision): string {
  switch (p) {
    case "rooftop":
      return "Exact — matched to the reported business address.";
    case "street":
      return "Approximate — matched to the street, exact house number estimated.";
    case "zip_centroid":
      return "Approximate — only the ZIP code is known. This point is placed near the center of the ZIP and does not indicate a specific address.";
    case "none":
      return "No usable location for this record.";
  }
}

export function isApproximate(p: GeoPrecision): boolean {
  return p === "zip_centroid" || p === "street";
}
