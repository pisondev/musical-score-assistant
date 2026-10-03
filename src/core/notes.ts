import type { NoteName, ScaleTone } from './types.ts';

const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];
const FLAT_PITCH_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Semitone offsets of the major scale degrees 1-7. */
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

/**
 * Preferred numbered-notation spelling for each semitone above "do", used when
 * a pitch has no letter spelling of its own.
 */
const DEFAULT_SPELLING: ReadonlyArray<readonly [degree: number, accidental: number]> = [
  [1, 0],
  [1, 1],
  [2, 0],
  [3, -1],
  [3, 0],
  [4, 0],
  [4, 1],
  [5, 0],
  [6, -1],
  [6, 0],
  [7, -1],
  [7, 0],
];

/** Modulo that always returns a non-negative result. */
export function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function accidentalFromText(text: string): number {
  let accidental = 0;
  for (const char of text) {
    if (char === '#' || char === '♯') accidental += 1;
    if (char === 'b' || char === '♭') accidental -= 1;
  }
  return accidental;
}

/**
 * Parses a note name such as "F", "Bb", or "F#". Indonesian key names printed
 * in hymnals ("Bes", "Es", "As", "Fis") are accepted as well.
 */
export function parseNoteName(text: string): NoteName | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const letterOf = (char: string) => LETTER_NAMES.indexOf(char.toUpperCase());

  if (/^(as|es)$/i.test(trimmed)) {
    return { letter: letterOf(trimmed[0]), accidental: -1 };
  }
  const indonesian = /^([A-Ga-g])(es|is)$/.exec(trimmed);
  if (indonesian) {
    return {
      letter: letterOf(indonesian[1]),
      accidental: indonesian[2].toLowerCase() === 'is' ? 1 : -1,
    };
  }
  const western = /^([A-Ga-g])([#b♯♭]{0,2})$/.exec(trimmed);
  if (western) {
    return { letter: letterOf(western[1]), accidental: accidentalFromText(western[2]) };
  }
  return null;
}

export function pitchClass(name: NoteName): number {
  return mod(LETTER_PITCH_CLASSES[name.letter] + name.accidental, 12);
}

function accidentalSymbols(accidental: number, sharp: string, flat: string): string {
  return accidental >= 0 ? sharp.repeat(accidental) : flat.repeat(-accidental);
}

/** Formats a note name for display, e.g. "B♭". */
export function formatNoteName(name: NoteName): string {
  return LETTER_NAMES[name.letter] + accidentalSymbols(name.accidental, '♯', '♭');
}

/** Writes a note name in plain text, as used in chord symbols, e.g. "Bb". */
export function noteNameToText(name: NoteName): string {
  return LETTER_NAMES[name.letter] + accidentalSymbols(name.accidental, '#', 'b');
}

/**
 * Replaces spellings that are correct but hard to read (double accidentals,
 * E sharp, C flat) with the everyday name of the same pitch.
 */
export function simplifyNoteName(name: NoteName): NoteName {
  const awkward =
    Math.abs(name.accidental) > 1 ||
    (name.accidental === 1 && (name.letter === 2 || name.letter === 6)) ||
    (name.accidental === -1 && (name.letter === 0 || name.letter === 3));
  return awkward ? parseNoteName(FLAT_PITCH_NAMES[pitchClass(name)])! : name;
}

/** Formats a MIDI pitch as a plain-text name with its octave, e.g. "Bb2". */
export function midiToText(midi: number): string {
  return `${FLAT_PITCH_NAMES[mod(midi, 12)]}${Math.floor(midi / 12) - 1}`;
}

/** Returns the lowest MIDI pitch with the given pitch class that is not below the floor. */
export function lowestAtOrAbove(pitchClassValue: number, floor: number): number {
  return floor + mod(pitchClassValue - floor, 12);
}

/**
 * Spells the note that lies a given interval above a root: `letterSteps` picks
 * the letter (2 for a third, 4 for a fifth) and `semitones` fixes the accidental.
 */
export function spellAbove(root: NoteName, letterSteps: number, semitones: number): NoteName {
  const letter = mod(root.letter + letterSteps, 7);
  const naturalDistance = mod(LETTER_PITCH_CLASSES[letter] - LETTER_PITCH_CLASSES[root.letter], 12);
  const difference = mod(semitones - naturalDistance + 6, 12) - 6;
  return { letter, accidental: root.accidental + difference };
}

/** MIDI pitch of a numbered-notation tone relative to a reference "do". */
export function toneToMidi(tone: ScaleTone, referenceDo: number): number {
  return referenceDo + MAJOR_SCALE[tone.degree - 1] + tone.accidental + 12 * tone.octave;
}

/**
 * Writes a MIDI pitch in numbered notation relative to a reference "do".
 * When a letter spelling is given it decides between enharmonic options
 * (B natural in F major reads "#4", not "b5").
 */
export function describeMidi(
  midi: number,
  name: NoteName | null,
  key: NoteName,
  referenceDo: number,
): ScaleTone {
  if (name) {
    const degree = mod(name.letter - key.letter, 7) + 1;
    const diatonic = mod(pitchClass(key) + MAJOR_SCALE[degree - 1], 12);
    const accidental = mod(midi - diatonic + 6, 12) - 6;
    // "b1", "b4", "#3" and "#7" name plain scale notes (7, 3, 4 and 1), and the
    // raised fourth reads more easily than a lowered fifth; use the usual spelling for those.
    const unusual =
      (accidental === -1 && (degree === 1 || degree === 4 || degree === 5)) ||
      (accidental === 1 && (degree === 3 || degree === 7));
    if (Math.abs(accidental) <= 1 && !unusual) {
      const octave = Math.floor((midi - accidental - referenceDo) / 12);
      return { degree, accidental, octave };
    }
  }
  const [degree, accidental] = DEFAULT_SPELLING[mod(midi - referenceDo, 12)];
  const octave = Math.floor((midi - accidental - referenceDo) / 12);
  return { degree, accidental, octave };
}

/** True when a pitch class belongs to the major scale of the key. */
export function isInKey(pitchClassValue: number, key: NoteName): boolean {
  return MAJOR_SCALE.includes(mod(pitchClassValue - pitchClass(key), 12));
}

/** Writes a numbered-notation tone as plain text, e.g. "#4" or "5,". */
export function toneToText(tone: ScaleTone): string {
  const accidental = accidentalSymbols(tone.accidental, '#', 'b');
  const octave = tone.octave >= 0 ? "'".repeat(tone.octave) : ','.repeat(-tone.octave);
  return `${accidental}${tone.degree}${octave}`;
}
