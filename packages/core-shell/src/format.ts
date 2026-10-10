/**
 * Small display-formatting helpers shared by the download UIs.
 * Pure functions only — usable from ArkTS directly.
 */

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/**
 * Human-readable byte size: `0 B`, `512 B`, `9.5 MB`, `1.2 GB`.
 * Negative inputs (DownloadManager reports -1 for "unknown") return ''.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 0) {
    return '';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text =
    unit === 0 || value >= 100
      ? String(Math.round(value))
      : value >= 10
        ? Math.round(value * 10) / 10 + ''
        : Math.round(value * 100) / 100 + '';
  return `${text} ${UNITS[unit]}`;
}

/** Percent text for a progress bar; '' when the total is unknown. */
export function formatPercent(done: number, total: number): string {
  if (total <= 0 || done < 0) {
    return '';
  }
  const pct = Math.min(100, Math.floor((done / total) * 100));
  return `${pct}%`;
}
