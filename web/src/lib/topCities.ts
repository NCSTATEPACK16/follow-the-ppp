import { TOP_CITIES_URL } from "./config";
import type { CityStats } from "../types";

/**
 * The 10 cities with the most PPP dollars approved, for the trophy panel.
 *
 * Same "precomputed static JSON, not a live query" shape as `getTopLoans` —
 * ten rows never changes, so there is nothing here worth a DuckDB-WASM boot.
 */
let topCitiesPromise: Promise<CityStats[]> | null = null;

export function getTopCities(): Promise<CityStats[]> {
  if (!topCitiesPromise) {
    topCitiesPromise = fetch(TOP_CITIES_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`${TOP_CITIES_URL}: HTTP ${r.status}`);
        return r.json() as Promise<CityStats[]>;
      })
      .catch((err) => {
        topCitiesPromise = null;
        throw err;
      });
  }
  return topCitiesPromise;
}
