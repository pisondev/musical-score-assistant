import {
  formatNoteName,
  isInKey,
  mod,
  noteNameToText,
  parseNoteName,
  pitchClass,
  simplifyNoteName,
  spellAbove,
} from './notes';
import type { NoteName } from './types';

export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'suspended';

export interface Chord {
  /** Symbol as written in the source, e.g. "G7/B". */
  symbol: string;
  root: NoteName;
  /** Bass note of a slash chord, or null when the root is in the bass. */
  bass: NoteName | null;
  quality: ChordQuality;
  /** Semitones above the root for the third (or the suspended tone). */
  third: number;
  /** Letter steps of the "third": 2 for a real third, 3 for sus4, 1 for sus2. */
  thirdSteps: number;
  fifth: number;
  /** Semitones above the root for the seventh, or null when the chord has none. */
  seventh: number | null;
  /** Added notes such as the sixth, ninth, or thirteenth, in semitones above the root (0-11). */
  extensions: number[];
}

interface ChordTone {
  semitones: number;
  letterSteps: number;
}

const CHORD_PATTERN = /^([A-G][#b♯♭]?)([^/]*)(?:\/([A-G][#b♯♭]?))?$/;

/** Semitones above the root for the natural form of each extension number. */
const EXTENSION_SEMITONES: Record<string, number> = {
  '2': 2,
  '4': 5,
  '6': 9,
  '9': 2,
  '11': 5,
  '13': 9,
};

/** Parses a chord symbol; returns null when the symbol is not understood. */
export function parseChord(symbol: string): Chord | null {
  const match = CHORD_PATTERN.exec(symbol.trim());
  if (!match) return null;

  const root = parseNoteName(match[1]);
  if (!root) return null;
  const bass = match[3] ? parseNoteName(match[3]) : null;
  if (match[3] && !bass) return null;

  let rest = match[2];
  let quality: ChordQuality = 'major';
  let third = 4;
  let thirdSteps = 2;
  let fifth = 7;
  let seventh: number | null = null;
  const extensions: number[] = [];

  const take = (pattern: RegExp): RegExpExecArray | null => {
    const found = pattern.exec(rest);
    if (found) rest = rest.slice(found[0].length);
    return found;
  };
  /** Records an extension such as "9", "b9", or "#11". */
  const extend = (number: string, accidental = ''): void => {
    const shift = accidental === '' ? 0 : /[#♯]/.test(accidental) ? 1 : -1;
    extensions.push(mod(EXTENSION_SEMITONES[number] + shift, 12));
  };

  if (take(/^(dim|o|°)/)) {
    quality = 'diminished';
    third = 3;
    fifth = 6;
  } else if (take(/^(aug|\+)/)) {
    quality = 'augmented';
    fifth = 8;
  } else if (take(/^(min|m(?!aj)|-)/)) {
    quality = 'minor';
    third = 3;
  }

  // A chord named after its ninth, eleventh, or thirteenth also has a seventh.
  const major = take(/^(?:maj|M|Δ)(7|9|11|13)?/);
  const dominant = major ? null : take(/^(7|9|11|13)/);
  if (major) {
    seventh = 11;
    if (major[1] && major[1] !== '7') extend(major[1]);
  } else if (dominant) {
    seventh = quality === 'diminished' ? 9 : 10;
    if (dominant[1] !== '7') extend(dominant[1]);
  } else {
    const added = take(/^(6|2)/);
    if (added) extend(added[1]);
  }

  let progressed = true;
  while (rest !== '' && progressed) {
    progressed = false;
    if (take(/^sus2/)) {
      quality = 'suspended';
      third = 2;
      thirdSteps = 1;
      progressed = true;
    } else if (take(/^sus4?/)) {
      quality = 'suspended';
      third = 5;
      thirdSteps = 3;
      progressed = true;
    } else if (take(/^[b♭]5/)) {
      fifth = 6;
      progressed = true;
    } else if (take(/^[#♯]5/)) {
      fifth = 8;
      progressed = true;
    } else {
      const added = take(/^(?:add)?([b#♭♯]?)(2|4|6|9|11|13)/);
      if (added) {
        extend(added[2], added[1]);
        progressed = true;
      }
    }
  }
  if (rest !== '') return null;

  return {
    symbol: symbol.trim(),
    root,
    bass,
    quality,
    third,
    thirdSteps,
    fifth,
    seventh,
    extensions,
  };
}

/**
 * Resolves a chord degree (1-7) to semitones above the root. Degrees 1, 3, 5
 * and 7 are chord tones. Degrees 2, 4 and 6 are the ninth, eleventh and
 * thirteenth when the chord names them (the 6 of "Dm6", the 9 of "A9");
 * otherwise they are the scale notes of the song key that lie between the
 * chord tones, so they work as passing tones.
 */
export function chordDegree(chord: Chord, degree: number, key: NoteName): ChordTone {
  const rootClass = pitchClass(chord.root);
  const fromKey = (preferred: number, ...alternatives: number[]): number => {
    const candidates = [preferred, ...alternatives];
    const named = candidates.find((semitones) => chord.extensions.includes(semitones));
    if (named !== undefined) return named;
    return candidates.find((semitones) => isInKey(rootClass + semitones, key)) ?? preferred;
  };

  switch (degree) {
    case 1:
      return { semitones: 0, letterSteps: 0 };
    case 2:
      return { semitones: fromKey(2, 1, 3), letterSteps: 1 };
    case 3:
      return { semitones: chord.third, letterSteps: chord.thirdSteps };
    case 4:
      return { semitones: fromKey(5, 6), letterSteps: 3 };
    case 5:
      return { semitones: chord.fifth, letterSteps: 4 };
    case 6:
      return { semitones: fromKey(9, 8), letterSteps: 5 };
    case 7: {
      if (chord.seventh !== null) return { semitones: chord.seventh, letterSteps: 6 };
      if (chord.quality === 'diminished') return { semitones: 9, letterSteps: 6 };
      return { semitones: fromKey(11, 10), letterSteps: 6 };
    }
    default:
      throw new RangeError(`Chord degree must be between 1 and 7, received ${degree}.`);
  }
}

/** Spells the note a chord degree refers to, including a chromatic alteration. */
export function spellChordDegree(chord: Chord, tone: ChordTone, alteration: number): NoteName {
  const spelled = spellAbove(chord.root, tone.letterSteps, tone.semitones);
  return { letter: spelled.letter, accidental: spelled.accidental + alteration };
}

/** Pitch classes of the chord tones, used to judge how well a melody note fits. */
export function chordPitchClasses(chord: Chord): number[] {
  const rootClass = pitchClass(chord.root);
  const classes = [rootClass, rootClass + chord.third, rootClass + chord.fifth];
  if (chord.seventh !== null) classes.push(rootClass + chord.seventh);
  for (const extension of chord.extensions) classes.push(rootClass + extension);
  if (chord.bass) classes.push(pitchClass(chord.bass));
  return [...new Set(classes.map((value) => mod(value, 12)))];
}

/** Formats a chord symbol for display, e.g. "Abdim" becomes "A♭°" and "G7/B" stays "G7/B". */
export function formatChordSymbol(symbol: string): string {
  const match = CHORD_PATTERN.exec(symbol.trim());
  if (!match) return symbol;
  const root = parseNoteName(match[1]);
  if (!root) return symbol;
  const quality = match[2]
    .replace(/^(dim|o)/, '°')
    .replace(/^aug/, '+')
    .replace(/b/g, '♭')
    .replace(/#/g, '♯');
  const bass = match[3] ? parseNoteName(match[3]) : null;
  return formatNoteName(root) + quality + (bass ? `/${formatNoteName(bass)}` : '');
}

/** Normalizes a symbol so that equivalent spellings compare equal. */
export function normalizeChordSymbol(symbol: string): string {
  return formatChordSymbol(symbol).replace(/\s+/g, '');
}

/**
 * Moves a chord symbol to another key. `letterSteps` and `semitones` describe
 * the interval between the old and the new key, so the chord keeps its
 * relation to the key ("Bb" in F becomes "C" in G).
 */
export function transposeChordSymbol(
  symbol: string,
  letterSteps: number,
  semitones: number,
): string {
  const match = CHORD_PATTERN.exec(symbol.trim());
  if (!match) return symbol;
  const move = (text: string): string | null => {
    const name = parseNoteName(text);
    return name ? noteNameToText(simplifyNoteName(spellAbove(name, letterSteps, semitones))) : null;
  };
  const root = move(match[1]);
  const bass = match[3] ? move(match[3]) : null;
  if (!root || (match[3] && !bass)) return symbol;
  return root + match[2] + (bass ? `/${bass}` : '');
}
