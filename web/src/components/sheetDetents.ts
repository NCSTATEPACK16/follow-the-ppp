/**
 * Snap logic for the mobile bottom sheet.
 *
 * Detents: 0 = peek (county name, total, rank — map stays visible),
 * 1 = half, 2 = full. Screen coordinates grow downward, so dragging UP to
 * reveal more sheet is a negative dy.
 */

export const DETENT_COUNT = 3;

/** Fraction of the viewport each detent occupies. */
export const DETENT_HEIGHTS = [0.12, 0.5, 0.92];

/** Drag distance, in px, that counts as intentional rather than a stray touch. */
const DISTANCE_THRESHOLD = 56;

/** Flick speed, in px/ms, that moves a detent regardless of distance. */
const VELOCITY_THRESHOLD = 0.5;

interface DragEnd {
  /** Detent the gesture started from. */
  from: number;
  /** Total vertical movement; negative is upward. */
  dy: number;
  /** Velocity at release in px/ms; negative is upward. */
  velocity: number;
}

/**
 * Where the sheet lands when a drag ends.
 *
 * At most one detent per gesture: snapping two levels at once reads as the
 * sheet slipping out of the user's control.
 */
export function resolveDetent({ from, dy, velocity }: DragEnd): number {
  const flicked = Math.abs(velocity) >= VELOCITY_THRESHOLD;
  const dragged = Math.abs(dy) >= DISTANCE_THRESHOLD;

  // A flick decides direction on its own; otherwise distance does. Requiring
  // both would make the sheet feel stuck, since a fast flick covers little
  // ground before release.
  let direction = 0;
  if (flicked) direction = velocity < 0 ? 1 : -1;
  else if (dragged) direction = dy < 0 ? 1 : -1;

  return Math.min(DETENT_COUNT - 1, Math.max(0, from + direction));
}
