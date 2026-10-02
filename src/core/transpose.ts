import { transposeChordSymbol } from './chord';
import { mod, parseNoteName, pitchClass } from './notes';
import type {
  Arrangement,
  ArrangementMeasure,
  ChordMark,
  Measure,
  NoteName,
  Slot,
  Song,
} from './types';

/** Key names used after transposing, one per pitch class. */
const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** The interval between two keys: how many letters and how many semitones up. */
export interface KeyShift {
  key: NoteName;
  letterSteps: number;
  /** Semitones upward, between 0 and 11, used to respell chord symbols. */
  semitones: number;
  /** Signed number of semitones the pitches move. */
  pitchShift: number;
}

/** Works out the key that lies `semitones` above (or below) the given key. */
export function keyShift(from: NoteName, semitones: number): KeyShift {
  const target = parseNoteName(KEY_NAMES[mod(pitchClass(from) + semitones, 12)])!;
  return {
    key: target,
    letterSteps: mod(target.letter - from.letter, 7),
    semitones: mod(semitones, 12),
    pitchShift: semitones,
  };
}

function shiftSlots(slots: Slot[], amount: number): Slot[] {
  return slots.map((slot) => ({
    ...slot,
    pitches: slot.pitches.map((pitch) => ({ midi: pitch.midi + amount, tone: pitch.tone })),
  }));
}

function shiftChords(chords: ChordMark[], shift: KeyShift): ChordMark[] {
  return chords.map((chord) => ({
    ...chord,
    symbol: chord.recognized
      ? transposeChordSymbol(chord.symbol, shift.letterSteps, shift.semitones)
      : chord.symbol,
  }));
}

/**
 * Moves a song and its arrangement to another key. Numbered notation is
 * relative to "do", so the digits stay as they are: only the pitches, the
 * chord symbols, and the note that "1" stands for change.
 */
export function transpose(
  song: Song,
  arrangement: Arrangement,
  semitones: number,
): { song: Song; arrangement: Arrangement } {
  if (semitones === 0) return { song, arrangement };
  const shift = keyShift(song.meta.key, semitones);

  const measures: Measure[] = song.measures.map((measure) => ({
    ...measure,
    slots: shiftSlots(measure.slots, shift.pitchShift),
    chords: shiftChords(measure.chords, shift),
  }));
  const parts: ArrangementMeasure[] = arrangement.measures.map((part) => ({
    ...part,
    slots: shiftSlots(part.slots, shift.pitchShift),
    chords: shiftChords(part.chords, shift),
  }));

  return {
    song: {
      ...song,
      meta: { ...song.meta, key: shift.key },
      rightDo: song.rightDo + shift.pitchShift,
      leftDo: song.leftDo + shift.pitchShift,
      measures,
    },
    arrangement: { ...arrangement, measures: parts },
  };
}
