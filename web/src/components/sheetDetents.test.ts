import { describe, expect, it } from "vitest";
import { DETENT_COUNT, resolveDetent } from "./sheetDetents";

// Detents run 0 = peek, 1 = half, 2 = full. Screen coordinates grow downward,
// so dragging UP (revealing more sheet) is a NEGATIVE dy.
const up = (px: number) => -px;
const down = (px: number) => px;

describe("resolveDetent", () => {
  it("stays put when the drag is too small to be intentional", () => {
    expect(resolveDetent({ from: 1, dy: up(8), velocity: 0 })).toBe(1);
  });

  it("advances one detent on a decisive upward drag", () => {
    expect(resolveDetent({ from: 0, dy: up(120), velocity: 0 })).toBe(1);
  });

  it("retreats one detent on a decisive downward drag", () => {
    expect(resolveDetent({ from: 2, dy: down(120), velocity: 0 })).toBe(1);
  });

  it("moves on a fast flick even when the distance is short", () => {
    // A flick is the natural gesture on a phone; requiring distance as well
    // would make the sheet feel stuck.
    expect(resolveDetent({ from: 0, dy: up(20), velocity: -2 })).toBe(1);
  });

  it("ignores a fast flick in the opposite direction to the drag", () => {
    expect(resolveDetent({ from: 1, dy: up(6), velocity: 0.05 })).toBe(1);
  });

  it("never goes below the peek detent", () => {
    expect(resolveDetent({ from: 0, dy: down(400), velocity: 3 })).toBe(0);
  });

  it("never goes above the full detent", () => {
    expect(resolveDetent({ from: DETENT_COUNT - 1, dy: up(400), velocity: -3 })).toBe(
      DETENT_COUNT - 1,
    );
  });

  it("moves at most one detent per gesture", () => {
    // Snapping two levels on one drag makes the sheet feel like it slipped.
    expect(resolveDetent({ from: 0, dy: up(900), velocity: -5 })).toBe(1);
  });
});
