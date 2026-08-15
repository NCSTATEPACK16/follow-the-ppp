// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DetailCard } from "./DetailCard";
import type { LoanRecord, LoanTileProps } from "../types";

vi.mock("../lib/search", () => ({ getLoanByNumber: vi.fn() }));

import { getLoanByNumber } from "../lib/search";

const mocked = vi.mocked(getLoanByNumber);

/** What a tap on the `loans` tile layer hands over. Amounts are integer cents. */
const TILE: LoanTileProps = {
  id: "9547278308",
  n: "CAROLINA BREWERY LLC",
  a: 342_500_00,
  f: 344_812_00,
  s: "Paid in Full",
  nc: "72",
  p: "rooftop",
};

const RECORD: LoanRecord = {
  loan_number: "9547278308",
  borrower_name: "CAROLINA BREWERY LLC",
  city: "PITTSBORO",
  state: "NC",
  zip: "27312",
  naics: "722511",
  business_type: "Limited  Liability Company(LLC)",
  jobs_reported: 41,
  date_approved: "2021-02-04",
  approved_amount: 342_500,
  forgiven_amount: 344_812,
  loan_status: "Paid in Full",
  originating_lender: "First Bank",
  lat: 35.72,
  lng: -79.18,
  geo_precision: "rooftop",
};

beforeEach(() => vi.clearAllMocks());

describe("DetailCard", () => {
  it("paints the tile's own fields before the record query returns", () => {
    // The pin that was tapped already carries the name, the amount and the
    // forgiveness status. Waiting on a 500MB remote parquet to show them is a
    // second of blank panel for data the client already holds.
    mocked.mockReturnValue(new Promise(() => {}));
    render(<DetailCard loanNumber={TILE.id} tile={TILE} onClose={() => {}} />);

    expect(screen.getByText("CAROLINA BREWERY LLC")).toBeTruthy();
    expect(screen.getByText("$342,500")).toBeTruthy();
    expect(screen.getByText(/Forgiven/)).toBeTruthy();
  });

  it("fills in the fields the tile cannot carry once the record lands", async () => {
    mocked.mockResolvedValue(RECORD);
    render(<DetailCard loanNumber={TILE.id} tile={TILE} onClose={() => {}} />);

    expect(await screen.findByText("First Bank")).toBeTruthy();
    expect(screen.getByText(/PITTSBORO, NC/)).toBeTruthy();
  });

  it("still shows the tile's figures when the record lookup fails", async () => {
    // A dropped query must not blank out a panel that was already readable.
    mocked.mockRejectedValue(new Error("network"));
    render(<DetailCard loanNumber={TILE.id} tile={TILE} onClose={() => {}} />);

    expect(await screen.findByText(/couldn't load the full record/i)).toBeTruthy();
    expect(screen.getByText("CAROLINA BREWERY LLC")).toBeTruthy();
  });

  it("names the fields still in flight instead of showing a bare ellipsis", async () => {
    // On iOS Safari the DuckDB boot plus range requests take seconds. "…" in
    // the lender row read as "this loan has no lender".
    mocked.mockReturnValue(new Promise(() => {}));
    render(<DetailCard loanNumber={TILE.id} tile={TILE} onClose={() => {}} />);

    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
    expect(screen.queryByText("…")).toBeNull();
  });

  it("says a field is unavailable, not loading, once the query has failed", async () => {
    mocked.mockRejectedValue(new Error("network"));
    render(<DetailCard loanNumber={TILE.id} tile={TILE} onClose={() => {}} />);

    expect(await screen.findAllByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("falls back to a loading message with no tile to paint from", () => {
    mocked.mockReturnValue(new Promise(() => {}));
    render(<DetailCard loanNumber={TILE.id} onClose={() => {}} />);
    expect(screen.getByText(/loading record/i)).toBeTruthy();
  });
});
