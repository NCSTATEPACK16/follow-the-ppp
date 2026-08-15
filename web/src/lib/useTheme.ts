import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "ppp-theme";

/**
 * The theme the page should paint before React mounts.
 *
 * Read outside the component so the very first render already knows: the map
 * style is chosen once at construction, and a light basemap that flips to dark
 * a frame later is a flash of the wrong map, not a transition.
 */
export function initialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Safari private browsing throws on localStorage. Fall through to system.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Publishes the theme to the document so CSS (and the UA form controls) follow. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Light/dark with an explicit user choice remembered across visits.
 *
 * Until the user picks, the OS setting wins and keeps winning — a visitor who
 * switches their phone to dark at sunset gets the dark map without having
 * touched this app. Once they choose here, that choice sticks and the OS stops
 * overriding it.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        stored = null;
      }
      // An explicit choice outranks the OS; without one, follow it live.
      if (stored !== "light" && stored !== "dark") setTheme(e.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not being able to remember the choice is not a reason to refuse it.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
