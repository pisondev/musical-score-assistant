import { buildLeftMeasure, chordAt, chordTimeline } from './arrangement.ts';
import type { Chord } from './chord.ts';
import { parseNotationLine } from './notation.ts';
import { toneToMidi } from './notes.ts';
import { beatTicks } from './time.ts';
import type {
  Arrangement,
  ArrangementMeasure,
  Issue,
  Measure,
  RightHandMeasure,
  RightHandMeasureSpec,
  RightHandMode,
  RightHandPart,
  RightHandPartKind,
  RightHandPartSpec,
  Slot,
  Song,
  WrittenRightHandMode,
} from './types.ts';

/**
 * Right-hand parts.
 *
 * Besides the printed melody, the right hand can play the melody with fills
 * where it waits, or an accompaniment for singers. Where it plays the melody,
 * chords can be put under the melody notes at the strong points. All of it is
 * written per left-hand arrangement, because it has to agree with its chords
 * and share the gaps of the melody with its fills.
 */

/** The written right-hand modes, in the order they are offered. */
export const RIGHT_HAND_MODES: readonly WrittenRightHandMode[] = ['fills', 'accompaniment'];

/** Every part an arrangement can write for the right hand, in the order they are checked. */
export const RIGHT_HAND_PARTS: readonly RightHandPartKind[] = ['harmony', 'fills', 'accompaniment'];

/** Keeps the slot ids of a right-hand part apart from those of the melody it replaces. */
const SLOT_PREFIX: Record<RightHandPartKind, string> = {
  harmony: 'h',
  fills: 'f',
  accompaniment: 'a',
};

function restMeasure(measure: Measure, prefix: string): RightHandMeasure {
  return {
    slots: [
      {
        id: `${prefix}${measure.index}-0`,
        kind: 'rest',
        start: 0,
        duration: measure.length,
        pitches: [],
        beat: 0,
        beams: 0,
      },
    ],
  };
}

/**
 * Separates what a fill adds from the melody it is written around. A part
 * writes the measure on one line, melody included, but a long melody note is
 * meant to ring on while the fill moves. So the melody stays as printed, and
 * the added notes become a second voice: a slot that adds nothing turns into
 * a rest, which keeps that voice in time.
 */
function addedVoice(measure: Measure, slots: Slot[]): Slot[] {
  const melody = new Map<number, number>();
  for (const slot of measure.slots) {
    const top = slot.pitches[slot.pitches.length - 1];
    if (slot.kind === 'note' && top) melody.set(slot.start, top.midi);
  }

  let sounding = false;
  return slots.map((slot): Slot => {
    const silent: Slot = { ...slot, kind: 'rest', pitches: [] };
    // A hold dot continues the added note before it, or the melody, which needs nothing here.
    if (slot.kind === 'hold') return sounding ? slot : silent;
    const added =
      slot.kind === 'note'
        ? slot.pitches.filter((pitch) => pitch.midi !== melody.get(slot.start))
        : [];
    sounding = added.length > 0;
    return sounding ? { ...slot, pitches: added } : silent;
  });
}

/**
 * Builds one right-hand part of an arrangement from its stored description.
 * The right hand is written relative to the key, like the melody. A measure
 * may also replace the left hand, for the places where the hands trade roles.
 */
export function buildRightHandPart(
  song: Song,
  arrangement: Arrangement,
  mode: RightHandPartKind,
  spec: RightHandPartSpec,
): RightHandPart {
  const issues: Issue[] = [];
  const beat = beatTicks(song.meta.time);
  const prefix = SLOT_PREFIX[mode];
  const printed = chordTimeline(song.measures);
  const harmony = chordTimeline(
    song.measures.map((measure, index) => ({
      startTick: measure.startTick,
      chords: arrangement.measures[index].chords,
    })),
  );

  const byNumber = new Map<number, RightHandMeasureSpec>();
  for (const entry of spec.measures) {
    if (byNumber.has(entry.measure)) {
      issues.push({
        severity: 'warning',
        message: `Measure ${entry.measure} is listed more than once; the last entry wins.`,
        hand: 'right',
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
        hand: 'right',
      });
    }
  }

  // Chord at the end of the previous measure, when that measure replaced the left hand.
  let replaced: { chord: Chord | null } | null = null;

  const measures = song.measures.map((measure): RightHandMeasure | null => {
    const entry = byNumber.get(measure.number ?? 0);
    const before = replaced;
    replaced = null;
    const report = (message: string, severity: Issue['severity'] = 'error') =>
      issues.push({ severity, message, measure: measure.index, hand: 'right' });

    // An accompaniment replaces the melody everywhere, so a missing measure is a silent one.
    const missing = () => (mode === 'accompaniment' ? restMeasure(measure, prefix) : null);

    if (!entry) {
      if (mode === 'accompaniment') {
        report('No accompaniment is written for this measure; the right hand rests.', 'warning');
      }
      return missing();
    }

    const parsed = parseNotationLine(entry.right, beat, 0);
    parsed.issues.forEach((issue) => report(issue.message, issue.severity));
    if (parsed.measures.length !== 1) {
      report('Right-hand notation must describe exactly one measure, without barlines.');
      return missing();
    }

    const raw = parsed.measures[0];
    if (raw.length !== measure.length) {
      report(
        `Right hand has ${raw.length / beat} beats; this measure needs ${measure.length / beat}.`,
      );
    }
    if (raw.chords.length > 0) {
      report(
        'Chords belong in the left-hand notation; those in the right hand are ignored.',
        'warning',
      );
    }
    if (raw.dynamics.length > 0) {
      report('Dynamics belong in song.txt; those in a right-hand part are ignored.', 'warning');
    }

    const slots: Slot[] = raw.slots.map((slot, slotIndex) => ({
      id: `${prefix}${measure.index}-${slotIndex}`,
      kind: slot.kind,
      start: slot.start,
      duration: slot.duration,
      pitches: slot.tones
        .map((tone) => ({ midi: toneToMidi(tone, song.rightDo), tone: { ...tone } }))
        .sort((a, b) => a.midi - b.midi),
      beat: slot.beat,
      beams: slot.beams,
      tuplet: slot.tuplet,
      rolled: slot.rolled || undefined,
      uncertain: slot.uncertain || undefined,
    }));

    let left: ArrangementMeasure | undefined;
    if (entry.left !== undefined) {
      const carried = before
        ? before.chord
        : (chordAt(harmony, measure.startTick - 1)?.chord ?? null);
      const built = buildLeftMeasure(song, measure, entry.left, carried, printed, issues);
      if (built) {
        left = built.part;
        replaced = { chord: built.chord };
      }
    }

    const fills = mode === 'fills' ? addedVoice(measure, slots) : undefined;
    return { slots, fills, left, note: entry.note };
  });

  return { mode, summary: spec.summary ?? '', measures, issues };
}

/**
 * Puts the written chords under the melody notes of a measure. The melody
 * keeps its rhythm, its ids, and its lyrics; a note becomes a stack only where
 * the part writes one with that same note on top.
 */
function harmonize(measure: Measure, written: Slot[]): Slot[] {
  const chords = new Map<number, Slot>();
  for (const slot of written) {
    if (slot.kind === 'note' && slot.pitches.length > 1) chords.set(slot.start, slot);
  }
  return measure.slots.map((slot) => {
    const chord = chords.get(slot.start);
    const top = slot.pitches[slot.pitches.length - 1];
    const chordTop = chord?.pitches[chord.pitches.length - 1];
    if (!chord || slot.kind !== 'note' || !top || chordTop?.midi !== top.midi) return slot;
    return { ...slot, pitches: chord.pitches, rolled: chord.rolled };
  });
}

/** Leaves out of a fill what the right hand already holds in the chord under the melody. */
function withoutDoubles(fills: Slot[] | undefined, melody: Slot[]): Slot[] | undefined {
  if (!fills) return fills;
  const held = new Map<number, Set<number>>();
  for (const slot of melody) {
    if (slot.pitches.length > 1) held.set(slot.start, new Set(slot.pitches.map((p) => p.midi)));
  }
  if (held.size === 0) return fills;
  return fills.map((slot) => {
    const doubled = held.get(slot.start);
    if (!doubled || slot.kind !== 'note') return slot;
    const pitches = slot.pitches.filter((pitch) => !doubled.has(pitch.midi));
    return pitches.length > 0 ? { ...slot, pitches } : { ...slot, kind: 'rest', pitches: [] };
  });
}

/**
 * Puts a right-hand part into a song. The result is an ordinary song and
 * arrangement. The chords become stacks under the melody notes; fills leave
 * the melody as it is and add their notes as the second voice `fills`; an
 * accompaniment takes the place of the melody, which every measure keeps as
 * its `voice`. The left hand is the arrangement with the measures the part
 * replaces.
 */
export function composeRightHand(
  song: Song,
  arrangement: Arrangement,
  part: RightHandPart,
): { song: Song; arrangement: Arrangement } {
  const measures: Measure[] = song.measures.map((measure, index) => {
    const written = part.measures[index];
    if (!written) return measure;
    if (part.mode === 'harmony') return { ...measure, slots: harmonize(measure, written.slots) };
    return part.mode === 'fills'
      ? { ...measure, fills: withoutDoubles(written.fills, measure.slots) }
      : { ...measure, slots: written.slots, voice: measure.slots };
  });

  const parts: ArrangementMeasure[] = arrangement.measures.map((own, index) => {
    const written = part.measures[index];
    if (!written) return own;
    return written.left
      ? { ...written.left, rightNote: written.note }
      : { ...own, rightNote: written.note };
  });

  return {
    song: { ...song, measures },
    arrangement: {
      ...arrangement,
      measures: parts,
      issues: [...arrangement.issues, ...part.issues],
    },
  };
}

/** The right-hand mode that is actually available for an arrangement. */
export function availableRightHand(arrangement: Arrangement, mode: RightHandMode): RightHandMode {
  return mode !== 'melody' && arrangement.rightHand[mode] ? mode : 'melody';
}

/** Whether the chords under the melody apply: they are written, asked for, and the melody is played. */
export function chordsApply(
  arrangement: Arrangement,
  mode: RightHandMode,
  chords: boolean,
): boolean {
  return chords && mode !== 'accompaniment' && arrangement.rightHand.harmony !== undefined;
}

/**
 * Applies a right-hand mode to a song and an arrangement. The melody, and any
 * mode the arrangement has no part for, leaves both as they are. With
 * `chords`, the modes that play the melody get the written chords under it.
 */
export function applyRightHand(
  song: Song,
  arrangement: Arrangement,
  mode: RightHandMode,
  chords = false,
): { song: Song; arrangement: Arrangement } {
  let result = { song, arrangement };
  const harmony = arrangement.rightHand.harmony;
  if (harmony && chordsApply(arrangement, mode, chords)) {
    result = composeRightHand(result.song, result.arrangement, harmony);
  }
  const part = mode === 'melody' ? undefined : arrangement.rightHand[mode];
  return part ? composeRightHand(result.song, result.arrangement, part) : result;
}
