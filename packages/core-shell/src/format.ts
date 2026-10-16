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

/**
 * Chinese relative-time label for "last used": 刚刚 / N 分钟前 / N 小时前 /
 * N 天前; older than 30 days falls back to the date (M月D日). ts <= 0 -> ''.
 */
export function relativeTime(ts: number | null, now: number): string {
  if (ts == null || ts <= 0 || now < ts) {
    return '';
  }
  const diff = now - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) {
    return '刚刚';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  }
  if (diff < 30 * day) {
    return `${Math.floor(diff / day)} 天前`;
  }
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
