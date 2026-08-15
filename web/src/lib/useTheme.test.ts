// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialTheme, useTheme } from "./useTheme";

/** jsdom has no matchMedia; stand one in that reports a fixed OS preference. */
function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: dark && query.includes("dark"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

/** This jsdom build serves an opaque origin, where localStorage is absent. */
function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

beforeEach(() => {
  stubStorage();
  delete document.documentElement.dataset.theme;
  mockSystemDark(false);
});

afterEach(() => vi.unstubAllGlobals());

describe("initialTheme", () => {
  it("follows the OS when the visitor has never chosen", () => {
    mockSystemDark(true);
    expect(initialTheme()).toBe("dark");
  });

  it("prefers a stored choice over the OS", () => {
    mockSystemDark(true);
    window.localStorage.setItem("ppp-theme", "light");
    expect(initialTheme()).toBe("light");
  });

  it("ignores a junk stored value rather than passing it through", () => {
    window.localStorage.setItem("ppp-theme", "neon");
    expect(initialTheme()).toBe("light");
  });
});

describe("useTheme", () => {
  it("publishes the theme to the document so CSS and form controls follow", () => {
    renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("toggles, remembers the choice, and repaints the document", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());

    expect(result.current.theme).toBe("dark");
    expect(window.localStorage.getItem("ppp-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
