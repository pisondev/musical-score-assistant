import { transposeChordSymbol } from './chord';
import { KEYBOARD_LOWEST } from './keyboard';
import { mod, parseNoteName, pitchClass } from './notes';
import type {
  Arrangement,
  ArrangementMeasure,
  ChordMark,
  Measure,
  NoteName,
  Pitch,
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

/**
 * Shifts left-hand slots and keeps them on the keyboard: a note that would
 * fall below the lowest key is played an octave higher, and when that lands
 * on a note already in the stack (the upper half of an octave) it is dropped.
 */
function shiftLeftSlots(slots: Slot[], amount: number): Slot[] {
  return slots.map((slot) => {
    const pitches: Pitch[] = [];
    for (const pitch of slot.pitches) {
      let midi = pitch.midi + amount;
      let tone = pitch.tone;
      while (midi < KEYBOARD_LOWEST) {
        midi += 12;
        tone = { ...tone, octave: tone.octave + 1 };
      }
      if (!pitches.some((existing) => existing.midi === midi)) pitches.push({ midi, tone });
    }
    return { ...slot, pitches: pitches.sort((a, b) => a.midi - b.midi) };
  });
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
 * chord symbols, and the note that "1" stands for change. The one exception is
 * a left-hand note that would leave the keyboard at the bottom; it moves up an
 * octave.
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
    voice: measure.voice && shiftSlots(measure.voice, shift.pitchShift),
    chords: shiftChords(measure.chords, shift),
  }));
  const parts: ArrangementMeasure[] = arrangement.measures.map((part) => ({
    ...part,
    slots: shiftLeftSlots(part.slots, shift.pitchShift),
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
