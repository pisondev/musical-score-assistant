import { useEffect, useState } from 'react';

/** How the screen is held: a phone or a small tablet, and whether it lies on its side. */
export interface ScreenShape {
  /** A phone held either way, or a window narrower than a laptop. */
  compact: boolean;
  landscape: boolean;
}

function read(): ScreenShape {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return { compact: width <= 900 || height <= 520, landscape: width > height };
}

/** The shape of the screen, followed as it turns or the window is resized. */
export function useScreenShape(): ScreenShape {
  const [shape, setShape] = useState(read);
  useEffect(() => {
    const update = () =>
      setShape((known) => {
        const next = read();
        return next.compact === known.compact && next.landscape === known.landscape ? known : next;
      });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return shape;
}
