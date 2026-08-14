import { describe, expect, it } from "vitest";
import {
  formatCompactAmount,
  formatFullAmount,
  isForgiven,
  spokenAmount,
} from "./format";

describe("formatCompactAmount", () => {
  it("abbreviates millions to two decimals", () => {
    expect(formatCompactAmount(1_284_500)).toBe("$1.28M");
  });

  it("abbreviates thousands", () => {
    expect(formatCompactAmount(24_500)).toBe("$24.5K");
  });

  it("leaves small amounts intact", () => {
    expect(formatCompactAmount(950)).toBe("$950");
  });

  it("handles zero", () => {
    expect(formatCompactAmount(0)).toBe("$0");
  });
});

describe("formatFullAmount", () => {
  it("groups thousands", () => {
    expect(formatFullAmount(1_284_500)).toBe("$1,284,500");
  });
});

describe("spokenAmount", () => {
  it("renders a screen-reader-friendly full figure", () => {
    expect(spokenAmount(1_284_500)).toBe("1,284,500 dollars");
  });
});

describe("isForgiven", () => {
  it("is true for a positive forgiven amount", () => {
    expect(isForgiven({ forgiven_amount: 5 })).toBe(true);
  });

  it("is false for zero", () => {
    expect(isForgiven({ forgiven_amount: 0 })).toBe(false);
  });

  it("is false for null", () => {
    expect(isForgiven({ forgiven_amount: null })).toBe(false);
  });
});
