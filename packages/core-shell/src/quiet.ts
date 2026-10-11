/**
 * Quiet-hours window math for notification filtering. Times are minutes
 * since midnight; the window may cross midnight (22:00–08:00).
 */

/** Parse "HH:MM" into minutes since midnight; null when malformed. */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (m == null) {
    return null;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

/**
 * Whether `nowMin` falls inside the [start, end) quiet window.
 * start == end means the window is empty (never active).
 */
export function withinQuietHours(
  nowMin: number,
  startMin: number,
  endMin: number,
): boolean {
  if (startMin === endMin) {
    return false;
  }
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Crosses midnight (e.g. 22:00–08:00).
  return nowMin >= startMin || nowMin < endMin;
}
