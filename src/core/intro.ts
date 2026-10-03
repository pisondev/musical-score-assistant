import type { Song } from './types.ts';

/** Number of measures the last-phrase introduction takes when none is specified. */
const DEFAULT_PHRASE_MEASURES = 4;

/** Prefix that keeps the ids of the last-phrase introduction apart from those of the song. */
export const INTRO_ID_PREFIX = 'i';

/**
 * Index of the measure where the last phrase begins. `fromNumber` is a printed
 * measure number; without it the phrase is the last four measures.
 */
export function lastPhraseStart(song: Song, fromNumber?: number): number {
  if (fromNumber !== undefined) {
    const index = song.measures.findIndex((measure) => measure.number === fromNumber);
    if (index !== -1) return index;
  }
  const firstNumbered = Math.max(
    0,
    song.measures.findIndex((measure) => measure.number !== null),
  );
  return Math.max(firstNumbered, song.measures.length - DEFAULT_PHRASE_MEASURES);
}
