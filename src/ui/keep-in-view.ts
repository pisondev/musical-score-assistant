/** Room kept clear below the top bar and above the playback bar. */
const CLEARANCE = 16;

/**
 * Scrolls the measure under the playhead back into view when it is hidden
 * behind the bars at the top or the bottom of the window. Both bars are
 * measured, because their heights depend on the width of the window.
 */
export function keepInView(element: Element): void {
  const box = element.getBoundingClientRect();
  const topbar = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const transport = document.querySelector('.transport')?.getBoundingClientRect().height ?? 0;
  const top = Math.max(0, topbar) + CLEARANCE;
  const bottom = window.innerHeight - transport - CLEARANCE;
  if (box.top < top || box.bottom > bottom) {
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
