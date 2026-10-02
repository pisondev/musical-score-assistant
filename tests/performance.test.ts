import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { parseChord, transposeChordSymbol } from '../src/core/chord';
import { DynamicsTimeline } from '../src/core/dynamics';
import { parseNotationLine } from '../src/core/notation';
import { buildPerformance } from '../src/core/performance';
import { buildNoteEvents } from '../src/core/playback';
import { parseSong } from '../src/core/song';
import { keyShift } from '../src/core/transpose';

const SONG = `
key: F
time: 4/4
| {mp}(0 5,) (1 1) | [F]3 . 2 1 | {<}[Bb]2 4 . 2 | {f}[C]5 . {>}[C7]4 2 | {p}[F]1 . ||
`;

const ARRANGEMENTS = {
  intro: {
    lastPhraseFrom: 3,
    improvised: {
      summary: 'Two measures.',
      measures: [
        { right: "{mf}5 6 <3 5> 1'", left: "[F]1 5 1' 5", note: 'First.' },
        { right: '5 .', left: '[C7]<1 7> .' },
      ],
    },
  },
  arrangements: [
    {
      id: 'shells',
      name: 'Shells',
      level: 'advanced',
      style: 'Jazz',
      measures: [
        { measure: 0, left: '0 0' },
        { measure: 1, left: "[Fmaj7]<1 7 3'> . . ." },
        { measure: 2, left: "[Bb]1 5 1' 5" },
        { measure: 3, left: '[C]1 5 [C7/Bb]7 5' },
        { measure: 4, left: '[F6]<1 6> .' },
      ],
    },
  ],
};

const bundle = createSongBundle(SONG, ARRANGEMENTS);
const [baseline, shells] = bundle.arrangements;

describe('dynamic marks', () => {
  it('are read from the notation and attached to the following note', () => {
    const { measures, issues } = parseNotationLine('| {p}1 2 {<}3 4 | {f}5 . . . |', 480, 1);
    expect(issues).toEqual([]);
    expect(measures[0].dynamics).toEqual([
      { start: 0, sign: 'p', column: 3 },
      { start: 960, sign: '<', column: 10 },
    ]);
    expect(measures[1].dynamics[0]).toMatchObject({ start: 0, sign: 'f' });
  });

  it('reject unknown signs and marks without a note', () => {
    const { issues } = parseNotationLine('| {loud}1 2 3 {f} |', 480, 1);
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toContain('{loud}');
    expect(issues[1].message).toContain('not followed by a note');
  });

  it('are kept on the measures of the song', () => {
    const song = parseSong(SONG);
    expect(song.issues).toEqual([]);
    expect(song.measures.map((measure) => measure.dynamics.map((mark) => mark.sign))).toEqual([
      ['mp'],
      [],
      ['<'],
      ['f', '>'],
      ['p'],
    ]);
  });
});

describe('DynamicsTimeline', () => {
  const timeline = new DynamicsTimeline(parseSong(SONG).measures);
  const beat = 480;
  const measure = (number: number) => 2 * beat + (number - 1) * 4 * beat;

  it('holds a level until the next mark', () => {
    expect(timeline.gainAt(0)).toBe(timeline.gainAt(measure(1) + 3 * beat));
    expect(timeline.gainAt(measure(3))).toBeGreaterThan(timeline.gainAt(0));
  });

  it('glides through a hairpin to the next level', () => {
    const start = timeline.gainAt(measure(2));
    const middle = timeline.gainAt(measure(2) + 2 * beat);
    const end = timeline.gainAt(measure(3));
    expect(start).toBe(timeline.gainAt(0));
    expect(middle).toBeGreaterThan(start);
    expect(middle).toBeLessThan(end);
    expect(middle).toBeCloseTo((start + end) / 2, 5);
  });

  it('lists hairpins with the range they span', () => {
    expect(timeline.hairpins()).toEqual([
      { kind: 'crescendo', start: measure(2), end: measure(3) },
      { kind: 'diminuendo', start: measure(3) + 2 * beat, end: measure(4) },
    ]);
  });

  it('assumes mezzo-forte without marks and steps one level for an open hairpin', () => {
    const plain = new DynamicsTimeline(parseSong('key: C\ntime: 4/4\n| 1 2 3 4 |').measures);
    const open = new DynamicsTimeline(parseSong('key: C\ntime: 4/4\n| {<}1 2 3 4 |').measures);
    expect(open.gainAt(0)).toBe(plain.gainAt(0));
    expect(open.gainAt(4 * 480)).toBeGreaterThan(plain.gainAt(0));
  });

  it('scales the velocity of the notes', () => {
    const events = buildNoteEvents(bundle.song, baseline).filter((event) => event.hand === 'right');
    const soft = events.find((event) => event.tick === measure(1))!;
    const loud = events.find((event) => event.tick === measure(3))!;
    expect(loud.velocity).toBeGreaterThan(soft.velocity);
    expect(events.every((event) => event.velocity > 0 && event.velocity <= 1)).toBe(true);
  });
});

describe('chord extensions', () => {
  it('are recorded as semitones above the root', () => {
    expect(parseChord('F6')!.extensions).toEqual([9]);
    expect(parseChord('G69')!.extensions).toEqual([9, 2]);
    expect(parseChord('C13')!.extensions).toEqual([9]);
    expect(parseChord('C13')!.seventh).toBe(10);
    expect(parseChord('Am9')!.extensions).toEqual([2]);
    expect(parseChord('C7b9')!.extensions).toEqual([1]);
    expect(parseChord('Cmaj9')!.seventh).toBe(11);
    expect(parseChord('Dm6')!.extensions).toEqual([9]);
  });

  it('decide what the degrees 2 and 6 mean', () => {
    // In F major the sixth above D would be B flat; Dm6 asks for B natural.
    const sixthOf = (chord: string) =>
      createSongBundle('key: F\ntime: 4/4\n| [Dm]1 . . . |', {
        arrangements: [
          { id: 'a', name: 'A', measures: [{ measure: 1, left: `[${chord}]6 . . .` }] },
        ],
      }).arrangements[1].measures[0].slots[0].pitches[0].midi;
    expect(sixthOf('Dm')).toBe(46);
    expect(sixthOf('Dm6')).toBe(47);
  });
});

describe('transposition', () => {
  it('finds the new key and the interval to it', () => {
    const up = keyShift({ letter: 3, accidental: 0 }, 2);
    expect(up).toMatchObject({ key: { letter: 4, accidental: 0 }, letterSteps: 1, semitones: 2 });
    const down = keyShift({ letter: 3, accidental: 0 }, -1);
    expect(down).toMatchObject({
      key: { letter: 2, accidental: 0 },
      letterSteps: 6,
      semitones: 11,
    });
  });

  it('moves chord symbols and keeps their quality', () => {
    expect(transposeChordSymbol('Bb', 1, 2)).toBe('C');
    expect(transposeChordSymbol('F7/Eb', 1, 2)).toBe('G7/F');
    expect(transposeChordSymbol('G/B', 1, 2)).toBe('A/C#');
    expect(transposeChordSymbol('Abdim7', 1, 2)).toBe('Bbdim7');
    expect(transposeChordSymbol('Gm7', 6, 11)).toBe('F#m7');
    expect(transposeChordSymbol('not a chord', 1, 2)).toBe('not a chord');
  });

  it('shifts every pitch but leaves the written digits alone', () => {
    const original = buildPerformance(bundle, shells, 'off', 0);
    const moved = buildPerformance(bundle, shells, 'off', 2);

    expect(moved.song.meta.key).toEqual({ letter: 4, accidental: 0 });
    expect(moved.song.rightDo).toBe(original.song.rightDo + 2);
    expect(moved.song.leftDo).toBe(original.song.leftDo + 2);

    const firstNote = (performance: typeof original) => performance.song.measures[1].slots[0];
    expect(firstNote(moved).pitches[0].midi).toBe(firstNote(original).pitches[0].midi + 2);
    expect(firstNote(moved).pitches[0].tone).toEqual(firstNote(original).pitches[0].tone);

    expect(moved.arrangement.measures[1].chords[0].symbol).toBe('Gmaj7');
    expect(moved.arrangement.measures[3].chords.map((chord) => chord.symbol)).toEqual([
      'D',
      'D7/C',
    ]);
    expect(moved.arrangement.measures[1].slots[0].pitches.map((pitch) => pitch.midi)).toEqual(
      original.arrangement.measures[1].slots[0].pitches.map((pitch) => pitch.midi + 2),
    );
  });

  it('returns the same objects when nothing is transposed', () => {
    const performance = buildPerformance(bundle, baseline, 'off', 0);
    expect(performance.song.measures[0]).toMatchObject({ index: 0, startTick: 0 });
    expect(performance.introMeasures).toBe(0);
    expect(performance.song.totalTicks).toBe(bundle.song.totalTicks);
  });
});

describe('introductions', () => {
  it('report nothing wrong with the written introduction', () => {
    expect(bundle.issues).toEqual([]);
    expect(bundle.intro.improvised?.issues).toEqual([]);
    expect(bundle.intro.lastPhraseStart).toBe(3);
  });

  it('put the last phrase in front of the song, with the chosen left hand', () => {
    const performance = buildPerformance(bundle, shells, 'last-phrase', 0);
    const { song, arrangement } = performance;

    expect(performance.introMeasures).toBe(2);
    expect(song.measures).toHaveLength(bundle.song.measures.length + 2);
    expect(song.measures.slice(0, 2).map((measure) => measure.part)).toEqual(['intro', 'intro']);
    expect(song.measures.map((measure) => measure.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(song.measures.map((measure) => measure.number)).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(song.measures[2].startTick).toBe(4 * 480 + 2 * 480);
    expect(song.totalTicks).toBe(bundle.song.totalTicks + 6 * 480);

    // The copy plays the same notes as measures 3 and 4 of the arrangement.
    const midi = (index: number) =>
      arrangement.measures[index].slots.map((slot) => slot.pitches.map((pitch) => pitch.midi));
    expect(midi(0)).toEqual(midi(5));
    expect(midi(1)).toEqual(midi(6));
    expect(arrangement.measures[0].chords.map((chord) => chord.symbol)).toEqual(['C', 'C7/Bb']);
  });

  it('give introduction slots their own ids and no lyrics', () => {
    const { song, arrangement } = buildPerformance(bundle, shells, 'last-phrase', 0);
    const ids = [
      ...song.measures.flatMap((measure) => measure.slots),
      ...arrangement.measures.flatMap((measure) => measure.slots),
    ].map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(song.measures[0].slots.every((slot) => slot.lyric === undefined)).toBe(true);
  });

  it('start the last phrase at mezzo-forte and keep the dynamics of the song', () => {
    const { song } = buildPerformance(bundle, baseline, 'last-phrase', 0);
    expect(song.measures[0].dynamics).toEqual([{ start: 0, sign: 'mf' }]);
    expect(song.measures[1].dynamics).toEqual([]);
    expect(song.measures[2].dynamics).toEqual([{ start: 0, sign: 'mp' }]);
  });

  it('put the written introduction in front of the song with both hands', () => {
    const { song, arrangement, introMeasures } = buildPerformance(
      bundle,
      baseline,
      'improvised',
      0,
    );
    expect(introMeasures).toBe(2);
    expect(song.measures[0].slots[2].pitches.map((pitch) => pitch.midi)).toEqual([69, 72]);
    expect(song.measures[1].length).toBe(2 * 480);
    expect(arrangement.measures[0].slots.map((slot) => slot.pitches[0].midi)).toEqual([
      41, 48, 53, 48,
    ]);
    expect(arrangement.measures[1].slots[0].pitches.map((pitch) => pitch.midi)).toEqual([36, 46]);
    expect(arrangement.measures[0].note).toBe('First.');
    expect(arrangement.measures[2].slots).toEqual(baseline.measures[0].slots);
  });

  it('move issue positions along with the measures', () => {
    const broken = createSongBundle('key: C\ntime: 4/4\n| 1 2 3 4 | 1 2 3 | 1 2 3 4 | 1 2 3 4 |');
    const withIntro = buildPerformance(broken, broken.arrangements[0], 'last-phrase', 0);
    const error = withIntro.song.issues.find((issue) => issue.severity === 'error')!;
    expect(error.measure).toBe(1 + withIntro.introMeasures);
  });

  it('report mistakes in a written introduction', () => {
    const faulty = createSongBundle(SONG, {
      intro: {
        improvised: {
          measures: [
            { right: '5 6 5', left: "[F]1 5 1' 5" },
            { right: '5 .', left: '[C]1 .' },
          ],
        },
      },
      arrangements: [],
    });
    const messages = faulty.intro.improvised!.issues.map((issue) => issue.message);
    expect(messages.some((message) => message.includes('3 beats and left hand 4'))).toBe(true);
    expect(messages.some((message) => message.includes('the time signature needs 4'))).toBe(true);
  });

  it('fall back to no introduction when none is written', () => {
    const plain = createSongBundle(SONG);
    expect(plain.intro.improvised).toBeNull();
    expect(buildPerformance(plain, plain.arrangements[0], 'improvised', 0).introMeasures).toBe(0);
    // Without a setting, the last phrase is the last four measures.
    expect(plain.intro.lastPhraseStart).toBe(1);
  });
});

describe('arrangement styles', () => {
  it('are read from the file, and the baseline is basic', () => {
    expect(baseline.style).toBe('Basic');
    expect(shells.style).toBe('Jazz');
    expect(shells.level).toBe('advanced');
  });
});
