// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileShell } from "./MobileShell";

const base = {
  onHelpClick: vi.fn(),
  search: <input aria-label="Search borrower name" />,
  explore: <p>Explore panel</p>,
  detail: null,
  county: null,
};

describe("MobileShell", () => {
  it("shows the explore panel when nothing is selected", () => {
    render(<MobileShell {...base} />);
    expect(screen.getByText("Explore panel")).toBeTruthy();
  });

  it("shows a selected loan in place of the explore panel", () => {
    render(<MobileShell {...base} detail={<p>Loan detail</p>} />);
    expect(screen.getByText("Loan detail")).toBeTruthy();
    expect(screen.queryByText("Explore panel")).toBeNull();
  });

  it("shows a selected county in place of the explore panel", () => {
    render(<MobileShell {...base} county={<p>County stats</p>} />);
    expect(screen.getByText("County stats")).toBeTruthy();
    expect(screen.queryByText("Explore panel")).toBeNull();
  });

  it("prefers a county over a loan when somehow both are set", () => {
    // App clears one when setting the other, so this is a guard against a
    // future regression rather than a reachable state today.
    render(
      <MobileShell {...base} detail={<p>Loan detail</p>} county={<p>County stats</p>} />,
    );
    expect(screen.getByText("County stats")).toBeTruthy();
    expect(screen.queryByText("Loan detail")).toBeNull();
  });

  it("keeps the map reachable by opening a selection at the peek detent", () => {
    // Landing at full height would bury the map the user is comparing
    // counties on.
    const { container } = render(<MobileShell {...base} county={<p>County stats</p>} />);
    expect(container.querySelector("[data-detent='0']")).toBeTruthy();
  });

  it("renders the search affordance in the top bar", () => {
    render(<MobileShell {...base} />);
    expect(screen.getByLabelText("Search borrower name")).toBeTruthy();
  });
});
