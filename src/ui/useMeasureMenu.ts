import {
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';
import { measureAtPoint } from './measure-box';

/** How long a finger has to rest on a measure before its menu opens, in milliseconds. */
const LONG_PRESS = 550;
/** How far the finger may drift during that time; further, and it is a scroll. */
const DRIFT = 10;

/** The measure a menu was asked for, and where on the screen. */
export interface MeasureTarget {
  index: number;
  x: number;
  y: number;
}

/** Controls laid over a measure (its corner) are not the measure itself. */
function onControl(event: { target: EventTarget }): boolean {
  return event.target instanceof Element && event.target.closest('.measure-corner') !== null;
}

/** The measure under the pointer of an event on the score. */
function measureAt(
  event: { target: EventTarget; currentTarget: EventTarget },
  x: number,
  y: number,
) {
  return measureAtPoint(event.target, event.currentTarget, x, y);
}

/**
 * Opens a menu for the measure under the pointer: on a right click with a
 * mouse, and on a long press with a finger. A plain click selects the measure
 * instead, so the page can offer the same menu from a button at its corner.
 * It works on whatever draws the measures, the numbered sheet or the staff,
 * because it only looks for the element that carries the measure's id.
 *
 * Spread `handlers` on the element that contains the score.
 */
export function useMeasureMenu() {
  const [target, setTarget] = useState<MeasureTarget | null>(null);
  // The measure that was clicked last; null after a click beside the measures.
  const [selected, setSelected] = useState<number | null>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  // A long press ends with a click on the same measure; that click must not seek.
  const swallowClick = useRef(false);

  const cancelPress = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }, []);

  const onContextMenu = useCallback(
    (event: MouseEvent) => {
      if (onControl(event)) return;
      const index = measureAt(event, event.clientX, event.clientY);
      if (index === null) return;
      event.preventDefault();
      cancelPress();
      setSelected(index);
      setTarget({ index, x: event.clientX, y: event.clientY });
    },
    [cancelPress],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || onControl(event)) return;
      const index = measureAt(event, event.clientX, event.clientY);
      if (index === null) return;
      cancelPress();
      const { clientX: x, clientY: y } = event;
      const timer = window.setTimeout(() => {
        press.current = null;
        swallowClick.current = true;
        setSelected(index);
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

  // A click that reaches the score selects the measure it fell on.
  const onClick = useCallback((event: MouseEvent) => {
    if (onControl(event)) return;
    setSelected(measureAt(event, event.clientX, event.clientY));
  }, []);

  /** Opens the menu of a measure at a point of the window, for a button that stands for it. */
  const open = useCallback((index: number, x: number, y: number) => {
    setTarget({ index, x, y });
  }, []);

  const deselect = useCallback(() => setSelected(null), []);

  const close = useCallback(() => {
    setTarget(null);
    // Without a click to swallow (the finger left the measure), the flag must not linger.
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 0);
  }, []);

  return {
    target,
    selected,
    open,
    deselect,
    close,
    handlers: {
      onClick,
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
