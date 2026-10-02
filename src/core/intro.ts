import type { Chord } from './chord';
import { resolveLeftMeasure } from './left-hand';
import { parseNotationLine } from './notation';
import { MAJOR_SCALE } from './notes';
import { beatTicks, measureTicks } from './time';
import type {
  Arrangement,
  ArrangementMeasure,
  Issue,
  Measure,
  Slot,
  Song,
  WrittenIntro,
  WrittenIntroSpec,
} from './types';
import { validateArrangement } from './validate';

/** Number of measures the last-phrase introduction takes when none is specified. */
const DEFAULT_PHRASE_MEASURES = 4;

/** Prefix that keeps the ids of introduction slots apart from those of the song. */
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

/**
 * Builds a written introduction. Both hands are given measure by measure: the
 * right hand relative to the key, the left hand in chord degrees.
 */
export function buildWrittenIntro(song: Song, spec: WrittenIntroSpec): WrittenIntro {
  const issues: Issue[] = [];
  const beat = beatTicks(song.meta.time);
  const full = measureTicks(song.meta.time);
  const context = { key: song.meta.key, leftDo: song.leftDo };

  const measures: Measure[] = [];
  const parts: ArrangementMeasure[] = [];
  let carried: Chord | null = null;
  let startTick = 0;

  spec.measures.forEach((entry, index) => {
    const report = (
      message: string,
      hand: 'right' | 'left',
      severity: Issue['severity'] = 'error',
    ) => issues.push({ severity, message, measure: index, hand });

    const right = parseNotationLine(entry.right, beat, 0);
    const left = parseNotationLine(entry.left, beat, 0);
    right.issues.forEach((issue) => report(issue.message, 'right', issue.severity));
    left.issues.forEach((issue) => report(issue.message, 'left', issue.severity));
    if (right.measures.length !== 1 || left.measures.length !== 1) {
      report('Each hand must describe exactly one measure, without barlines.', 'right');
      return;
    }

    const rawRight = right.measures[0];
    const rawLeft = left.measures[0];
    if (rawRight.length !== rawLeft.length) {
      report(
        `Right hand has ${rawRight.length / beat} beats and left hand ${rawLeft.length / beat}.`,
        'left',
      );
    }
    if (rawRight.length > full) {
      report(`Measure has ${rawRight.length / beat} beats; at most ${full / beat} fit.`, 'right');
    }
    if (rawRight.chords.length > 0) {
      report(
        'Chords belong in the left-hand notation; those in the right hand are ignored.',
        'right',
        'warning',
      );
    }

    // Each written introduction gets ids of its own, so two of them never collide.
    const prefix = `${INTRO_ID_PREFIX}-${spec.id}-`;
    const slots: Slot[] = rawRight.slots.map((slot, slotIndex) => ({
      id: `${prefix}r${index}-${slotIndex}`,
      kind: slot.kind,
      start: slot.start,
      duration: slot.duration,
      pitches: slot.tones
        .map((tone) => ({
          midi: song.rightDo + MAJOR_SCALE[tone.degree - 1] + tone.accidental + 12 * tone.octave,
          tone: { ...tone },
        }))
        .sort((a, b) => a.midi - b.midi),
      beat: slot.beat,
      beams: slot.beams,
      tuplet: slot.tuplet,
    }));

    const resolved = resolveLeftMeasure(rawLeft, index, carried, context);
    issues.push(...resolved.issues);
    carried = resolved.chord;

    measures.push({
      index,
      number: null,
      part: 'intro',
      startTick,
      length: rawRight.length,
      slots,
      chords: [],
      dynamics: rawRight.dynamics.map(({ start, sign }) => ({ start, sign })),
      barline: 'single',
      repeatStart: false,
      line: 0,
    });
    parts.push({
      slots: resolved.slots.map((slot) => ({ ...slot, id: `${prefix}${slot.id}` })),
      chords: resolved.chords,
      note: entry.note,
    });
    startTick += rawRight.length;
  });

  // The last measure and the song's pickup should complete one full measure.
  const pickup = song.measures[0]?.number === null ? song.measures[0].length : 0;
  const last = measures[measures.length - 1];
  if (last && (last.length + pickup) % full !== 0) {
    issues.push({
      severity: 'warning',
      message: `The last measure and the pickup add up to ${(last.length + pickup) / beat} beats instead of ${full / beat}.`,
      measure: measures.length - 1,
      hand: 'right',
    });
  }
  measures.slice(0, -1).forEach((measure) => {
    if (measure.length !== full) {
      issues.push({
        severity: 'error',
        message: `Measure has ${measure.length / beat} beats; the time signature needs ${full / beat}.`,
        measure: measure.index,
        hand: 'right',
      });
    }
  });

  if (measures.length > 0) {
    const introSong: Song = { ...song, measures, totalTicks: startTick, issues: [] };
    const introArrangement: Arrangement = {
      id: spec.id,
      name: spec.name,
      summary: '',
      level: 'advanced',
      style: spec.style ?? '',
      baseline: false,
      tips: [],
      patterns: [],
      measures: parts,
      rightHand: {},
      issues: [],
    };
    issues.push(...validateArrangement(introSong, introArrangement));
  }

  return {
    id: spec.id,
    name: spec.name,
    style: spec.style ?? '',
    summary: spec.summary ?? '',
    measures,
    parts,
    issues,
  };
}
