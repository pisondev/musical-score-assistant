/**
 * The names of the parts above the progress bar on a phone: each centred over its stretch,
 * kept inside the bar, and left out where it would run into another. The name of the part
 * one is in always shows; the others are placed outward from it, nearest first, as long as
 * they fit.
 */

/** Where a stretch of the bar lies, in pixels from the left end of the bar. */
export interface Span {
  start: number;
  width: number;
}

export interface LabelLayout {
  /** The left edge of each name, in pixels from the left end of the bar. */
  left: number[];
  /** Whether each name is shown. */
  shown: boolean[];
}

/** The room kept between two names, in pixels. */
export const LABEL_GAP = 8;

export function placeLabels(
  spans: readonly Span[],
  widths: readonly number[],
  current: number,
  total: number,
  gap = LABEL_GAP,
): LabelLayout {
  const left = spans.map((span, index) => {
    const centred = span.start + span.width / 2 - widths[index] / 2;
    return Math.min(Math.max(0, centred), Math.max(0, total - widths[index]));
  });
  const shown = spans.map(() => false);
  const taken: [number, number][] = [];
  const order = spans
    .map((_, index) => index)
    .sort((a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b);
  for (const index of order) {
    const from = left[index];
    const to = from + widths[index];
    const free = taken.every(([start, end]) => to + gap <= start || from >= end + gap);
    if (index === current || free) {
      shown[index] = true;
      taken.push([from, to]);
    }
  }
  return { left, shown };
}

/** Whether two layouts place every name alike, so that nothing needs to be drawn again. */
export function sameLayout(a: LabelLayout | null, b: LabelLayout | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.left.length === b.left.length &&
    a.left.every((value, index) => Math.abs(value - b.left[index]) < 0.5) &&
    a.shown.every((value, index) => value === b.shown[index])
  );
}
