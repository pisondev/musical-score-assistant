/** Room kept clear below the top edge, where the top bar or the toolbar may sit. */
const TOP_CLEARANCE = 72;
/** Room kept clear above the playback bar. */
const BOTTOM_CLEARANCE = 20;

/**
 * Scrolls the measure under the playhead back into view when it is hidden
 * behind the bars at the top or the bottom of the window. The playback bar is
 * measured, because its height depends on the width of the window.
 */
export function keepInView(element: Element): void {
  const box = element.getBoundingClientRect();
  const transport = document.querySelector('.transport')?.getBoundingClientRect().height ?? 0;
  const bottom = window.innerHeight - transport - BOTTOM_CLEARANCE;
  if (box.top < TOP_CLEARANCE || box.bottom > bottom) {
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
