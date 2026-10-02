import { describe, expect, it } from 'vitest';
import { parseNotationLine } from '../src/core/notation';

const BEAT = 480;

describe('parseNotationLine', () => {
  it('gives every top-level symbol one beat', () => {
    const { measures, issues } = parseNotationLine('| 1 2 3 0 |', BEAT, 1);
    expect(issues).toEqual([]);
    expect(measures).toHaveLength(1);
    expect(measures[0].length).toBe(4 * BEAT);
    expect(measures[0].slots.map((slot) => [slot.kind, slot.start, slot.duration])).toEqual([
      ['note', 0, 480],
      ['note', 480, 480],
      ['note', 960, 480],
      ['rest', 1440, 480],
    ]);
  });

  it('splits a group evenly and counts its beams', () => {
    const { measures } = parseNotationLine('| (1 2) (1 2 3 4) (1 2 3) 5 |', BEAT, 1);
    const slots = measures[0].slots;
    expect(slots.map((slot) => slot.duration)).toEqual([
      240, 240, 120, 120, 120, 120, 160, 160, 160, 480,
    ]);
    expect(slots.map((slot) => slot.beams)).toEqual([1, 1, 2, 2, 2, 2, 1, 1, 1, 0]);
    expect(slots[6].tuplet).toBe(3);
    expect(slots[0].tuplet).toBeUndefined();
  });

  it('supports nested groups for dotted rhythms', () => {
    const { measures } = parseNotationLine('| (5 (. 5)) |', BEAT, 1);
    expect(
      measures[0].slots.map((slot) => [slot.kind, slot.start, slot.duration, slot.beams]),
    ).toEqual([
      ['note', 0, 240, 1],
      ['hold', 240, 120, 2],
      ['note', 360, 120, 2],
    ]);
  });

  it('reads accidentals, octave marks, and uncertainty marks', () => {
    const { measures } = parseNotationLine("| #4 b7, 1'' 5? |", BEAT, 1);
    const slots = measures[0].slots;
    expect(slots[0].tones[0]).toEqual({ degree: 4, accidental: 1, octave: 0 });
    expect(slots[1].tones[0]).toEqual({ degree: 7, accidental: -1, octave: -1 });
    expect(slots[2].tones[0]).toEqual({ degree: 1, accidental: 0, octave: 2 });
    expect(slots[3].uncertain).toBe(true);
  });

  it('attaches a chord to the note that follows it, also inside a group', () => {
    const { measures } = parseNotationLine('| [Bb]2 [Gm]4 . ([Bb]2 [G/B]1) |', BEAT, 1);
    expect(measures[0].chords.map((chord) => [chord.symbol, chord.start])).toEqual([
      ['Bb', 0],
      ['Gm', 480],
      ['Bb', 1440],
      ['G/B', 1680],
    ]);
  });

  it('reads stacked notes as one slot', () => {
    const { measures, issues } = parseNotationLine("1 <5 1'> .", BEAT, 0);
    expect(issues).toEqual([]);
    expect(measures[0].slots[1].tones).toEqual([
      { degree: 5, accidental: 0, octave: 0 },
      { degree: 1, accidental: 0, octave: 1 },
    ]);
    expect(measures[0].slots[2].kind).toBe('hold');
  });

  it('separates measures and records barline types', () => {
    const { measures } = parseNotationLine('| 5, |: 1 2 :| 3 4 ||', BEAT, 1);
    expect(measures.map((measure) => measure.barline)).toEqual(['single', 'repeat-end', 'final']);
    expect(measures.map((measure) => measure.repeatStart)).toEqual([false, true, false]);
    expect(measures.map((measure) => measure.length)).toEqual([480, 960, 960]);
  });

  it('reports malformed input with its position', () => {
    const { issues } = parseNotationLine('| 1 (2 3 | 4 x |', BEAT, 7);
    expect(issues.map((issue) => issue.severity)).toEqual(['error', 'error']);
    expect(issues.every((issue) => issue.line === 7)).toBe(true);
    expect(issues.some((issue) => issue.message.includes('"x"'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('not closed'))).toBe(true);
  });

  it('reports a chord that is not followed by a note', () => {
    const { issues } = parseNotationLine('| 1 2 [C] |', BEAT, 1);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('[C]');
  });
});
