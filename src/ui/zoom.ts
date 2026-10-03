/**
 * The sizes the score can be shown at, relative to the size that suits the
 * screen (1 = 100%). The steps are finer near the middle, where most changes
 * are made.
 */
export const ZOOM_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8];

/** The nearest step to a stored value, so an odd value from elsewhere still works. */
function nearestIndex(zoom: number): number {
  let best = 0;
  ZOOM_STEPS.forEach((step, index) => {
    if (Math.abs(step - zoom) < Math.abs(ZOOM_STEPS[best] - zoom)) best = index;
  });
  return best;
}

export function zoomIn(zoom: number): number {
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, nearestIndex(zoom) + 1)];
}

export function zoomOut(zoom: number): number {
  return ZOOM_STEPS[Math.max(0, nearestIndex(zoom) - 1)];
}

export const canZoomIn = (zoom: number) => nearestIndex(zoom) < ZOOM_STEPS.length - 1;
export const canZoomOut = (zoom: number) => nearestIndex(zoom) > 0;
