import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { measureElementId } from '../core/mei';
import { cx } from './classnames';
import { measureBox } from './measure-box';

interface MeasureOverlayProps {
  /** Index of the measure the overlay belongs to. */
  index: number;
  /**
   * Where it goes: at the top right corner, for small controls, or in the
   * middle of the measure, for something to look at.
   */
  place: 'corner' | 'center';
  /** Puts a corner above the measure instead of on its top line; for staff notation. */
  above?: boolean;
  /** Anything that changes when the sheet is laid out anew. */
  layout: unknown;
  children: ReactNode;
}

/**
 * Something laid over one measure of the sheet. It is not part of the
 * measure, so the same overlay works on the numbered sheet and on the staff:
 * it only looks for the element that carries the measure's id. Render it
 * inside the element that contains the score; that element must be
 * positioned.
 */
export function MeasureOverlay({ index, place, above, layout, children }: MeasureOverlayProps) {
  const overlay = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = overlay.current;
    const host = element?.parentElement;
    if (!element || !host) return;
    const position = () => {
      const measure = document.getElementById(measureElementId(index));
      element.hidden = !measure;
      if (!measure) return;
      const origin = host.getBoundingClientRect();
      if (place === 'center') {
        // The middle of the music: of the rows of digits, or of the staves.
        const box = measureBox(measure.querySelector('.measure__staff') ?? measure);
        element.style.left = `${(box.left + box.right) / 2 - origin.left}px`;
        element.style.top = `${(box.top + box.bottom) / 2 - origin.top}px`;
        return;
      }
      // As far right as the measure itself, and clear of everything drawn above it.
      const { right } = measureBox(measure);
      const { top } = measure.getBoundingClientRect();
      element.style.left = `${right - origin.left}px`;
      element.style.top = `${top - origin.top}px`;
    };
    position();
    // The sheet is laid out again when the window or the visible rows change.
    const observer = new ResizeObserver(position);
    observer.observe(host);
    return () => observer.disconnect();
  }, [index, place, layout]);

  return (
    <div
      ref={overlay}
      className={cx(
        place === 'corner' ? 'measure-corner' : 'measure-center',
        above && 'measure-corner--above',
      )}
    >
      {children}
    </div>
  );
}
