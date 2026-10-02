import { describe, expect, it } from 'vitest';
import { chordDegree, formatChordSymbol, parseChord } from '../src/core/chord';
import { describeMidi, parseNoteName, pitchClass, toneToText } from '../src/core/notes';

const F_MAJOR = parseNoteName('F')!;

describe('parseNoteName', () => {
  it('reads western and Indonesian key names', () => {
    expect(pitchClass(parseNoteName('F')!)).toBe(5);
    expect(pitchClass(parseNoteName('Bb')!)).toBe(10);
    expect(pitchClass(parseNoteName('f#')!)).toBe(6);
    expect(pitchClass(parseNoteName('Bes')!)).toBe(10);
    expect(pitchClass(parseNoteName('Es')!)).toBe(3);
    expect(pitchClass(parseNoteName('As')!)).toBe(8);
    expect(pitchClass(parseNoteName('Fis')!)).toBe(6);
    expect(parseNoteName('H')).toBeNull();
  });
});

describe('parseChord', () => {
  it.each([
    ['C', 4, 7, null],
    ['Gm', 3, 7, null],
    ['F7', 4, 7, 10],
    ['Dm7', 3, 7, 10],
    ['Cmaj7', 4, 7, 11],
    ['C+', 4, 8, null],
    ['Abdim', 3, 6, null],
    ['Abo', 3, 6, null],
    ['Bdim7', 3, 6, 9],
    ['Csus4', 5, 7, null],
    ['C7sus4', 5, 7, 10],
    ['Em7b5', 3, 6, 10],
    ['Fadd9', 4, 7, null],
  ])('reads %s', (symbol, third, fifth, seventh) => {
    const chord = parseChord(symbol);
    expect(chord).not.toBeNull();
    expect([chord!.third, chord!.fifth, chord!.seventh]).toEqual([third, fifth, seventh]);
  });

  it('reads the bass of a slash chord', () => {
    const chord = parseChord('G7/B')!;
    expect(pitchClass(chord.root)).toBe(7);
    expect(pitchClass(chord.bass!)).toBe(11);
    expect(chord.seventh).toBe(10);
  });

  it('rejects symbols it does not understand', () => {
    expect(parseChord('H7')).toBeNull();
    expect(parseChord('Cxyz')).toBeNull();
    expect(parseChord('')).toBeNull();
  });
});

describe('chordDegree', () => {
  it('uses the key to choose passing tones and missing sevenths', () => {
    const f = parseChord('F')!;
    // In F major the seventh above F is E natural and the fourth is B flat.
    expect(chordDegree(f, 7, F_MAJOR).semitones).toBe(11);
    expect(chordDegree(f, 4, F_MAJOR).semitones).toBe(5);
    expect(chordDegree(f, 2, F_MAJOR).semitones).toBe(2);

    const gm = parseChord('Gm')!;
    // Above G in F major: A (2), C (4), E (6), F (7).
    expect(chordDegree(gm, 7, F_MAJOR).semitones).toBe(10);
    expect(chordDegree(gm, 6, F_MAJOR).semitones).toBe(9);
  });

  it('uses the chord itself for chord tones', () => {
    expect(chordDegree(parseChord('F7')!, 7, F_MAJOR).semitones).toBe(10);
    expect(chordDegree(parseChord('Abdim')!, 7, F_MAJOR).semitones).toBe(9);
    expect(chordDegree(parseChord('C+')!, 5, F_MAJOR).semitones).toBe(8);
    expect(chordDegree(parseChord('Csus4')!, 3, F_MAJOR).semitones).toBe(5);
  });
});

describe('formatChordSymbol', () => {
  it('uses musical symbols for accidentals and diminished chords', () => {
    expect(formatChordSymbol('Bb')).toBe('B♭');
    expect(formatChordSymbol('Abdim')).toBe('A♭°');
    expect(formatChordSymbol('F#m7')).toBe('F♯m7');
    expect(formatChordSymbol('F7/Eb')).toBe('F7/E♭');
    expect(formatChordSymbol('Em7b5')).toBe('Em7♭5');
  });
});

describe('describeMidi', () => {
  const leftDo = 41; // F2

  it('spells chromatic notes from their letter names', () => {
    const write = (midi: number, name: string) =>
      toneToText(describeMidi(midi, parseNoteName(name), F_MAJOR, leftDo));
    expect(write(47, 'B')).toBe('#4');
    expect(write(39, 'Eb')).toBe('b7,');
    expect(write(44, 'Ab')).toBe('b3');
    expect(write(41, 'F')).toBe('1');
    expect(write(48, 'C')).toBe('5');
    expect(write(53, 'F')).toBe("1'");
    expect(write(36, 'C')).toBe('5,');
  });

  it('falls back to a default spelling without a letter name', () => {
    expect(toneToText(describeMidi(47, null, F_MAJOR, leftDo))).toBe('#4');
    expect(toneToText(describeMidi(51, null, F_MAJOR, leftDo))).toBe('b7');
  });
});
