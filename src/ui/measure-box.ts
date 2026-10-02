const MEASURE_ID = /^measure-(\d+)$/;
const MEASURES = '[id^="measure-"]';

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The index a measure element stands for, or null for any other element. */
export function measureIndexOf(element: Element): number | null {
  const match = MEASURE_ID.exec(element.id);
  return match ? Number(match[1]) : null;
}

/**
 * The box of a measure in the window. On the numbered sheet that is the box
 * of its element. An engraved measure also holds ties, slurs, and hairpins
 * that reach into its neighbours, so there the box is that of its staves:
 * as wide as the measure really is, from the top staff to the bottom one.
 */
export function measureBox(element: Element): Box {
  const staves = element.querySelectorAll(':scope > g.staff');
  if (staves.length === 0) return element.getBoundingClientRect();
  const box: Box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const staff of staves) {
    // The staff lines alone: notes on ledger lines do not widen the measure.
    const lines = staff.querySelectorAll(':scope > path');
    for (const part of lines.length > 0 ? lines : [staff]) {
      const own = part.getBoundingClientRect();
      box.left = Math.min(box.left, own.left);
      box.right = Math.max(box.right, own.right);
      box.top = Math.min(box.top, own.top);
      box.bottom = Math.max(box.bottom, own.bottom);
    }
  }
  return box;
}

const contains = (box: Box, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/**
 * The measure at a point of the score. Usually the element under the pointer
 * lies inside it. In staff notation the empty space between the notes belongs
 * to no element, so there the measure is the one whose staves contain the
 * point, or, above and below the staves, the one that is nearest among those
 * whose drawing reaches the point.
 */
export function measureAtPoint(
  target: EventTarget | null,
  container: EventTarget | null,
  x: number,
  y: number,
): number | null {
  const inside = target instanceof Element ? target.closest(MEASURES) : null;
  const direct = inside ? measureIndexOf(inside) : null;
  if (direct !== null) return direct;
  if (!(container instanceof Element)) return null;

  let nearest: { index: number; distance: number } | null = null;
  for (const element of container.querySelectorAll(MEASURES)) {
    const index = measureIndexOf(element);
    if (index === null) continue;
    const box = measureBox(element);
    if (contains(box, x, y)) return index;
    if (!contains(element.getBoundingClientRect(), x, y)) continue;
    const distance = Math.abs(x - (box.left + box.right) / 2);
    if (!nearest || distance < nearest.distance) nearest = { index, distance };
  }
  return nearest?.index ?? null;
}
