import { normalizeChordSymbol, parseChord, spellChordDegree, type Chord } from './chord';
import {
  bassPitch,
  describeLeftPitch,
  resolveLeftMeasure,
  rootPitch,
  type LeftHandContext,
} from './left-hand';
import { parseNotationLine } from './notation';
import { beatTicks } from './time';
import type {
  Arrangement,
  ArrangementMeasure,
  ArrangementSpec,
  ChordMark,
  Issue,
  Measure,
  Pitch,
  Slot,
  Song,
} from './types';

export const BASELINE_ID = 'baseline';

export interface TimedChord {
  /** Absolute tick at which the chord takes effect. */
  tick: number;
  symbol: string;
  chord: Chord | null;
}

/** Flattens the chord marks of a list of measures into one absolute timeline. */
export function chordTimeline(
  measures: ReadonlyArray<{ startTick: number; chords: ChordMark[] }>,
): TimedChord[] {
  const timeline: TimedChord[] = [];
  for (const measure of measures) {
    for (const mark of measure.chords) {
      timeline.push({
        tick: measure.startTick + mark.start,
        symbol: mark.symbol,
        chord: parseChord(mark.symbol),
      });
    }
  }
  return timeline.sort((a, b) => a.tick - b.tick);
}

/** Returns the chord in effect at a tick, or null before the first chord. */
export function chordAt(timeline: TimedChord[], tick: number): TimedChord | null {
  let found: TimedChord | null = null;
  for (const entry of timeline) {
    if (entry.tick > tick) break;
    found = entry;
  }
  return found;
}

function leftContext(song: Song): LeftHandContext {
  return { key: song.meta.key, leftDo: song.leftDo };
}

/** The pitches of the root-fifth-octave-fifth cycle for one chord. */
function baselineCycle(chord: Chord, context: LeftHandContext): Pitch[] {
  const bass = bassPitch(chord);
  const root = rootPitch(chord);
  const above = (midi: number) => (midi <= bass ? midi + 12 : midi);

  const fifthTone = { semitones: chord.fifth, letterSteps: 4 };
  const fifth = describeLeftPitch(
    above(root + chord.fifth),
    spellChordDegree(chord, fifthTone, 0),
    context,
  );
  const octave = describeLeftPitch(above(root + 12), chord.root, context);
  return [describeLeftPitch(bass, chord.bass ?? chord.root, context), fifth, octave, fifth];
}

/**
 * Builds the habitual left hand for one measure: one note per beat cycling
 * root, fifth, octave, fifth on the printed chords, restarting at every chord
 * change. A beat that contains a chord change is split at that point.
 */
function buildBaselineMeasure(
  measure: Measure,
  printed: TimedChord[],
  beat: number,
  context: LeftHandContext,
): ArrangementMeasure {
  const slots: Slot[] = [];
  let step = 0;
  let activeTick: number | null = null;

  for (let beatIndex = 0; beatIndex * beat < measure.length; beatIndex += 1) {
    const beatStart = measure.startTick + beatIndex * beat;
    const beatEnd = Math.min(beatStart + beat, measure.startTick + measure.length);
    const cuts = printed
      .map((entry) => entry.tick)
      .filter((tick) => tick > beatStart && tick < beatEnd);
    const edges = [beatStart, ...new Set(cuts), beatEnd];

    for (let edge = 0; edge < edges.length - 1; edge += 1) {
      const start = edges[edge];
      const duration = edges[edge + 1] - start;
      const active = chordAt(printed, start);
      if (active && active.tick !== activeTick) {
        activeTick = active.tick;
        step = 0;
      }

      const chord = active?.chord ?? null;
      const pitches = chord ? [baselineCycle(chord, context)[step % 4]] : [];
      if (chord) step += 1;

      slots.push({
        id: `l${measure.index}-${slots.length}`,
        kind: chord ? 'note' : 'rest',
        start: start - measure.startTick,
        duration,
        pitches,
        beat: beatIndex,
        beams: duration >= beat ? 0 : Math.floor(Math.log2(beat / duration) + 1e-9),
      });
    }
  }

  return { slots, chords: measure.chords.map((mark) => ({ ...mark })) };
}

/** The player's habitual left hand: root, fifth, octave on the printed chords. */
export function buildBaseline(song: Song): Arrangement {
  const printed = chordTimeline(song.measures);
  const beat = beatTicks(song.meta.time);
  const context = leftContext(song);
  return {
    id: BASELINE_ID,
    name: 'My style',
    summary: 'Root, fifth, octave on the printed chords: the pattern you already play.',
    level: 'easy',
    baseline: true,
    tips: [],
    patterns: [],
    measures: song.measures.map((measure) => buildBaselineMeasure(measure, printed, beat, context)),
    issues: [],
  };
}

/** Builds an arrangement from its stored description, measure by measure. */
export function buildArrangement(song: Song, spec: ArrangementSpec): Arrangement {
  const issues: Issue[] = [];
  const printed = chordTimeline(song.measures);
  const beat = beatTicks(song.meta.time);
  const context = leftContext(song);

  const byNumber = new Map<number, ArrangementSpec['measures'][number]>();
  for (const entry of spec.measures) {
    if (byNumber.has(entry.measure)) {
      issues.push({
        severity: 'warning',
        message: `Measure ${entry.measure} is listed more than once; the last entry wins.`,
      });
    }
    byNumber.set(entry.measure, entry);
  }
  const known = new Set(song.measures.map((measure) => measure.number ?? 0));
  for (const number of byNumber.keys()) {
    if (!known.has(number)) {
      issues.push({
        severity: 'warning',
        message: `Measure ${number} does not exist in the song and is ignored.`,
      });
    }
  }

  let carried: Chord | null = null;
  const measures: ArrangementMeasure[] = song.measures.map((measure) => {
    const number = measure.number ?? 0;
    const entry = byNumber.get(number);
    const fallback = (): ArrangementMeasure => {
      carried = chordAt(printed, measure.startTick + measure.length - 1)?.chord ?? carried;
      return buildBaselineMeasure(measure, printed, beat, context);
    };

    if (!entry) {
      issues.push({
        severity: 'info',
        message: 'No left-hand part is written for this measure; the baseline is used.',
        measure: measure.index,
        hand: 'left',
      });
      return fallback();
    }

    const parsed = parseNotationLine(entry.left, beat, 0);
    for (const issue of parsed.issues) {
      issues.push({
        severity: issue.severity,
        message: issue.message,
        measure: measure.index,
        hand: 'left',
      });
    }
    if (parsed.measures.length !== 1) {
      issues.push({
        severity: 'error',
        message: 'Left-hand notation must describe exactly one measure, without barlines.',
        measure: measure.index,
        hand: 'left',
      });
      return { ...fallback(), note: entry.note };
    }

    const raw = parsed.measures[0];
    if (raw.length !== measure.length) {
      issues.push({
        severity: 'error',
        message: `Left hand has ${raw.length / beat} beats; this measure needs ${measure.length / beat}.`,
        measure: measure.index,
        hand: 'left',
      });
    }

    const resolved = resolveLeftMeasure(raw, measure.index, carried, context);
    issues.push(...resolved.issues);
    carried = resolved.chord;

    const chords = resolved.chords.map((mark) => {
      const printedChord = chordAt(printed, measure.startTick + mark.start);
      const changed =
        !printedChord ||
        normalizeChordSymbol(printedChord.symbol) !== normalizeChordSymbol(mark.symbol);
      return { ...mark, changed };
    });

    return { slots: resolved.slots, chords, note: entry.note };
  });

  return {
    id: spec.id,
    name: spec.name,
    summary: spec.summary ?? '',
    level: spec.level ?? 'easy',
    baseline: false,
    tips: spec.tips ?? [],
    patterns: spec.patterns ?? [],
    measures,
    issues,
  };
}
