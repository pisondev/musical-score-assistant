import { measureElementId } from '../core/mei';

/**
 * Where the reader is in the score. The eye is taken to follow a line that
 * moves down the window as the page scrolls: under the top bar at the start
 * of the page, above the playback bar at its end. Whatever measure that line
 * crosses is the place, so the first measure is reached at the top of the
 * page and the last one at the bottom, however tall the window is.
 */

const MEASURES = '.sheet [id^="measure-"]';

/** The part of the window between the top bar and the playback bar. */
function visibleArea(): { top: number; height: number } {
  const topbar = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const transport =
    document.querySelector('.transport')?.getBoundingClientRect().top ?? window.innerHeight;
  const top = Math.max(0, topbar);
  return { top, height: Math.max(1, Math.min(window.innerHeight, transport) - top) };
}

/** How far the page can scroll, and how far it has, from 0 to 1. */
function scrolled(): { range: number; progress: number } {
  const range = document.documentElement.scrollHeight - window.innerHeight;
  const progress = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0;
  return { range, progress };
}

/** A line of measures on the page: a system. */
interface Row {
  top: number;
  bottom: number;
  /** Index of its first measure, and how many measures it holds. */
  start: number;
  count: number;
}

/** The systems on the page, read from the measures of either notation. */
function rows(): Row[] {
  const found: Row[] = [];
  let previousLeft = Infinity;
  for (const element of document.querySelectorAll(MEASURES)) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    const row = found[found.length - 1];
    // A measure that does not lie to the right of the one before it starts a new line.
    if (!row || box.left <= previousLeft || box.top >= row.bottom) {
      found.push({
        top: box.top,
        bottom: box.bottom,
        start: Number(element.id.slice('measure-'.length)),
        count: 1,
      });
    } else {
      row.top = Math.min(row.top, box.top);
      row.bottom = Math.max(row.bottom, box.bottom);
      row.count += 1;
    }
    previousLeft = box.left;
  }
  return found;
}

/**
 * The place of the reader in measures: 0 before the first measure, `total`
 * at the end, and fractions in between (2.5 is halfway through the third
 * measure, or halfway down a line that starts with it).
 */
export function viewedPosition(total: number): number {
  const { top, height } = visibleArea();
  const { progress } = scrolled();
  if (progress >= 0.999) return total;

  const line = top + progress * height;
  let position = 0;
  for (const row of rows()) {
    if (line < row.top) break;
    const through = Math.min(1, (line - row.top) / Math.max(1, row.bottom - row.top));
    position = row.start + through * row.count;
  }
  return Math.min(total, position);
}

/** Scrolls the page so that the reader's place is the measure at `index`. */
export function scrollToMeasure(index: number): void {
  const element = document.getElementById(measureElementId(index));
  if (!element) return;
  const { top, height } = visibleArea();
  const { range } = scrolled();
  // The line sits at `scroll + top + (scroll / range) * height` on the page; solve for the
  // scroll position that puts it just inside the measure.
  const target = element.getBoundingClientRect().top + window.scrollY + 1;
  const scroll = range > 0 ? (target - top) / (1 + height / range) : 0;
  window.scrollTo({ top: Math.min(Math.max(0, scroll), Math.max(0, range)), behavior: 'smooth' });
}
