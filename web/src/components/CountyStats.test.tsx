// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CountyStats } from "./CountyStats";
import type { CountyStats as Stats } from "../types";

const WAKE: Stats = {
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
};

vi.mock("../lib/countyStats", () => ({
  getCountyStats: vi.fn(),
  getNationalCount: vi.fn(async () => 3226),
}));

import { getCountyStats } from "../lib/countyStats";

const mocked = vi.mocked(getCountyStats);

function renderFor(stats: Stats | null = WAKE) {
  mocked.mockResolvedValue(stats);
  return render(<CountyStats fips="37183" name="Wake" state="NC" />);
}

beforeEach(() => vi.clearAllMocks());

describe("CountyStats", () => {
  it("names the county before its figures arrive", () => {
    // The tile already knows the name, so the header should never flash empty
    // while the 144KB payload downloads.
    renderFor();
    expect(screen.getByText(/Wake/)).toBeTruthy();
  });

  it("leads with the approved total", async () => {
    renderFor();
    expect(await screen.findByText("$2.74B")).toBeTruthy();
  });

  it("reports rank within the state", async () => {
    renderFor();
    await waitFor(() => expect(screen.getByText("#2")).toBeTruthy());
    expect(screen.getByText(/of 100 NC counties/)).toBeTruthy();
  });

  it("reports national rank against the counties that have data", async () => {
    renderFor();
    await waitFor(() => expect(screen.getByText("#55")).toBeTruthy());
    expect(screen.getByText(/of 3,226/)).toBeTruthy();
  });

  it("groups a four-digit rank", async () => {
    // "#2718" reads as a year, not a position.
    mocked.mockResolvedValue({ ...WAKE, nat_rank: 2718 });
    render(<CountyStats fips="20197" name="Wabaunsee" state="KS" />);
    expect(await screen.findByText("#2,718")).toBeTruthy();
  });

  it("reports share of state dollars", async () => {
    renderFor();
    expect(await screen.findByText("15.6%")).toBeTruthy();
  });

  it("reports the forgiven total and rate", async () => {
    renderFor();
    expect(await screen.findByText("$2.67B")).toBeTruthy();
    expect(screen.getByText(/97.3%/)).toBeTruthy();
  });

  it("shows loan count, median and jobs", async () => {
    renderFor();
    expect(await screen.findByText("34,757")).toBeTruthy();
    expect(screen.getByText("$20,800")).toBeTruthy();
    expect(screen.getByText("317,603")).toBeTruthy();
  });

  it("derives dollars per reported job", async () => {
    // 2_737_662_324 / 317_603 = 8620
    renderFor();
    expect(await screen.findByText("$8,620")).toBeTruthy();
  });

  it("says jobs are self-reported rather than saved", async () => {
    // The figure invites a cost-per-job-saved reading the data cannot carry.
    renderFor();
    await screen.findByText("$8,620");
    expect(screen.getByText(/self-reported/i)).toBeTruthy();
  });

  it("states what share of pins are approximate", async () => {
    renderFor();
    expect(await screen.findByText(/34.8%/)).toBeTruthy();
  });

  describe("degenerate data", () => {
    it("explains when a county has no statistics", async () => {
      // Connecticut planning regions and the territories have no TIGER
      // counterpart, so their polygons carry no entry.
      renderFor(null);
      expect(await screen.findByText(/no ppp statistics/i)).toBeTruthy();
    });

    it("omits the per-job figure when jobs are missing", async () => {
      renderFor({ ...WAKE, jobs_reported: null });
      await screen.findByText("$2.74B");
      expect(screen.queryByText(/per job/i)).toBeNull();
    });

    it("caps the forgiveness bar at 100% but prints the true rate", async () => {
      // Some counties record more forgiveness than approval.
      const { container } = renderFor({ ...WAKE, forg_rate: 110 });
      await screen.findByText(/110%/);
      const bar = container.querySelector(".county-bar-fill") as HTMLElement;
      expect(bar.style.width).toBe("100%");
    });
  });
});
