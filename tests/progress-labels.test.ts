import { describe, expect, it } from 'vitest';
import { LABEL_GAP, placeLabels, sameLayout } from '../src/ui/progress-labels';

/** Stretches of the given widths side by side, `gap` pixels apart. */
function spans(widths: number[], gap = 2) {
  let start = 0;
  return widths.map((width) => {
    const span = { start, width };
    start += width + gap;
    return span;
  });
}

describe('the names over the progress bar', () => {
  it('stand centred over their stretches when there is room', () => {
    const layout = placeLabels(spans([100, 100, 100]), [40, 50, 40], 0, 304);
    expect(layout.left).toEqual([30, 127, 234]);
    expect(layout.shown).toEqual([true, true, true]);
  });

  it('stay inside the bar at both ends', () => {
    const layout = placeLabels(spans([20, 260, 20]), [60, 80, 60], 1, 304);
    expect(layout.left[0]).toBe(0);
    expect(layout.left[2]).toBe(304 - 60);
  });

  it('always show the current part, and leave out the names that would run into it', () => {
    // Five narrow stretches with long names: only the current one fits.
    const layout = placeLabels(spans([20, 20, 20, 20, 20], 0), [50, 50, 50, 50, 50], 2, 100);
    expect(layout.shown).toEqual([false, false, true, false, false]);
    // With the current part at an end, the far names come back where they fit.
    const atStart = placeLabels(spans([60, 60, 60, 60], 0), [70, 70, 70, 70], 0, 240);
    expect(atStart.shown).toEqual([true, false, true, false]);
  });

  it('place the nearest names first, the left one on a tie', () => {
    // The current name is short; its two neighbours fit beside it but not beside each other's
    // neighbours, so the nearer ones win over the far ones.
    const layout = placeLabels(spans([50, 50, 50, 50, 50], 0), [60, 60, 20, 60, 60], 2, 250);
    expect(layout.shown).toEqual([false, true, true, true, false]);
  });

  it('keep a gap between two names', () => {
    expect(LABEL_GAP).toBeGreaterThan(0);
    // Names that touch fit only without a gap; with it, one of them is left out.
    expect(placeLabels(spans([50, 50], 0), [50, 50], 0, 100, 0).shown).toEqual([true, true]);
    expect(placeLabels(spans([50, 50], 0), [50, 50], 0, 100).shown).toEqual([true, false]);
    // With room for the gap, both show.
    expect(placeLabels(spans([60, 60], 0), [50, 50], 0, 120).shown).toEqual([true, true]);
  });

  it('tell when nothing changed, so the bar is not drawn again', () => {
    const a = placeLabels(spans([100, 100]), [40, 40], 0, 202);
    expect(sameLayout(a, { left: a.left.map((value) => value + 0.2), shown: a.shown })).toBe(true);
    expect(sameLayout(a, { left: a.left, shown: [true, false] })).toBe(false);
    expect(sameLayout(null, null)).toBe(true);
    expect(sameLayout(a, null)).toBe(false);
  });
});
