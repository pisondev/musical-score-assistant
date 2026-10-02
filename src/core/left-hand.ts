import { chordDegree, parseChord, spellChordDegree, type Chord } from './chord';
import type { RawMeasure, RawTone } from './notation';
import { describeMidi, lowestAtOrAbove, pitchClass } from './notes';
import { BASS_FLOOR } from './song';
import type { ChordMark, Issue, NoteName, Pitch, Slot } from './types';

export interface LeftHandContext {
  key: NoteName;
  /** MIDI pitch of "1" on the left-hand row. */
  leftDo: number;
}

/** MIDI pitch of a chord root in the bass register. */
export function rootPitch(chord: Chord): number {
  return lowestAtOrAbove(pitchClass(chord.root), BASS_FLOOR);
}

/** MIDI pitch of the bass note: the slash bass when present, otherwise the root. */
export function bassPitch(chord: Chord): number {
  return lowestAtOrAbove(pitchClass(chord.bass ?? chord.root), BASS_FLOOR);
}

/**
 * Resolves a chord-relative degree to a sounding pitch. Degrees count from the
 * chord root, which sits in the octave starting at the bass floor; octave marks
 * move the note from there.
 */
export function resolveChordTone(chord: Chord, tone: RawTone, context: LeftHandContext): Pitch {
  const degree = chordDegree(chord, tone.degree, context.key);
  const midi = rootPitch(chord) + degree.semitones + tone.accidental + 12 * tone.octave;
  const name = spellChordDegree(chord, degree, tone.accidental);
  return { midi, tone: describeMidi(midi, name, context.key, context.leftDo) };
}

/** Writes a pitch on the left-hand row using the spelling of a chord member. */
export function describeLeftPitch(
  midi: number,
  name: NoteName | null,
  context: LeftHandContext,
): Pitch {
  return { midi, tone: describeMidi(midi, name, context.key, context.leftDo) };
}

export interface ResolvedLeftMeasure {
  slots: Slot[];
  chords: ChordMark[];
  /** Chord in effect at the end of the measure, carried into the next one. */
  chord: Chord | null;
  issues: Issue[];
}

/**
 * Turns parsed left-hand notation into slots with sounding pitches. Chord
 * symbols inside the notation set the harmony from that point on; a measure
 * without one continues the chord of the previous measure.
 */
export function resolveLeftMeasure(
  raw: RawMeasure,
  measureIndex: number,
  carriedChord: Chord | null,
  context: LeftHandContext,
): ResolvedLeftMeasure {
  const issues: Issue[] = [];
  const marks = [...raw.chords].sort((a, b) => a.start - b.start);
  const chords: ChordMark[] = [];
  const parsedMarks = marks.map((mark) => {
    const chord = parseChord(mark.symbol);
    if (!chord) {
      issues.push({
        severity: 'error',
        message: `Chord [${mark.symbol}] is not recognized.`,
        measure: measureIndex,
        hand: 'left',
      });
    }
    chords.push({ start: mark.start, symbol: mark.symbol, recognized: chord !== null });
    return { start: mark.start, chord };
  });

  let current = carriedChord;
  let markIndex = 0;

  const slots: Slot[] = raw.slots.map((slot, slotIndex) => {
    while (markIndex < parsedMarks.length && parsedMarks[markIndex].start <= slot.start) {
      current = parsedMarks[markIndex].chord;
      markIndex += 1;
    }

    const pitches: Pitch[] = [];
    if (slot.kind === 'note') {
      if (current) {
        for (const tone of slot.tones) pitches.push(resolveChordTone(current, tone, context));
        pitches.sort((a, b) => a.midi - b.midi);
      } else {
        issues.push({
          severity: 'error',
          message:
            'Left-hand note has no chord to refer to; start the measure with a chord symbol.',
          measure: measureIndex,
          hand: 'left',
        });
      }
    }

    return {
      id: `l${measureIndex}-${slotIndex}`,
      kind: slot.kind,
      start: slot.start,
      duration: slot.duration,
      pitches,
      beat: slot.beat,
      beams: slot.beams,
      tuplet: slot.tuplet,
    };
  });

  while (markIndex < parsedMarks.length) {
    current = parsedMarks[markIndex].chord;
    markIndex += 1;
  }

  return { slots, chords, chord: current, issues };
}
