import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { toMei } from '../src/core/mei';
import { toMidiFile } from '../src/core/midi';
import { buildPerformance } from '../src/core/performance';
import { buildNoteEvents, buildSlotSpans } from '../src/core/playback';
import type { Issue } from '../src/core/types';

// "1" is C4 on the right-hand row. The melody waits from measure 2 beat 1 to measure 3 beat 3.
const SONG = `title: Test
key: C
time: 4/4
tempo: 80

| [C]1 2 3 4 | [G]5 . . . | [C]0 0 3 2 | [C]1 . . . ||
L: one two three four five three two one
`;

const LEFT = [
  { measure: 1, left: "[C]1 5 1' 5" },
  { measure: 2, left: "[G](1 5) (1' 5) (1 5) (1' 5)", note: 'Fill: rolling eighths.' },
  { measure: 3, left: "[C](1 5) (1' 5) 1 5" },
  { measure: 4, left: "[C]<1 5 1'> . . ." },
];

const FILLS = {
  summary: 'Fills in single notes.',
  measures: [
    { measure: 2, right: "5 (7 2') (7 5) 7", note: 'Fill: an arch on the G chord.' },
    { measure: 3, right: "(2' 7) 5 3 2" },
  ],
};

const ACCOMPANIMENT = {
  summary: 'Held chords.',
  measures: [
    { measure: 1, right: "<5 1'> . . ." },
    { measure: 2, right: "<5 7 2'> . <7 2' 5'> ." },
    { measure: 3, right: "<5 1' 3'> . . ." },
    { measure: 4, right: "<5 1' 3'> . . ." },
  ],
};

function bundleWith(rightHand: unknown, baseline?: unknown) {
  return createSongBundle(SONG, {
    baseline: baseline === undefined ? undefined : { rightHand: baseline },
    arrangements: [{ id: 'a', name: 'A', level: 'intermediate', measures: LEFT, rightHand }],
  });
}

const warnings = (issues: Issue[]) =>
  issues.filter((issue) => issue.severity !== 'info').map((issue) => issue.message);

describe('right-hand parts', () => {
  it('are built for the arrangement they are written under', () => {
    const bundle = bundleWith({ fills: FILLS, accompaniment: ACCOMPANIMENT });
    const [baseline, arrangement] = bundle.arrangements;
    expect(baseline.rightHand).toEqual({});
    expect(bundle.issues).toEqual([]);

    const fills = arrangement.rightHand.fills!;
    expect(fills.summary).toBe('Fills in single notes.');
    expect(fills.measures.map((measure) => measure !== null)).toEqual([false, true, true, false]);
    expect(warnings(fills.issues)).toEqual([]);
    expect(warnings(arrangement.rightHand.accompaniment!.issues)).toEqual([]);
  });

  it('can be added to the generated baseline', () => {
    const bundle = bundleWith(undefined, { fills: FILLS });
    const [baseline, arrangement] = bundle.arrangements;
    expect(baseline.rightHand.fills).toBeDefined();
    expect(arrangement.rightHand).toEqual({});
  });

  it('keep the lyrics under the melody notes of a fill', () => {
    const fills = bundleWith({ fills: FILLS }).arrangements[1].rightHand.fills!;
    const slots = fills.measures[1]!.slots;
    expect(slots[0].lyric).toBe('five');
    expect(slots.slice(1).every((slot) => slot.lyric === undefined)).toBe(true);
    // Slot ids must not collide with those of the melody they replace.
    expect(slots[0].id).toBe('f1-0');
  });

  it('reports malformed parts', () => {
    const bundle = bundleWith({ fills: { measures: [{ measure: 2 }] }, accompaniment: [] });
    expect(bundle.issues.map((issue) => issue.message)).toEqual([
      'Arrangement 1: right hand "fills" has a measure without a numeric "measure" and a text "right".',
      'Arrangement 1: right hand "accompaniment" needs a "measures" array.',
    ]);
  });

  it('reports a measure with the wrong number of beats', () => {
    const fills = bundleWith({
      fills: { measures: [{ measure: 2, right: '5 7 5' }, FILLS.measures[1]] },
    }).arrangements[1].rightHand.fills!;
    expect(fills.issues.filter((issue) => issue.severity === 'error')).toMatchObject([
      { message: 'Right hand has 3 beats; this measure needs 4.', measure: 1, hand: 'right' },
    ]);
  });
});

describe('fills', () => {
  it('must keep every melody note in place and on top', () => {
    const changed = bundleWith({
      fills: { measures: [{ measure: 2, right: "6 (7 2') (7 5) 7" }, FILLS.measures[1]] },
    }).arrangements[1].rightHand.fills!;
    expect(warnings(changed.issues)).toEqual([
      'The melody note on beat 1 is missing or changed; a fill may add notes but must keep the melody on top.',
    ]);

    const covered = bundleWith({
      fills: { measures: [{ measure: 2, right: "<5 7> (7 2') (7 5) 7" }, FILLS.measures[1]] },
    }).arrangements[1].rightHand.fills!;
    expect(warnings(covered.issues)).toHaveLength(1);

    const underneath = bundleWith({
      fills: { measures: [{ measure: 2, right: "<3 5> (7 2') (7 5) 7" }, FILLS.measures[1]] },
    }).arrangements[1].rightHand.fills!;
    expect(warnings(underneath.issues)).toEqual([]);
  });

  it('must add something in every gap', () => {
    const idle = bundleWith({
      fills: { measures: [{ measure: 1, right: '<5, 1> 2 3 4' }] },
    }).arrangements[1].rightHand.fills!;
    expect(warnings(idle.issues)).toEqual([
      'The melody waits here, but the right hand adds no fill.',
    ]);
  });

  it('count towards the pulse when the left hand rests', () => {
    const resting = [LEFT[0], { measure: 2, left: '[G]1 0 0 0' }, LEFT[2], LEFT[3]];
    const bundle = createSongBundle(SONG, {
      arrangements: [
        {
          id: 'a',
          name: 'A',
          level: 'intermediate',
          measures: resting,
          rightHand: { fills: FILLS },
        },
      ],
    });
    const arrangement = bundle.arrangements[1];
    expect(warnings(arrangement.issues)).toEqual([
      'The melody waits here, but the left hand is silent on beat 2; mark every beat so the pulse stays audible.',
    ]);
    expect(warnings(arrangement.rightHand.fills!.issues)).toEqual([]);

    const sparse = createSongBundle(SONG, {
      arrangements: [
        {
          id: 'a',
          name: 'A',
          level: 'intermediate',
          measures: resting,
          rightHand: {
            fills: { measures: [{ measure: 2, right: "5 2' . 7" }, FILLS.measures[1]] },
          },
        },
      ],
    }).arrangements[1].rightHand.fills!;
    expect(warnings(sparse.issues)).toEqual([
      'The melody waits here, but neither hand plays on beat 3; mark every beat so the pulse stays audible.',
    ]);
  });
});

describe('accompaniment', () => {
  it('rests, with a warning, where no measure is written', () => {
    const part = bundleWith({
      accompaniment: { measures: ACCOMPANIMENT.measures.slice(0, 3) },
    }).arrangements[1].rightHand.accompaniment!;
    expect(warnings(part.issues)).toEqual([
      'No accompaniment is written for this measure; the right hand rests.',
    ]);
    expect(part.measures[3]!.slots).toMatchObject([{ kind: 'rest', duration: 1920 }]);
  });

  it('must not clash with the sung melody or the chords', () => {
    const measures = [...ACCOMPANIMENT.measures];
    // B and D against the C and E of the singers and of the chord.
    measures[0] = { measure: 1, right: "<7 2' 5'> . . ." };
    const part = bundleWith({ accompaniment: { measures } }).arrangements[1].rightHand
      .accompaniment!;
    expect(warnings(part.issues)).toEqual([
      'Right-hand note 7 on beat 1 clashes with chord [C].',
      'Right-hand note 7 on beat 1 clashes with the sung melody.',
    ]);
  });

  it('must stay above the left hand', () => {
    const measures = [...ACCOMPANIMENT.measures];
    measures[3] = { measure: 4, right: '<1, 3, 5,> . . .' };
    const part = bundleWith({ accompaniment: { measures } }).arrangements[1].rightHand
      .accompaniment!;
    expect(warnings(part.issues)).toEqual([
      'Left hand reaches up to the right hand; move it lower.',
      'Right hand reaches down into the left hand; move it higher.',
    ]);
  });

  it('may replace the left hand of a measure', () => {
    const measures = [...ACCOMPANIMENT.measures];
    measures[1] = {
      measure: 2,
      right: "<5 7 2'> (7 2') (5' 2') 7",
      left: "[G]1 5 1' 5",
      note: 'The right hand takes the fill.',
    } as (typeof measures)[number];
    const bundle = bundleWith({ accompaniment: { measures } });
    const arrangement = bundle.arrangements[1];
    expect(warnings(arrangement.rightHand.accompaniment!.issues)).toEqual([]);

    const performance = buildPerformance(bundle, arrangement, 'off', 0, 'accompaniment');
    const played = performance.arrangement.measures[1];
    expect(played.slots).toHaveLength(4);
    expect(played.note).toBeUndefined();
    expect(played.rightNote).toBe('The right hand takes the fill.');
    // The arrangement itself is untouched.
    expect(arrangement.measures[1].slots).toHaveLength(8);
  });

  it('warns when a replaced left hand leaves on another chord', () => {
    const measures = [...ACCOMPANIMENT.measures];
    measures[0] = { measure: 1, right: "<5 1' 3'> . . .", left: '[C]1 5 [F]1 5' } as never;
    const left = [LEFT[0], { measure: 2, left: "(1 5) (1' 5) (1 5) (1' 5)" }, LEFT[2], LEFT[3]];
    const part = createSongBundle(SONG, {
      arrangements: [
        {
          id: 'a',
          name: 'A',
          level: 'intermediate',
          measures: left,
          rightHand: { accompaniment: { measures } },
        },
      ],
    }).arrangements[1].rightHand.accompaniment!;
    expect(warnings(part.issues)).toContain(
      'The replaced left hand ends on [F], but the next measure continues [C]; end on the same chord.',
    );
  });
});

describe('a performance with a right-hand part', () => {
  const bundle = bundleWith({ fills: FILLS, accompaniment: ACCOMPANIMENT });
  const arrangement = bundle.arrangements[1];

  it('falls back to the melody when the arrangement has no such part', () => {
    const performance = buildPerformance(bundle, bundle.arrangements[0], 'off', 0, 'fills');
    expect(performance.rightHand).toBe('melody');
    expect(performance.song.measures).toEqual(bundle.song.measures);
  });

  it('puts fills in the place of the melody, measure by measure', () => {
    const performance = buildPerformance(bundle, arrangement, 'off', 0, 'fills');
    expect(performance.rightHand).toBe('fills');
    expect(performance.song.measures[0].slots).toBe(bundle.song.measures[0].slots);
    expect(performance.song.measures[1].slots.map((slot) => slot.id)).toEqual([
      'f1-0',
      'f1-1',
      'f1-2',
      'f1-3',
      'f1-4',
      'f1-5',
    ]);
    expect(performance.song.measures.every((measure) => measure.voice === undefined)).toBe(true);
    expect(performance.arrangement.measures[1].rightNote).toBe('Fill: an arch on the G chord.');
    expect(performance.arrangement.measures[1].note).toBe('Fill: rolling eighths.');
  });

  it('keeps the sung melody as a voice beside an accompaniment', () => {
    const performance = buildPerformance(bundle, arrangement, 'off', 0, 'accompaniment');
    const { song } = performance;
    expect(song.measures.map((measure) => measure.voice)).toEqual(
      bundle.song.measures.map((measure) => measure.slots),
    );

    const events = buildNoteEvents(song, performance.arrangement);
    const voice = events.filter((event) => event.track === 'voice');
    expect(voice.map((event) => event.midi)).toEqual([60, 62, 64, 65, 67, 64, 62, 60]);
    expect(events.filter((event) => event.track === 'right')).toHaveLength(14);

    const spans = buildSlotSpans(song, performance.arrangement);
    expect(spans.filter((span) => span.track === 'voice')).toHaveLength(16);
    expect(new Set(spans.map((span) => span.id)).size).toBe(spans.length);
  });

  it('leaves the introduction on the melody', () => {
    const performance = buildPerformance(bundle, arrangement, 'last-phrase', 0, 'accompaniment');
    expect(performance.introMeasures).toBe(4);
    const intro = performance.song.measures.slice(0, 4);
    expect(intro.every((measure) => measure.voice === undefined)).toBe(true);
    expect(intro[0].slots.map((slot) => slot.pitches[0]?.midi)).toEqual([60, 62, 64, 65]);
    expect(performance.song.measures[4].voice).toBeDefined();
  });

  it('transposes the voice with the hands', () => {
    const performance = buildPerformance(bundle, arrangement, 'off', 2, 'accompaniment');
    const first = performance.song.measures[0];
    expect(first.voice![0].pitches[0].midi).toBe(62);
    expect(first.slots[0].pitches.map((pitch) => pitch.midi)).toEqual([69, 74]);
  });

  it('writes the voice as a third staff that carries the lyrics', () => {
    const performance = buildPerformance(bundle, arrangement, 'off', 0, 'accompaniment');
    const { mei, spans } = toMei(performance.song, performance.arrangement, 0, 4, {
      showLyrics: true,
      showDynamics: true,
    });
    expect(mei.match(/<staffDef /g)).toHaveLength(3);
    expect(mei).toContain('<staffDef n="1" lines="5" clef.shape="G" clef.line="2" scale="75%"/>');
    expect(mei).toContain('<staffDef n="3" lines="5" clef.shape="F" clef.line="4"/>');
    const firstMeasure = mei.slice(mei.indexOf('<measure'), mei.indexOf('</measure>'));
    const [voiceStaff, rightStaff] = firstMeasure.split('<staff n="2">');
    expect(voiceStaff).toContain('type="voice"');
    expect(voiceStaff).toContain('<verse');
    expect(rightStaff).not.toContain('<verse');
    expect(spans.some((span) => span.track === 'voice')).toBe(true);

    const plain = buildPerformance(bundle, arrangement, 'off', 0, 'fills');
    const twoStaves = toMei(plain.song, plain.arrangement, 0, 4, {
      showLyrics: true,
      showDynamics: true,
    }).mei;
    expect(twoStaves.match(/<staffDef /g)).toHaveLength(2);
  });

  it('writes the voice as a MIDI track of its own', () => {
    const performance = buildPerformance(bundle, arrangement, 'off', 0, 'accompaniment');
    const events = buildNoteEvents(performance.song, performance.arrangement);
    const bytes = toMidiFile(performance.song, events, {
      tempo: 80,
      tracks: ['right', 'left', 'voice'],
    });
    // Format 1 with a conductor track and three music tracks.
    expect([...bytes.slice(8, 12)]).toEqual([0, 1, 0, 4]);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('Voice');
    // Program change on the third channel: "Voice Oohs".
    const program = bytes.findIndex((byte, index) => byte === 0xc2 && bytes[index + 1] === 53);
    expect(program).toBeGreaterThan(0);
  });
});
