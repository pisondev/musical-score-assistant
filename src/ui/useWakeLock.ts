import { useEffect } from 'react';

/**
 * Keeps the screen on while `active`, where the browser allows it: a score on the music stand
 * must not go dark in the middle of a verse. The browser lets go of the lock whenever the page
 * is hidden, so it is taken again each time the page returns.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;

    const take = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const taken = await navigator.wakeLock.request('screen');
        if (stopped) void taken.release();
        else lock = taken;
      } catch {
        // Refused, for example to save a low battery; the screen then dims as usual.
      }
    };

    void take();
    document.addEventListener('visibilitychange', take);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', take);
      void lock?.release();
    };
  }, [active]);
}
