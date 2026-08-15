import { useEffect, useRef, type ReactNode } from "react";
import { DETENT_COUNT, DETENT_HEIGHTS, resolveDetent } from "./sheetDetents";

interface BottomSheetProps {
  /** 0 = peek, 1 = half, 2 = full. */
  detent: number;
  onDetentChange: (detent: number) => void;
  /** Describes the sheet's content for assistive tech. */
  label: string;
  reducedMotion?: boolean;
  children: ReactNode;
}

/**
 * The single content surface on mobile. Everything the sidebar holds on
 * desktop — explore controls, a loan, a county — arrives here instead, so
 * only one panel ever competes with the map.
 */
export function BottomSheet({
  detent,
  onDetentChange,
  label,
  reducedMotion = false,
  children,
}: BottomSheetProps) {
  const dragStart = useRef<{ y: number; t: number } | null>(null);
  const height = `${DETENT_HEIGHTS[detent] * 100}dvh`;

  // The map legend is a required secondary encoding and the footer carries
  // the Geocodio CC BY 4.0 credit — neither may sit underneath the sheet.
  // They live outside this subtree, so publish the height as a custom
  // property they can offset against.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sheet-height", height);
    return () => {
      root.style.removeProperty("--sheet-height");
    };
  }, [height]);

  const clampTo = (next: number) => {
    const bounded = Math.min(DETENT_COUNT - 1, Math.max(0, next));
    if (bounded !== detent) onDetentChange(bounded);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStart.current = { y: e.clientY, t: e.timeStamp };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const dy = e.clientY - start.y;
    const elapsed = Math.max(1, e.timeStamp - start.t);
    const next = resolveDetent({ from: detent, dy, velocity: dy / elapsed });
    if (next !== detent) onDetentChange(next);
  };

  // Drag is the natural gesture, but it cannot be the only one: a sheet that
  // responds only to pointer physics is unreachable by keyboard or switch.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      clampTo(detent + 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      clampTo(detent - 1);
    } else if (e.key === "Escape") {
      clampTo(0);
    }
  };

  return (
    <div
      className="sheet"
      data-detent={detent}
      style={{ height, transition: reducedMotion ? "none" : undefined }}
    >
      <button
        type="button"
        className="sheet-handle"
        aria-label={`${label} — drag, or use arrow keys, to resize`}
        aria-expanded={detent > 0}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <span className="sheet-grip" aria-hidden="true" />
      </button>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
