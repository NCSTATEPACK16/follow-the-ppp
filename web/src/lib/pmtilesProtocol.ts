import { Protocol } from "pmtiles";
import maplibregl from "maplibre-gl";

let registered = false;

/** Register the pmtiles:// protocol with MapLibre exactly once. */
export function ensurePmtilesProtocol() {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}
