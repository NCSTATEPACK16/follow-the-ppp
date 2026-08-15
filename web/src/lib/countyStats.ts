import { COUNTY_STATS_URL } from "./config";
import type { CountyStats } from "../types";

/**
 * Per-county aggregates for the county sheet.
 *
 * The county tiles carry only what the choropleth needs; ranks, state share,
 * median loan, jobs and the precision mix live in a separate ~144KB (gzipped)
 * payload so tiles stay small. It is fetched on the first county tap rather
 * than at page load — most visitors never tap a county, and those who do are
 * often on a phone.
 */
let statsPromise: Promise<Record<string, CountyStats>> | null = null;

function loadAll(): Promise<Record<string, CountyStats>> {
  if (!statsPromise) {
    statsPromise = fetch(COUNTY_STATS_URL)
      .then((r) => r.json() as Promise<Record<string, CountyStats>>)
      .catch((err) => {
        // Never leave a rejected promise cached: on a flaky connection that
        // would poison every later tap for the rest of the session.
        statsPromise = null;
        throw err;
      });
  }
  return statsPromise;
}

/**
 * Statistics for one county, or null when it has none. Connecticut's
 * post-2022 planning regions and the territories have no TIGER counterpart,
 * so their polygons are present on the map but carry no entry here.
 */
export async function getCountyStats(fips: string): Promise<CountyStats | null> {
  const all = await loadAll();
  return all[fips] ?? null;
}

/**
 * How many counties a national rank is out of.
 *
 * Counted from the payload rather than hard-coded: it is the number of
 * counties that actually have statistics, which is not the 3,234 polygons on
 * the map — Connecticut's planning regions and the territories have no TIGER
 * counterpart. "#55 of 3,226" is the honest denominator.
 */
export async function getNationalCount(): Promise<number> {
  return Object.keys(await loadAll()).length;
}
