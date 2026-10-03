import { useEffect, useState } from 'react';
import { ExitFullScreenIcon, FullScreenIcon } from './icons';

/**
 * Gives the whole screen to the app: the bars of the browser, and on a phone or tablet the
 * status bar of the system, step aside until the button is pressed again or the player swipes
 * from the edge. Browsers without full screen for pages (Safari on iPhone) show no button.
 */
export function FullScreenButton() {
  const [full, setFull] = useState(() => document.fullscreenElement !== null);

  useEffect(() => {
    const update = () => setFull(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  if (!document.fullscreenEnabled) return null;

  const toggle = () => {
    const change = full
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    change.catch(() => undefined);
  };

  return (
    <button
      type="button"
      className="view-button"
      onClick={toggle}
      aria-pressed={full}
      aria-label={full ? 'Leave full screen' : 'Full screen'}
      title={full ? 'Leave full screen' : 'Full screen'}
    >
      {full ? (
        <ExitFullScreenIcon width={14} height={14} />
      ) : (
        <FullScreenIcon width={14} height={14} />
      )}
    </button>
  );
}
