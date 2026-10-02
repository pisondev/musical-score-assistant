const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Units from largest to smallest; the first one that fits is used. */
const UNITS: readonly [unit: Intl.RelativeTimeFormatUnit, length: number][] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
];

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Describes how long ago a moment was, e.g. "3 hours ago" or "yesterday". */
export function timeAgo(then: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - then);
  for (const [unit, length] of UNITS) {
    if (elapsed >= length) return formatter.format(-Math.floor(elapsed / length), unit);
  }
  return 'just now';
}
