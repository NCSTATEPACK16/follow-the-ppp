import { useSyncExternalStore } from "react";

/**
 * Below this the sidebar covers most of the screen, so the app switches to
 * the mobile shell. Matches the existing 640px breakpoint in App.css.
 */
const MOBILE_QUERY = "(max-width: 640px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * True on phone-width viewports. Reactive rather than read once at module
 * load: rotating a phone crosses the breakpoint, and a stale read would
 * strand the user in the wrong component tree until they reloaded.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
