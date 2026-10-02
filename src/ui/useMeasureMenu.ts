import {
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';

/** How long a finger has to rest on a measure before its menu opens, in milliseconds. */
const LONG_PRESS = 550;
/** How far the finger may drift during that time; further, and it is a scroll. */
const DRIFT = 10;

const MEASURE_ID = /^measure-(\d+)$/;

/** The measure a menu was asked for, and where on the screen. */
export interface MeasureTarget {
  index: number;
  x: number;
  y: number;
}

/**
 * The measure at a point of the score. Usually the element under the pointer
 * lies inside it. In staff notation the empty space between the notes belongs
 * to no measure, so there the measure is the one whose box contains the point.
 */
function measureAt(
  event: { target: EventTarget; currentTarget: EventTarget },
  x: number,
  y: number,
) {
  const inside = event.target instanceof Element ? event.target.closest('[id^="measure-"]') : null;
  const direct = inside ? MEASURE_ID.exec(inside.id) : null;
  if (direct) return Number(direct[1]);
  if (!(event.currentTarget instanceof Element)) return null;

  for (const element of event.currentTarget.querySelectorAll('[id^="measure-"]')) {
    const match = MEASURE_ID.exec(element.id);
    const box = element.getBoundingClientRect();
    if (match && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
      return Number(match[1]);
    }
  }
  return null;
}

/**
 * Opens a menu for the measure under the pointer: on a right click with a
 * mouse, and on a long press with a finger. It works on whatever draws the
 * measures, the numbered sheet or the staff, because it only looks for the
 * element that carries the measure's id.
 *
 * Spread `handlers` on the element that contains the score.
 */
export function useMeasureMenu() {
  const [target, setTarget] = useState<MeasureTarget | null>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  // A long press ends with a click on the same measure; that click must not seek.
  const swallowClick = useRef(false);

  const cancelPress = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }, []);

  const onContextMenu = useCallback(
    (event: MouseEvent) => {
      const index = measureAt(event, event.clientX, event.clientY);
      if (index === null) return;
      event.preventDefault();
      cancelPress();
      setTarget({ index, x: event.clientX, y: event.clientY });
    },
    [cancelPress],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      const index = measureAt(event, event.clientX, event.clientY);
      if (index === null) return;
      cancelPress();
      const { clientX: x, clientY: y } = event;
      const timer = window.setTimeout(() => {
        press.current = null;
        swallowClick.current = true;
        setTarget({ index, x, y });
      }, LONG_PRESS);
      press.current = { timer, x, y };
    },
    [cancelPress],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const started = press.current;
      if (!started) return;
      if (Math.hypot(event.clientX - started.x, event.clientY - started.y) > DRIFT) cancelPress();
    },
    [cancelPress],
  );

  const onClickCapture = useCallback((event: SyntheticEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    // Without a click to swallow (the finger left the measure), the flag must not linger.
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 0);
  }, []);

  return {
    target,
    close,
    handlers: {
      onContextMenu,
      onPointerDown,
      onPointerMove,
      onPointerUp: cancelPress,
      onPointerCancel: cancelPress,
      onPointerLeave: cancelPress,
      onClickCapture,
    },
  };
}
