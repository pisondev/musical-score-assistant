import type { Chord } from './chord.ts';
import { resolveLeftMeasure } from './left-hand.ts';
import { parseNotationLine } from './notation.ts';
import { MAJOR_SCALE } from './notes.ts';
import { beatTicks, measureTicks } from './time.ts';
import type {
  Arrangement,
  ArrangementMeasure,
  Issue,
  Measure,
  MeasurePart,
  Passage,
  PassageSpec,
  Slot,
  Song,
} from './types.ts';
import { validateArrangement } from './validate.ts';

/**
 * What a written passage is for. An introduction, the bridge after the last
 * phrase, and the key lift all lead into the first measure of the song; an
 * ending follows its last measure.
 */
export type PassageRole = 'intro' | 'bridge' | 'modulation' | 'ending';

const PART: Record<PassageRole, MeasurePart> = {
  intro: 'intro',
  bridge: 'intro',
  modulation: 'interlude',
  ending: 'ending',
};

/** Prefixes that keep the slot ids of passages apart from those of the song and of each other. */
const ID_PREFIX: Record<PassageRole, string> = {
  intro: 'i',
  bridge: 'b',
  modulation: 'k',
  ending: 'e',
};

/**
 * Builds a written passage. Both hands are given measure by measure: the
 * right hand relative to the key, the left hand in chord degrees.
 */
export function buildPassage(song: Song, spec: PassageSpec, role: PassageRole): Passage {
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

    // Each passage gets ids of its own, so two of them never collide.
    const prefix = `${ID_PREFIX[role]}-${spec.id}-`;
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
      rolled: slot.rolled || undefined,
    }));

    const resolved = resolveLeftMeasure(rawLeft, index, carried, context);
    issues.push(...resolved.issues);
    carried = resolved.chord;

    measures.push({
      index,
      number: null,
      part: PART[role],
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

  const last = measures[measures.length - 1];
  if (last && role !== 'ending') {
    // The last measure and the song's pickup should complete one full measure.
    const pickup = song.measures[0]?.number === null ? song.measures[0].length : 0;
    if ((last.length + pickup) % full !== 0) {
      issues.push({
        severity: 'warning',
        message: `The last measure and the pickup add up to ${(last.length + pickup) / beat} beats instead of ${full / beat}.`,
        measure: measures.length - 1,
        hand: 'right',
      });
    }
  }
  // An ending closes the piece, so even its last measure is a whole one.
  const whole = role === 'ending' ? measures : measures.slice(0, -1);
  whole.forEach((measure) => {
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
    const passageSong: Song = { ...song, measures, totalTicks: startTick, issues: [] };
    const passageArrangement: Arrangement = {
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
    // Nobody has to find the beat in an ending any more, so its chords may simply be held.
    issues.push(...validateArrangement(passageSong, passageArrangement, role !== 'ending'));
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
