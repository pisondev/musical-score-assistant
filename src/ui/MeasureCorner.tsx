import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { measureElementId } from '../core/mei';
import { cx } from './classnames';
import { measureBox } from './measure-box';

interface MeasureCornerProps {
  /** Index of the measure the controls belong to. */
  index: number;
  /** Puts the controls above the measure instead of on its top line; for staff notation. */
  above: boolean;
  /** Anything that changes when the sheet is laid out anew. */
  layout: unknown;
  children: ReactNode;
}

/**
 * Small controls at the top right corner of one measure. They are laid over
 * the sheet instead of being part of a measure, so the same controls work on
 * the numbered sheet and on the staff: the corner only looks for the element
 * that carries the measure's id. Render it inside the element that contains
 * the score; that element must be positioned.
 */
export function MeasureCorner({ index, above, layout, children }: MeasureCornerProps) {
  const corner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = corner.current;
    const host = element?.parentElement;
    if (!element || !host) return;
    const place = () => {
      const measure = document.getElementById(measureElementId(index));
      element.hidden = !measure;
      if (!measure) return;
      // As far right as the measure itself, and clear of everything drawn above it.
      const { right } = measureBox(measure);
      const { top } = measure.getBoundingClientRect();
      const origin = host.getBoundingClientRect();
      element.style.left = `${right - origin.left}px`;
      element.style.top = `${top - origin.top}px`;
    };
    place();
    // The sheet is laid out again when the window or the visible rows change.
    const observer = new ResizeObserver(place);
    observer.observe(host);
    return () => observer.disconnect();
  }, [index, layout]);

  return (
    <div ref={corner} className={cx('measure-corner', above && 'measure-corner--above')}>
      {children}
    </div>
  );
}
