import { beatTicks } from './time';
import type { Slot, Song } from './types';

/** A melody note or rest is a gap when nothing new is sung for longer than this many beats. */
const GAP_BEATS = 2;

/**
 * A stretch in which the melody holds a note or rests. The congregation hears
 * no new syllable there, so the accompaniment has to carry the pulse.
 */
export interface Gap {
  /** Index of the measure in which the gap begins. */
  measure: number;
  /** Tick of the melody note (or the start of the song) that opens the gap. */
  start: number;
  /** Tick of the next melody note. */
  end: number;
  /** Beat boundaries strictly inside the gap, as absolute ticks. */
  beats: number[];
}

function noteOnsets(measures: ReadonlyArray<{ startTick: number; slots: Slot[] }>): number[] {
  return measures.flatMap((measure) =>
    measure.slots
      .filter((slot) => slot.kind === 'note')
      .map((slot) => measure.startTick + slot.start),
  );
}

/**
 * Finds the gaps of a song: places where consecutive melody notes begin more
 * than two beats apart. The end of the song is not a gap, because nobody has
 * to come in after it.
 */
export function findGaps(song: Song): Gap[] {
  const beat = beatTicks(song.meta.time);
  const onsets = noteOnsets(song.measures);
  const gaps: Gap[] = [];

  for (let index = 0; index < onsets.length - 1; index += 1) {
    const start = onsets[index];
    const end = onsets[index + 1];
    if (end - start <= GAP_BEATS * beat) continue;

    const measure = song.measures.find(
      (candidate) => start >= candidate.startTick && start < candidate.startTick + candidate.length,
    );
    if (!measure) continue;

    // Beats are counted from the barline of each measure, so a pickup does not shift them.
    const beats: number[] = [];
    for (const candidate of song.measures) {
      for (let offset = 0; offset < candidate.length; offset += beat) {
        const tick = candidate.startTick + offset;
        if (tick > start && tick < end) beats.push(tick);
      }
    }
    gaps.push({ measure: measure.index, start, end, beats });
  }
  return gaps;
}

/** Absolute ticks at which the left hand strikes a note. */
export function leftHandOnsets(song: Song, parts: ReadonlyArray<{ slots: Slot[] }>): number[] {
  return noteOnsets(
    song.measures.map((measure, index) => ({
      startTick: measure.startTick,
      slots: parts[index]?.slots ?? [],
    })),
  );
}
