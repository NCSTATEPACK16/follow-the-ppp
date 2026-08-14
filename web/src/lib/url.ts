import { DEFAULT_VIEW } from "./config";

export interface DeepLinkState {
  loan: string | null;
  zoom: number;
  lat: number;
  lng: number;
}

/** Parse `?loan=<id>` and `#<zoom>/<lat>/<lng>` from the current URL. */
export function parseDeepLink(): DeepLinkState {
  const params = new URLSearchParams(window.location.search);
  const loan = params.get("loan");

  let zoom = DEFAULT_VIEW.zoom;
  let lat = DEFAULT_VIEW.center[1];
  let lng = DEFAULT_VIEW.center[0];

  const hash = window.location.hash.replace(/^#/, "");
  const parts = hash.split("/").map(Number);
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    [zoom, lat, lng] = parts;
  }

  return { loan, zoom, lat, lng };
}

/** Write the current view + selected loan back into the URL without a page reload. */
export function writeDeepLink(state: {
  loan: string | null;
  zoom: number;
  lat: number;
  lng: number;
}) {
  const params = new URLSearchParams(window.location.search);
  if (state.loan) {
    params.set("loan", state.loan);
  } else {
    params.delete("loan");
  }
  const search = params.toString();
  const hash = `#${state.zoom.toFixed(2)}/${state.lat.toFixed(5)}/${state.lng.toFixed(5)}`;
  const url = `${window.location.pathname}${search ? `?${search}` : ""}${hash}`;
  window.history.replaceState(null, "", url);
}
