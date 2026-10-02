import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { toMei } from '../src/core/mei';
import { toMidiFile } from '../src/core/midi';
import { buildPerformance, measureNames } from '../src/core/performance';
import { buildNoteEvents } from '../src/core/playback';
import { summarizeSong } from '../src/core/summary';

const BEAT = 480;
const FULL = 4 * BEAT;

// A song in F with a pickup of two beats; its last measure has the other two.
const SONG = `
title: Form
key: F
time: 4/4
| {mp}(0 5,) (1 1) | [F]3 . 2 1 | [Bb]2 4 . 2 | [C]5 . [C7]4 2 | [F]1 . ||
`;

const PASSAGES = {
  intro: {
    lastPhraseFrom: 3,
    bridge: {
      measures: [
        { right: '3 4 5 6', left: '[F]1 5 [C7]1 7', note: 'The bridge.' },
        { right: '<4 5> .', left: '[C7]<1 7> .' },
      ],
    },
    written: [
      {
        id: 'short',
        name: 'Short lead-in',
        measures: [
          { right: "5 6 <3 5> 1'", left: "[F]1 5 1' 5", note: 'First.' },
          { right: '5 .', left: '[C7]<1 7> .' },
        ],
      },
    ],
  },
  modulation: {
    measures: [
      { right: "{<}5 6 7 1'", left: '[C7]1 5 7 5', note: 'The lift.' },
      { right: "<7 2'> .", left: '[C7]<1 7> .' },
    ],
  },
  endings: [
    {
      id: 'amen',
      name: 'Amen',
      style: 'Hymn',
      summary: 'Four, then one.',
      measures: [{ right: '<4 6> . <3 5> .', left: '[Bb]<1 5> . [F]<1 5> .', note: 'Amen.' }],
    },
    {
      id: 'held',
      name: 'Held chord',
      measures: [
        { right: "1 3 5 1'", left: "[F]1 5 1' 5" },
        { right: "<3 5 1'> . . .", left: "[F]<1 5 1'> . . ." },
      ],
    },
  ],
  arrangements: [],
};

const bundle = createSongBundle(SONG, PASSAGES);
const [baseline] = bundle.arrangements;
const SONG_MEASURES = bundle.song.measures.length;

const kinds = (performance: ReturnType<typeof buildPerformance>) =>
  performance.sections.map((section) => `${section.kind}:${section.count}`);

describe('passages around the song', () => {
  it('are read from the arrangement file', () => {
    expect(bundle.issues).toEqual([]);
    expect(bundle.intro.bridge?.measures).toHaveLength(2);
    expect(bundle.modulation?.measures).toHaveLength(2);
    expect(bundle.endings.map((ending) => [ending.id, ending.name, ending.style])).toEqual([
      ['amen', 'Amen', 'Hymn'],
      ['held', 'Held chord', ''],
    ]);
    const passages = [bundle.intro.bridge!, bundle.modulation!, ...bundle.endings];
    expect(
      passages.flatMap((passage) => passage.issues).filter((issue) => issue.severity === 'error'),
    ).toEqual([]);
    expect(bundle.modulation!.measures.every((measure) => measure.part === 'interlude')).toBe(true);
    expect(bundle.endings[0].measures[0].part).toBe('ending');
    expect(summarizeSong(bundle).endings).toBe(2);
  });

  it('keep the ids of their symbols apart', () => {
    const passages = [
      bundle.intro.bridge!,
      bundle.modulation!,
      ...bundle.intro.written,
      ...bundle.endings,
    ];
    const ids = passages.flatMap((passage) => [
      ...passage.measures.flatMap((measure) => measure.slots.map((slot) => slot.id)),
      ...passage.parts.flatMap((part) => part.slots.map((slot) => slot.id)),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('report an ending that does not fill its measures, and entries that are malformed', () => {
    const faulty = createSongBundle(SONG, {
      intro: { bridge: 'soon' },
      modulation: { measures: [{ right: '5 .' }] },
      endings: [
        { id: 'off', name: 'Reserved', measures: [{ right: '1 . . .', left: '[F]1 . . .' }] },
        { id: 'cut', name: 'Cut short', measures: [{ right: '1 .', left: '[F]1 .' }] },
      ],
      arrangements: [],
    });
    expect(faulty.issues.map((issue) => issue.message)).toEqual([
      'The bridge must be an object with "measures".',
      'The modulation has a measure without a text "right" and a text "left".',
      'Ending id "off" is used twice or reserved.',
    ]);
    expect(faulty.intro.bridge).toBeNull();
    expect(faulty.modulation).toBeNull();
    expect(faulty.endings.map((ending) => ending.id)).toEqual(['cut']);
    expect(faulty.endings[0].issues.map((issue) => issue.message)).toContain(
      'Measure has 2 beats; the time signature needs 4.',
    );
  });
});

describe('the bridge', () => {
  it('follows the last phrase and leads into the pickup', () => {
    const performance = buildPerformance(bundle, baseline, 'last-phrase', 0);
    const { song } = performance;
    expect(kinds(performance)).toEqual(['intro:4', `song:${SONG_MEASURES}`]);
    expect(performance.sections[0].detail).toBe('Last phrase');
    expect(performance.introMeasures).toBe(4);
    expect(song.measures.slice(0, 4).every((measure) => measure.part === 'intro')).toBe(true);

    // The phrase ends on a measure that was cut for the pickup; before the bridge it is whole.
    expect(song.measures.slice(0, 5).map((measure) => measure.length)).toEqual([
      FULL,
      FULL,
      FULL,
      2 * BEAT,
      2 * BEAT,
    ]);
    const completed = song.measures[1].slots.slice(-2);
    expect(completed.map((slot) => [slot.kind, slot.start, slot.duration])).toEqual([
      ['hold', 2 * BEAT, BEAT],
      ['hold', 3 * BEAT, BEAT],
    ]);
    expect(performance.arrangement.measures[1].slots.slice(-1)[0]).toMatchObject({
      kind: 'hold',
      start: 3 * BEAT,
    });
    expect(performance.arrangement.measures[2].note).toBe('The bridge.');
  });

  it('is left out after a written introduction, which leads into the song itself', () => {
    const performance = buildPerformance(bundle, baseline, 'short', 0);
    expect(kinds(performance)).toEqual(['intro:2', `song:${SONG_MEASURES}`]);
    expect(performance.sections[0].detail).toBe('Short lead-in');
  });

  it('leaves the last phrase as it was when the file writes none', () => {
    const plain = createSongBundle(SONG, { intro: { lastPhraseFrom: 3 }, arrangements: [] });
    const performance = buildPerformance(plain, plain.arrangements[0], 'last-phrase', 0);
    expect(kinds(performance)).toEqual(['intro:2', `song:${SONG_MEASURES}`]);
    expect(performance.song.measures[1].length).toBe(2 * BEAT);
  });
});

describe('endings', () => {
  it('follow the song, whose last measure is completed first', () => {
    const plain = buildPerformance(bundle, baseline, 'off', 0);
    const performance = buildPerformance(bundle, baseline, 'off', 0, 'melody', { ending: 'amen' });
    const { song } = performance;

    expect(kinds(plain)).toEqual([`song:${SONG_MEASURES}`]);
    expect(kinds(performance)).toEqual([`song:${SONG_MEASURES}`, 'ending:1']);
    expect(performance.sections[1]).toMatchObject({ title: 'Ending', detail: 'Amen', pass: 1 });

    const last = SONG_MEASURES - 1;
    expect(plain.song.measures[last]).toMatchObject({ length: 2 * BEAT, barline: 'final' });
    expect(song.measures[last]).toMatchObject({ length: FULL, barline: 'single', number: 4 });
    expect(song.measures[last + 1]).toMatchObject({
      part: 'ending',
      number: null,
      length: FULL,
      barline: 'final',
    });
    expect(song.totalTicks).toBe(plain.song.totalTicks + 2 * BEAT + FULL);
    expect(performance.arrangement.measures[last + 1].note).toBe('Amen.');
  });

  it('are ignored when the song does not know the one that is asked for', () => {
    const performance = buildPerformance(bundle, baseline, 'off', 0, 'melody', {
      ending: 'missing',
    });
    expect(kinds(performance)).toEqual([`song:${SONG_MEASURES}`]);
    expect(buildPerformance(bundle, baseline, 'off', 0, 'melody', { ending: 'off' }).song).toEqual(
      buildPerformance(bundle, baseline, 'off', 0).song,
    );
  });
});

describe('the repeat in a higher key', () => {
  const lifted = buildPerformance(bundle, baseline, 'off', 0, 'melody', { lift: 2 });

  it('plays the key lift, then the song again that much higher', () => {
    expect(kinds(lifted)).toEqual([
      `song:${SONG_MEASURES}`,
      'interlude:2',
      `song:${SONG_MEASURES}`,
    ]);
    expect(lifted.sections.map((section) => [section.title, section.detail, section.pass])).toEqual(
      [
        ['Song', '1 = F', 1],
        ['Interlude', 'up a whole step, to 1 = G', 2],
        ['Song, repeated', '1 = G', 2],
      ],
    );
    expect(lifted.song.meta.key).toEqual(bundle.song.meta.key);

    const second = lifted.sections[2].start;
    const firstNote = (index: number) =>
      lifted.song.measures[index].slots.find((slot) => slot.kind === 'note')!;
    expect(firstNote(second).pitches[0].midi).toBe(firstNote(0).pitches[0].midi + 2);
    expect(firstNote(second).pitches[0].tone).toEqual(firstNote(0).pitches[0].tone);
    expect(lifted.arrangement.measures[1].chords[0].symbol).toBe('F');
    expect(lifted.arrangement.measures[second + 1].chords[0].symbol).toBe('G');
    expect(lifted.song.measures.slice(second).map((measure) => measure.number)).toEqual([
      null,
      1,
      2,
      3,
      4,
    ]);
  });

  it('writes the key lift in the key of the song and plays it in the new one', () => {
    const start = lifted.sections[1].start;
    expect(bundle.modulation!.parts[0].chords[0].symbol).toBe('C7');
    expect(lifted.arrangement.measures[start].chords[0].symbol).toBe('D7');
    expect(lifted.song.measures[start].part).toBe('interlude');
    expect(lifted.arrangement.measures[start].note).toBe('The lift.');
  });

  it('keeps the meter: short measures are completed unless the pickup follows', () => {
    const last = SONG_MEASURES - 1;
    // The song ends on two beats; the key lift follows, so they become four.
    expect(lifted.song.measures[last]).toMatchObject({ length: FULL, barline: 'single' });
    // The key lift ends on two beats and the pickup of the repeat supplies the rest.
    expect(lifted.song.measures[last + 2].length).toBe(2 * BEAT);
    expect(lifted.song.measures[lifted.song.measures.length - 1]).toMatchObject({
      length: 2 * BEAT,
      barline: 'final',
    });
    lifted.song.measures.forEach((measure, index) => {
      const previous = lifted.song.measures[index - 1];
      expect(measure.index).toBe(index);
      expect(measure.startTick).toBe(previous ? previous.startTick + previous.length : 0);
    });
  });

  it('gives every symbol of the second time an id of its own', () => {
    const ids = [
      ...lifted.song.measures.flatMap((measure) => measure.slots),
      ...lifted.arrangement.measures.flatMap((measure) => measure.slots),
    ].map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts the introduction between the two as well', () => {
    const written = buildPerformance(bundle, baseline, 'short', 0, 'melody', { lift: 1 });
    expect(kinds(written)).toEqual([
      'intro:2',
      `song:${SONG_MEASURES}`,
      'interlude:4',
      `song:${SONG_MEASURES}`,
    ]);
    expect(written.sections[2].detail).toBe('up a half step, to 1 = F♯');
    const interlude = written.sections[2].start;
    // The key lift is completed, because the introduction follows it, not the pickup.
    expect(written.song.measures[interlude + 1].length).toBe(FULL);
    expect(written.song.measures[interlude + 3].length).toBe(2 * BEAT);
    // The introduction is explained where it is first played.
    expect(written.arrangement.measures[0].note).toBe('First.');
    expect(written.arrangement.measures[interlude + 2].note).toBeUndefined();

    const phrase = buildPerformance(bundle, baseline, 'last-phrase', 0, 'melody', { lift: 1 });
    expect(kinds(phrase)).toEqual([
      'intro:4',
      `song:${SONG_MEASURES}`,
      'interlude:6',
      `song:${SONG_MEASURES}`,
    ]);
  });

  it('goes straight into the new key when nothing is written to go between', () => {
    const plain = createSongBundle(SONG);
    const performance = buildPerformance(plain, plain.arrangements[0], 'off', 0, 'melody', {
      lift: 1,
    });
    expect(kinds(performance)).toEqual([`song:${SONG_MEASURES}`, `song:${SONG_MEASURES}`]);
    expect(performance.song.totalTicks).toBe(2 * plain.song.totalTicks);
    expect(performance.song.measures[SONG_MEASURES - 1].length).toBe(2 * BEAT);
  });

  it('lifts the ending along, and adds to a transposition', () => {
    const performance = buildPerformance(bundle, baseline, 'off', 2, 'melody', {
      lift: 1,
      ending: 'amen',
    });
    expect(performance.sections.map((section) => section.detail)).toEqual([
      '1 = G',
      'up a half step, to 1 = A♭',
      '1 = A♭',
      'Amen',
    ]);
    expect(performance.song.meta.key).toEqual(performance.sections[0].key);
    const ending = performance.sections[3];
    expect(ending.pass).toBe(2);
    expect(
      performance.arrangement.measures[ending.start].chords.map((chord) => chord.symbol),
    ).toEqual(['Db', 'Ab']);
  });

  it('reports the problems of the song once', () => {
    const broken = createSongBundle('key: C\ntime: 4/4\n| 1 2 3 4 | 1 2 3 | 1 2 3 4 | 1 2 3 4 ||');
    const once = buildPerformance(broken, broken.arrangements[0], 'off', 0);
    const twice = buildPerformance(broken, broken.arrangements[0], 'off', 0, 'melody', { lift: 1 });
    expect(twice.song.issues).toEqual(once.song.issues);
  });
});

describe('measureNames', () => {
  it('names every measure by its section', () => {
    const performance = buildPerformance(bundle, baseline, 'short', 0, 'melody', {
      lift: 1,
      ending: 'amen',
    });
    const names = measureNames(performance);
    expect(names).toHaveLength(performance.song.measures.length);
    expect(names[0]).toEqual({
      label: '1',
      short: 'Intro 1',
      position: 'Intro 1',
      long: 'Intro measure 1',
    });
    expect(names[2]).toEqual({
      label: '',
      short: 'Pickup',
      position: 'Pickup',
      long: 'Pickup measure',
    });
    expect(names[3]).toEqual({ label: '1', short: '1', position: 'm. 1', long: 'Measure 1' });
    const interlude = performance.sections[2].start;
    expect(names[interlude].short).toBe('Interlude 1');
    const second = performance.sections[3].start;
    expect(names[second].short).toBe('Pickup (repeat)');
    expect(names[second + 1]).toEqual({
      label: '1',
      short: '1 (repeat)',
      position: 'm. 1 (repeat)',
      long: 'Measure 1 of the repeat',
    });
    expect(names[names.length - 1].short).toBe('Ending 1');
  });
});

describe('key changes in the files', () => {
  const performance = buildPerformance(bundle, baseline, 'off', 0, 'melody', { lift: 2 });
  const { song, arrangement, sections } = performance;

  it('are written into the MIDI file as key signatures', () => {
    const bytes = toMidiFile(song, buildNoteEvents(song, arrangement), {
      tempo: 80,
      tracks: ['right', 'left'],
      keyChanges: sections.map((section) => ({
        tick: song.measures[section.start].startTick,
        key: section.key,
      })),
    });
    // Meta event 0x59: F major has one flat (0xFF), G major one sharp (0x01).
    const signatures: number[] = [];
    for (let index = 0; index + 4 < bytes.length; index += 1) {
      if (bytes[index] === 0xff && bytes[index + 1] === 0x59 && bytes[index + 2] === 2) {
        signatures.push(bytes[index + 3]);
      }
    }
    expect(signatures).toEqual([0xff, 0x01]);
  });

  it('give each section of the staff notation its own key signature', () => {
    const options = { showLyrics: false, showDynamics: false };
    const first = toMei(song, arrangement, 0, sections[0].count, options);
    const repeat = sections[2];
    const second = toMei(song, arrangement, repeat.start, repeat.start + repeat.count, {
      ...options,
      key: repeat.key,
    });
    expect(first.mei).toContain('keysig="1f"');
    expect(second.mei).toContain('keysig="1s"');
  });
});

describe('fills that ring on', () => {
  // The melody waits from measure 2 beat 1 to measure 3 beat 3.
  const melody = `key: C\ntime: 4/4\n| [C]1 2 3 4 | [G]5 . . . | [C]0 0 3 2 | [C]1 . . . ||`;
  const withFill = (right: string) =>
    createSongBundle(melody, {
      baseline: { rightHand: { fills: { measures: [{ measure: 2, right }] } } },
      arrangements: [],
    });
  const fillNotes = (right: string) => {
    const filled = withFill(right);
    const performance = buildPerformance(filled, filled.arrangements[0], 'off', 0, 'fills');
    return buildNoteEvents(performance.song, performance.arrangement)
      .filter((event) => event.track === 'right' && event.slotId.startsWith('f'))
      .map((event) => ({ tick: event.tick, duration: event.duration, midi: event.midi }));
  };
  const measure = (number: number) => (number - 1) * FULL;

  it('hold the last note until the melody returns, when it belongs to the chord there', () => {
    // B, D, B, then G on the "and" of three. G belongs to the C chord of measure 3.
    const notes = fillNotes("5 (7 2') (7 5) 0");
    const last = notes[notes.length - 1];
    expect(last).toMatchObject({ tick: measure(2) + 2.5 * BEAT, midi: 67 });
    // It rings through the rest of the measure and the two rests, up to the E on beat three.
    expect(last.tick + last.duration).toBe(measure(3) + 2 * BEAT);
    // The notes before it are followed at once and keep their written length.
    expect(notes.slice(0, -1).every((note) => note.duration === BEAT / 2)).toBe(true);
  });

  it('let go of a note at the barline when the next chord does not contain it', () => {
    // The fill ends on D, which belongs to G but not to the C chord of measure 3.
    const notes = fillNotes("5 (7 2') (7 2') 0");
    const last = notes[notes.length - 1];
    expect(last.midi).toBe(74);
    expect(last.tick + last.duration).toBe(measure(3));
  });
});
