import { describe, expect, it } from 'vitest';
import { parseSong } from '../src/core/song';

const WALTZ = `
title: Test Waltz
key: G
time: 3/4
tempo: 90

section: Verse
| 5, | [G]1 . (3 1) | [D7]3 . 2 | [G]1 . . | . . ||
L: A-ma-zing _ grace! how sweet
`;

describe('parseSong', () => {
  const song = parseSong(WALTZ);

  it('reads the header', () => {
    expect(song.meta.title).toBe('Test Waltz');
    expect(song.meta.time).toEqual({ beats: 3, unit: 4 });
    expect(song.meta.tempo).toBe(90);
    expect(song.issues).toEqual([]);
  });

  it('recognizes a pickup measure and numbers the rest', () => {
    expect(song.measures.map((measure) => measure.number)).toEqual([null, 1, 2, 3, 4]);
    expect(song.measures.map((measure) => measure.length)).toEqual([480, 1440, 1440, 1440, 960]);
    expect(song.measures.map((measure) => measure.startTick)).toEqual([0, 480, 1920, 3360, 4800]);
    expect(song.totalTicks).toBe(5760);
    expect(song.measures[4].barline).toBe('final');
    expect(song.measures[0].section).toBe('Verse');
  });

  it('places the melody around the middle of the keyboard', () => {
    expect(song.rightDo).toBe(67); // G4
    expect(song.leftDo).toBe(43); // G2
    expect(song.measures[0].slots[0].pitches[0].midi).toBe(62); // D4
    expect(song.measures[1].slots[2].pitches[0].midi).toBe(71); // B4
  });

  it('assigns syllables to notes and skips "_"', () => {
    const lyrics = song.measures.flatMap((measure) =>
      measure.slots.filter((slot) => slot.kind === 'note').map((slot) => slot.lyric),
    );
    expect(lyrics).toEqual(['A-', 'ma-', 'zing', undefined, 'grace!', 'how', 'sweet']);
  });

  it('keeps chords with their position in the measure', () => {
    expect(song.measures[1].chords).toEqual([{ start: 0, symbol: 'G', recognized: true }]);
    expect(song.measures[2].chords[0].symbol).toBe('D7');
  });

  it('honours an explicit octave', () => {
    const lower = parseSong(WALTZ.replace('tempo: 90', 'tempo: 90\noctave: 3'));
    expect(lower.rightDo).toBe(55);
  });
});

describe('parseSong diagnostics', () => {
  it('reports a measure with the wrong number of beats', () => {
    const song = parseSong('key: C\ntime: 4/4\n| 1 2 3 4 | 1 2 3 | 1 2 3 4 |');
    const errors = song.issues.filter((issue) => issue.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].measure).toBe(1);
    expect(errors[0].message).toContain('3 beats');
  });

  it('reports unknown chords, uncertain notes, and stray lines', () => {
    const song = parseSong('key: C\ntime: 4/4\nnonsense here\n| [Hx]1 2? 3 4 |');
    expect(song.issues.map((issue) => issue.severity).sort()).toEqual([
      'error',
      'error',
      'warning',
    ]);
    expect(song.measures[0].chords[0].recognized).toBe(false);
    expect(song.measures[0].slots[1].uncertain).toBe(true);
  });

  it('warns when lyrics and notes do not line up', () => {
    const song = parseSong('key: C\ntime: 4/4\n| 1 2 3 4 |\nL: one two three');
    expect(song.issues.some((issue) => issue.message.includes('3 syllables for 4 notes'))).toBe(
      true,
    );
  });

  it('counts beats by the lower number of the time signature', () => {
    const song = parseSong('key: C\ntime: 6/8\n| 1 2 3 4 5 6 | (1 2) 3 . 4 . 5 |');
    expect(song.issues).toEqual([]);
    expect(song.measures[0].length).toBe(6 * 240);
    expect(song.measures[1].slots[0].duration).toBe(120);
  });
});
