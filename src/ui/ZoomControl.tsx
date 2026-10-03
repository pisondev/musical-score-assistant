import { useSettings } from '../store/settings';
import { MinusIcon, PlusIcon } from './icons';
import { canZoomIn, canZoomOut, zoomIn, zoomOut } from './zoom';

/**
 * Makes the score larger or smaller: minus, the size in percent (a click
 * returns to 100%), and plus. On a keyboard, + and - do the same and 0
 * returns to 100%.
 */
export function ZoomControl() {
  const zoom = useSettings((state) => state.zoom);
  const setZoom = useSettings((state) => state.setZoom);
  return (
    <div className="zoom" role="group" aria-label="Size of the score">
      <button
        type="button"
        onClick={() => setZoom(zoomOut(zoom))}
        disabled={!canZoomOut(zoom)}
        aria-label="Smaller"
        title="Smaller (−)"
      >
        <MinusIcon width={14} height={14} />
      </button>
      <button
        type="button"
        className="zoom__value"
        onClick={() => setZoom(1)}
        aria-label={`Size ${Math.round(zoom * 100)} percent; back to 100`}
        title="Back to 100% (0)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => setZoom(zoomIn(zoom))}
        disabled={!canZoomIn(zoom)}
        aria-label="Larger"
        title="Larger (+)"
      >
        <PlusIcon width={14} height={14} />
      </button>
    </div>
  );
}
