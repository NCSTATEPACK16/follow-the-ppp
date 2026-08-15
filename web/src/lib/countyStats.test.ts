import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PAYLOAD = {
  "37183": {
    name: "Wake",
    state: "NC",
    loan_count: 34757,
    sum_approved: 2737662324,
    sum_forgiven: 2665062077,
    median_loan: 20800,
    jobs_reported: 317603,
    state_rank: 2,
    state_n: 100,
    nat_rank: 55,
    pct_state: 15.6,
    forg_rate: 97.3,
    approx_pct: 34.8,
  },
};

// The module caches its fetch in a module-level promise, so each test needs a
// fresh module registry or the second test would see the first one's cache.
async function load() {
  vi.resetModules();
  return import("./countyStats");
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD }));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCountyStats", () => {
  it("returns the record for a known FIPS", async () => {
    const { getCountyStats } = await load();
    const wake = await getCountyStats("37183");
    expect(wake?.name).toBe("Wake");
    expect(wake?.state_rank).toBe(2);
  });

  it("returns null for a county with no statistics", async () => {
    // Connecticut's planning regions and the territories have no TIGER
    // counterpart, so their polygons carry no entry.
    const { getCountyStats } = await load();
    expect(await getCountyStats("09110")).toBeNull();
  });

  it("fetches the payload only once across many lookups", async () => {
    const { getCountyStats } = await load();
    await getCountyStats("37183");
    await getCountyStats("37183");
    await getCountyStats("09110");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("shares one request between concurrent lookups", async () => {
    // Two rapid taps must not each pull a 767KB payload down a phone link.
    const { getCountyStats } = await load();
    await Promise.all([getCountyStats("37183"), getCountyStats("37183")]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects on an HTTP error instead of reporting no statistics", async () => {
    // The payload 404'd on R2 once (it shipped after the last deploy and was
    // never uploaded). Without this check `r.json()` threw on the 404 body and
    // every county rendered the "this county has no PPP statistics" empty
    // state — a transport failure disguised as a fact about the data.
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });
    const { getCountyStats } = await load();
    await expect(getCountyStats("37183")).rejects.toThrow("404");
  });

  it("does not cache a failed response", async () => {
    // A dropped request on a flaky connection must not poison every later
    // tap with a permanently rejected promise.
    fetchSpy.mockRejectedValueOnce(new Error("offline"));
    const { getCountyStats } = await load();
    await expect(getCountyStats("37183")).rejects.toThrow("offline");

    const wake = await getCountyStats("37183");
    expect(wake?.name).toBe("Wake");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
