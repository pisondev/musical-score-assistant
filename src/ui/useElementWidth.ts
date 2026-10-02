import { useEffect, useState, type RefObject } from 'react';

/** Width of an element, tracked as it resizes. */
export function useElementWidth(element: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const measure = () => setWidth(target.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return width;
}
