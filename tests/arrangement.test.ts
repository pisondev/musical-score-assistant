import { describe, expect, it } from 'vitest';
import { buildArrangement, buildBaseline } from '../src/core/arrangement';
import { createSongBundle } from '../src/core/bundle';
import { buildNoteEvents, buildSlotSpans, measureIndexAt } from '../src/core/playback';
import { parseSong } from '../src/core/song';
import type { Arrangement, ArrangementSpec, Song } from '../src/core/types';
import { validateArrangement } from '../src/core/validate';

const FOUR_FOUR = parseSong(`
key: F
time: 4/4
| (0 5,) (1 1) | [F]3 . 2 1 | [Bb]2 [Gm]4 . ([Bb]2 [G/B]1) | [C/E]5 . . . | [F]1 . ||
`);

const WALTZ = parseSong(`
key: G
time: 3/4
| 5, | [G]1 . 3 | [C]1 . 6, | [G]1 . ||
`);

function leftNotes(arrangement: Arrangement, measure: number): number[][] {
  return arrangement.measures[measure].slots.map((slot) => slot.pitches.map((pitch) => pitch.midi));
}

function spec(
  measures: ArrangementSpec['measures'],
  level: ArrangementSpec['level'] = 'easy',
): ArrangementSpec {
  return { id: 'test', name: 'Test', level, measures };
}

function fullSpec(song: Song, overrides: Record<number, string>): ArrangementSpec {
  return spec(
    song.measures.map((measure) => {
      const number = measure.number ?? 0;
      const beats = measure.length / 480;
      return { measure: number, left: overrides[number] ?? Array(beats).fill('0').join(' ') };
    }),
  );
}

describe('buildBaseline', () => {
  it('plays root, fifth, octave, fifth in four-four', () => {
    const baseline = buildBaseline(FOUR_FOUR);
    expect(leftNotes(baseline, 1)).toEqual([[41], [48], [53], [48]]); // F2 C3 F3 C3
  });

  it('plays root, fifth, octave in three-four', () => {
    const baseline = buildBaseline(WALTZ);
    expect(leftNotes(baseline, 1)).toEqual([[43], [50], [55]]); // G2 D3 G3
    expect(leftNotes(baseline, 2)).toEqual([[36], [43], [48]]); // C2 G2 C3
  });

  it('rests where no chord is printed and restarts on every chord change', () => {
    const baseline = buildBaseline(FOUR_FOUR);
    expect(baseline.measures[0].slots.map((slot) => slot.kind)).toEqual(['rest', 'rest']);
    // Bb | Gm Gm | Bb then G/B within the last beat.
    expect(leftNotes(baseline, 2)).toEqual([[46], [43], [50], [46], [47]]);
    expect(baseline.measures[2].slots.map((slot) => slot.duration)).toEqual([
      480, 480, 480, 240, 240,
    ]);
    expect(baseline.measures[2].slots.map((slot) => slot.beams)).toEqual([0, 0, 0, 1, 1]);
  });

  it('starts a slash chord on its bass note', () => {
    const baseline = buildBaseline(FOUR_FOUR);
    expect(leftNotes(baseline, 3)).toEqual([[40], [43], [48], [43]]); // E2 G2 C3 G2
  });
});

describe('buildArrangement', () => {
  it('resolves chord degrees from the chord root', () => {
    const arrangement = buildArrangement(
      FOUR_FOUR,
      fullSpec(FOUR_FOUR, {
        1: "[F](1 5) (1' 3') [F7/Eb]7, <5 1'>",
        3: "[C/E]3 5 1' <7 3'>",
      }),
    );
    expect(arrangement.issues.filter((issue) => issue.severity !== 'info')).toEqual([]);
    expect(leftNotes(arrangement, 1)).toEqual([[41], [48], [53], [57], [39], [48, 53]]);
    // C/E: E2, G2, C3, then the seventh and tenth. In F major the seventh above C is B flat.
    expect(leftNotes(arrangement, 3)).toEqual([[40], [43], [48], [46, 52]]);
  });

  it('writes left-hand notes relative to the left-hand "do"', () => {
    const arrangement = buildArrangement(FOUR_FOUR, fullSpec(FOUR_FOUR, { 1: "[F]1 5 1' [G/B]3" }));
    const tones = arrangement.measures[1].slots.map((slot) => slot.pitches[0].tone);
    expect(tones).toEqual([
      { degree: 1, accidental: 0, octave: 0 },
      { degree: 5, accidental: 0, octave: 0 },
      { degree: 1, accidental: 0, octave: 1 },
      { degree: 4, accidental: 1, octave: 0 },
    ]);
  });

  it('marks chords that differ from the printed score', () => {
    const arrangement = buildArrangement(
      FOUR_FOUR,
      fullSpec(FOUR_FOUR, { 1: '[F]1 5 [Dm7]1 5', 2: '[Bb]1 [Gm]1 . [C7]1' }),
    );
    expect(arrangement.measures[1].chords.map((chord) => chord.changed)).toEqual([false, true]);
    expect(arrangement.measures[2].chords.map((chord) => chord.changed)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('carries the chord into a measure that does not name one', () => {
    const arrangement = buildArrangement(WALTZ, fullSpec(WALTZ, { 1: "[G]1 5 3'", 2: "1 5 1'" }));
    expect(leftNotes(arrangement, 2)).toEqual([[43], [50], [55]]);
  });

  it('reports a measure with the wrong number of beats', () => {
    const arrangement = buildArrangement(WALTZ, fullSpec(WALTZ, { 1: '[G]1 5' }));
    const errors = arrangement.issues.filter((issue) => issue.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].measure).toBe(1);
    expect(errors[0].message).toContain('2 beats');
  });

  it('falls back to the baseline for measures that are not written', () => {
    const arrangement = buildArrangement(WALTZ, spec([{ measure: 1, left: "[G]1 5 3'" }]));
    expect(leftNotes(arrangement, 2)).toEqual([[36], [43], [48]]);
    expect(arrangement.issues.every((issue) => issue.severity === 'info')).toBe(true);
  });

  it('reports a note without a chord', () => {
    const arrangement = buildArrangement(WALTZ, fullSpec(WALTZ, { 0: '1' }));
    expect(arrangement.issues.some((issue) => issue.message.includes('no chord'))).toBe(true);
  });
});

describe('validateArrangement', () => {
  const messages = (
    song: Song,
    overrides: Record<number, string>,
    level?: ArrangementSpec['level'],
  ) => {
    const arrangement = buildArrangement(song, { ...fullSpec(song, overrides), level });
    return validateArrangement(song, arrangement).map((issue) => issue.message);
  };

  it('accepts a sensible arrangement', () => {
    expect(messages(WALTZ, { 1: "[G]1 <5 1'> <5 1'>", 2: "[C]1' <3' 5'> <3' 5'>" })).toEqual([]);
  });

  it('flags a stretch wider than the hand', () => {
    expect(messages(WALTZ, { 1: "[G]<1 3'> 0 0" })[0]).toContain('span 16 semitones');
    expect(messages(WALTZ, { 1: "[G]<1 3'> 0 0" }, 'advanced')).toEqual([]);
  });

  it('flags close intervals in the low register', () => {
    expect(messages(WALTZ, { 1: '[G]<1 3> 0 0' })[0]).toContain('muddy');
  });

  it('flags a slash chord whose bass note is missing', () => {
    expect(messages(WALTZ, { 1: "[G/B]1 5 1'" })[0]).toContain('expects B in the bass');
  });

  it('flags a left hand that reaches the melody', () => {
    expect(messages(WALTZ, { 1: "[G]1'' 0 0" }).some((message) => message.includes('melody'))).toBe(
      true,
    );
  });

  it('flags a chord that clashes with a long melody note', () => {
    // The melody holds G for two beats while F sharp major sounds beneath it.
    expect(messages(WALTZ, { 1: '[F#]1 5 1' }).some((message) => message.includes('clashes'))).toBe(
      true,
    );
  });
});

describe('playback', () => {
  const arrangement = buildArrangement(
    WALTZ,
    fullSpec(WALTZ, { 1: "[G]1 <5 1'> .", 2: '[C]1 5 [G]3' }),
  );
  const events = buildNoteEvents(WALTZ, arrangement);

  it('merges hold dots into the note they extend', () => {
    const melody = events.filter((event) => event.track === 'right');
    expect(melody.map((event) => [event.tick, event.duration])).toEqual([
      [0, 480],
      [480, 960],
      [1440, 480],
      [1920, 960],
      [2880, 480],
      [3360, 960],
    ]);
  });

  it('lets the left hand ring until the chord changes or the measure ends', () => {
    const left = events.filter((event) => event.track === 'left');
    expect(left.map((event) => [event.tick, event.duration, event.midi])).toEqual([
      [480, 1440, 43],
      [960, 960, 50],
      [960, 960, 55],
      [1920, 960, 36],
      [2400, 480, 43],
      [2880, 480, 47],
    ]);
  });

  it('plays the downbeat louder than the other beats', () => {
    const [pickup, downbeat, third] = events.filter((event) => event.track === 'right');
    expect(downbeat.velocity).toBeGreaterThan(third.velocity);
    expect(pickup.velocity).toBe(downbeat.velocity);
  });

  it('lists a span for every written slot', () => {
    const spans = buildSlotSpans(WALTZ, arrangement);
    const slotCount =
      WALTZ.measures.reduce((total, measure) => total + measure.slots.length, 0) +
      arrangement.measures.reduce((total, measure) => total + measure.slots.length, 0);
    expect(spans).toHaveLength(slotCount);
    expect(spans.every((span) => span.end > span.start)).toBe(true);
  });

  it('finds the measure that contains a tick', () => {
    expect(measureIndexAt(WALTZ, 0)).toBe(0);
    expect(measureIndexAt(WALTZ, 480)).toBe(1);
    expect(measureIndexAt(WALTZ, 1919)).toBe(1);
    expect(measureIndexAt(WALTZ, 99999)).toBe(3);
  });
});

describe('createSongBundle', () => {
  const songText = 'key: G\ntime: 3/4\n| [G]1 . 3 | [C]1 . 6, |';

  it('always puts the baseline first', () => {
    const bundle = createSongBundle(songText, {
      arrangements: [{ id: 'a', name: 'A', measures: [{ measure: 1, left: "[G]1 5 3'" }] }],
    });
    expect(bundle.arrangements.map((arrangement) => arrangement.id)).toEqual(['baseline', 'a']);
    expect(bundle.arrangements[0].baseline).toBe(true);
    expect(bundle.issues).toEqual([]);
  });

  it('reports malformed arrangement files instead of failing', () => {
    expect(createSongBundle(songText, { wrong: true }).issues).toHaveLength(1);
    const bundle = createSongBundle(songText, {
      arrangements: [{ id: 'a' }, { id: 'b', name: 'B', measures: [{ left: '1' }] }],
    });
    expect(bundle.issues).toHaveLength(2);
    expect(bundle.arrangements.map((arrangement) => arrangement.id)).toEqual(['baseline', 'b']);
  });

  it('works without an arrangement file', () => {
    expect(createSongBundle(songText).arrangements).toHaveLength(1);
  });
});
