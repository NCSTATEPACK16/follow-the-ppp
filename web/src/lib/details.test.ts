// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLoanDetail, getRandomLoanDetail } from "./details";

/** One shard, in the exact shape scripts/07b_detail_shards.py writes. */
const SHARD = {
  c: [
    "borrower_name",
    "city",
    "state",
    "zip",
    "naics",
    "business_type",
    "jobs_reported",
    "date_approved",
    "approved_amount",
    "forgiven_amount",
    "loan_status",
    "originating_lender",
    "lat",
    "lng",
    "geo_precision",
  ],
  r: {
    "007108": [
      "KNIGHTDALE STATION PRESCHOOL, INC.",
      "KNIGHTDALE",
      "NC",
      "27545-7290",
      "624410",
      "Corporation",
      12,
      "2020-04-14",
      75200,
      75911.2,
      "Paid in Full",
      "United Bank",
      35.78,
      -78.48,
      "rooftop",
    ],
  },
};

let fetched: string[] = [];

beforeEach(() => {
  fetched = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      return { ok: true, status: 200, json: async () => SHARD } as Response;
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("getLoanDetail", () => {
  it("derives the shard filename from the loan number with no index fetch", async () => {
    // The whole point of prefix sharding: one round trip, and the one that
    // happens is the one carrying the answer.
    await getLoanDetail("1000007108");
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toContain("/1000.json.gz");
  });

  it("rebuilds a full record from the positional row", async () => {
    const loan = await getLoanDetail("1000007108");
    expect(loan).toMatchObject({
      loan_number: "1000007108",
      borrower_name: "KNIGHTDALE STATION PRESCHOOL, INC.",
      city: "KNIGHTDALE",
      state: "NC",
      originating_lender: "United Bank",
      jobs_reported: 12,
      approved_amount: 75200,
      geo_precision: "rooftop",
    });
  });

  it("passes an ISO date straight through rather than reading it as epoch ms", async () => {
    // The DuckDB path hands over epoch milliseconds; the shards hand over
    // "2020-04-14". One shared decoder has to survive both.
    const loan = await getLoanDetail("1000007108");
    expect(loan?.date_approved).toBe("2020-04-14");
  });

  it("returns null for a loan the release does not contain", async () => {
    expect(await getLoanDetail("1000999999")).toBeNull();
  });

  it("serves a second loan in the same shard without fetching again", async () => {
    // A distinct prefix per test: the shard cache is module state and
    // deliberately outlives any one call, so tests must not share a shard.
    await getLoanDetail("3000007108");
    await getLoanDetail("3000007108");
    expect(fetched).toHaveLength(1);
  });

  it("does not cache a failed fetch, so the next tap retries", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValue({ ok: true, status: 200, json: async () => SHARD }),
    );
    await expect(getLoanDetail("2000007108")).rejects.toThrow();
    // A cached rejection would make one dropped request permanent for the
    // whole session.
    expect(await getLoanDetail("2000007108")).toMatchObject({ state: "NC" });
  });
});

describe("getRandomLoanDetail", () => {
  it("reads one shard and returns a loan whose number matches its shard", async () => {
    // Pinned, or the draw could land on a prefix another test already cached
    // and this would assert a fetch that legitimately never happened.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const loan = await getRandomLoanDetail();
    expect(fetched).toHaveLength(1);
    expect(loan).not.toBeNull();
    // Shard name + record key must reassemble the real loan number, or the
    // deep link the random button writes points at nothing.
    const prefix = fetched[0].match(/\/(\d{4})\.json\.gz$/)?.[1];
    expect(loan!.loan_number).toBe(`${prefix}007108`);
  });
});
