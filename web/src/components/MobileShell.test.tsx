// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("keeps the map reachable by opening a county at the peek detent", () => {
    // Landing at full height would bury the map the user is comparing
    // counties on.
    const { container } = render(<MobileShell {...base} county={<p>County stats</p>} />);
    expect(container.querySelector("[data-detent='0']")).toBeTruthy();
  });

  it("raises the sheet to half for a loan, so the whole record is readable", () => {
    // A loan card is a dozen fields deep. At peek the reader sees a name and
    // has to drag before they can tell which of several overlapping pins they
    // actually hit.
    const { container } = render(<MobileShell {...base} detail={<p>Loan detail</p>} />);
    expect(container.querySelector("[data-detent='1']")).toBeTruthy();
  });

  it("leaves the sheet where the user put it across an unrelated re-render", () => {
    // detail/county are fresh elements every render, so only selectionId can
    // say whether the selection actually changed. Without it a map pan while
    // the sheet was open snapped it back under the reader's finger.
    const { container, rerender } = render(
      <MobileShell {...base} detail={<p>Loan detail</p>} selectionId="loan:1" />,
    );
    const sheet = container.querySelector(".sheet") as HTMLElement;
    fireEvent.keyDown(container.querySelector(".sheet-handle")!, { key: "ArrowUp" });
    expect(sheet.dataset.detent).toBe("2");

    rerender(<MobileShell {...base} detail={<p>Loan detail</p>} selectionId="loan:1" />);
    expect(sheet.dataset.detent).toBe("2");

    // A genuinely new loan does re-open at half.
    rerender(<MobileShell {...base} detail={<p>Other loan</p>} selectionId="loan:2" />);
    expect(sheet.dataset.detent).toBe("1");
  });

  it("offers a theme toggle beside the gear", () => {
    const onThemeToggle = vi.fn();
    render(<MobileShell {...base} theme="light" onThemeToggle={onThemeToggle} />);
    fireEvent.click(screen.getByLabelText("Switch to dark map"));
    expect(onThemeToggle).toHaveBeenCalled();
  });

  it("renders the search affordance in the top bar", () => {
    render(<MobileShell {...base} />);
    expect(screen.getByLabelText("Search borrower name")).toBeTruthy();
  });
});
