const KB = 1024;
const MB = KB * 1024;

/** 1536 → "1.5 KB"; 10485760 → "10 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= MB) {
    return `${trim(bytes / MB)} MB`;
  }
  if (bytes >= KB) {
    return `${trim(bytes / KB)} KB`;
  }
  return `${bytes} B`;
}

function trim(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** 75 → "1:15"; 8 → "0:08". */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "5 minutes ago", "yesterday", "just now". */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const diffSeconds = (Date.parse(iso) - nowMs) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(diffSeconds) >= size) {
      return relative.format(Math.round(diffSeconds / size), unit);
    }
  }
  return 'just now';
}

const absolute = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** "Sep 23, 2026, 5:16 PM" in the viewer's time zone. */
export function formatTimestamp(iso: string): string {
  return absolute.format(new Date(iso));
}

/** Shortens `text` to `max` characters on a word boundary where possible. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
