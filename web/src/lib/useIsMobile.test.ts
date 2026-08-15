// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./useIsMobile";

/** jsdom ships no matchMedia. This one lets a test flip the match at will. */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let matches = initial;
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return matches;
    },
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
      listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
      listeners.delete(cb),
  }));
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useIsMobile", () => {
  it("reports the viewport state on first render", () => {
    stubMatchMedia(true);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);
  });

  it("reports false on a wide viewport", () => {
    stubMatchMedia(false);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
  });

  it("reacts to a viewport change without a reload", () => {
    // Rotating a phone crosses the breakpoint. Reading matchMedia once at
    // module load would strand the user in the wrong component tree.
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });

  it("detaches its listener on unmount", () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(media.listenerCount).toBe(0);
  });
});
