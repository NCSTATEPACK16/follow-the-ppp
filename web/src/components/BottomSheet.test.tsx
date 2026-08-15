// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

function renderSheet(props: Partial<React.ComponentProps<typeof BottomSheet>> = {}) {
  const onDetentChange = vi.fn();
  const utils = render(
    <BottomSheet detent={1} onDetentChange={onDetentChange} label="County statistics" {...props}>
      <p>Wake County</p>
    </BottomSheet>,
  );
  return { ...utils, onDetentChange };
}

describe("BottomSheet", () => {
  it("renders its content", () => {
    renderSheet();
    expect(screen.getByText("Wake County")).toBeTruthy();
  });

  it("exposes the current detent so styling can follow it", () => {
    const { container } = renderSheet({ detent: 2 });
    expect(container.querySelector("[data-detent='2']")).toBeTruthy();
  });

  it("labels the drag handle for assistive tech", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: /county statistics/i })).toBeTruthy();
  });

  describe("keyboard control", () => {
    // Drag is the primary gesture but cannot be the only one — a sheet that
    // only responds to pointer physics is unreachable by keyboard or switch.
    it("expands on ArrowUp", () => {
      const { onDetentChange } = renderSheet({ detent: 0 });
      fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowUp" });
      expect(onDetentChange).toHaveBeenCalledWith(1);
    });

    it("collapses on ArrowDown", () => {
      const { onDetentChange } = renderSheet({ detent: 2 });
      fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
      expect(onDetentChange).toHaveBeenCalledWith(1);
    });

    it("collapses to peek on Escape", () => {
      const { onDetentChange } = renderSheet({ detent: 2 });
      fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
      expect(onDetentChange).toHaveBeenCalledWith(0);
    });

    it("does not expand past the top detent", () => {
      const { onDetentChange } = renderSheet({ detent: 2 });
      fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowUp" });
      expect(onDetentChange).not.toHaveBeenCalled();
    });

    it("does not collapse below peek", () => {
      const { onDetentChange } = renderSheet({ detent: 0 });
      fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
      expect(onDetentChange).not.toHaveBeenCalled();
    });
  });

  it("publishes its height so the legend and attribution can clear it", () => {
    // The legend is a required secondary encoding and the footer carries the
    // Geocodio CC BY 4.0 credit; neither may end up underneath the sheet.
    renderSheet({ detent: 2 });
    expect(
      document.documentElement.style.getPropertyValue("--sheet-height"),
    ).toBe("92dvh");
  });

  it("suppresses its transition when reduced motion is preferred", () => {
    const { container } = renderSheet({ reducedMotion: true });
    const sheet = container.querySelector("[data-detent]") as HTMLElement;
    expect(sheet.style.transition).toBe("none");
  });
});
