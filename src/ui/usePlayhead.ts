import { useEffect } from 'react';
import { engine } from '../audio/engine';
import { measureIndexAt, type SlotSpan, type Song } from '../core';
import { usePlayer } from '../store/player';

const ACTIVE_CLASS = 'is-active';

export function slotElementId(slotId: string): string {
  return `slot-${slotId}`;
}

/**
 * Follows the audio clock on every animation frame and marks the symbols
 * under the playhead. `spans` says when each symbol sounds; the symbol is the
 * element whose id is `slotElementId(span.id)`. Classes are toggled directly
 * on the DOM so the sheet does not re-render sixty times a second.
 */
export function usePlayhead(song: Song, spans: SlotSpan[]): void {
  useEffect(() => {
    const spansByMeasure: SlotSpan[][] = song.measures.map(() => []);
    for (const span of spans) {
      spansByMeasure[measureIndexAt(song, span.start)].push(span);
    }

    let active = new Set<string>();
    let frame = 0;

    const show = (next: Set<string>) => {
      for (const id of active) {
        if (!next.has(id))
          document.getElementById(slotElementId(id))?.classList.remove(ACTIVE_CLASS);
      }
      for (const id of next) {
        if (!active.has(id))
          document.getElementById(slotElementId(id))?.classList.add(ACTIVE_CLASS);
      }
      active = next;
    };

    const update = () => {
      frame = requestAnimationFrame(update);
      const { status, setCurrentMeasure } = usePlayer.getState();
      if (status !== 'playing' && status !== 'paused') {
        if (active.size > 0) show(new Set());
        return;
      }

      const tick = engine.tick;
      if (tick >= song.totalTicks) {
        if (active.size > 0) show(new Set());
        return;
      }
      const measure = measureIndexAt(song, tick);
      setCurrentMeasure(measure);

      const next = new Set<string>();
      for (const span of spansByMeasure[measure]) {
        if (span.start <= tick && tick < span.end) next.add(span.id);
      }
      show(next);
    };

    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      show(new Set());
    };
  }, [song, spans]);
}
