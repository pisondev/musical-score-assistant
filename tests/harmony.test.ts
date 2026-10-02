import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { buildPerformance } from '../src/core/performance';
import { buildNoteEvents } from '../src/core/playback';
import { chordsApply } from '../src/core/right-hand';
import { summarizeSong } from '../src/core/summary';

// "1" is C4 on the right-hand row. The melody waits from measure 2 beat 1 to measure 3 beat 3.
const SONG = `title: Test
key: C
time: 4/4

| [C]1 2 3 4 | [G]5 . . . | [C]0 0 3 2 | [C]1 . . . ||
L: one two three four five three two one
`;

const HARMONY = {
  summary: 'Chords on the long notes.',
  measures: [
    { measure: 1, right: '<3, 5, 1> 2 3 4' },
    { measure: 2, right: '~<7, 2 5> . . .' },
    { measure: 4, right: '~<3, 5, 1> . . .' },
  ],
};

const FILLS = {
  summary: 'An arch.',
  measures: [{ measure: 2, right: "<2 5> (7 2') (7 5) 7" }],
};

const ACCOMPANIMENT = {
  summary: 'Held chords.',
  measures: [1, 2, 3, 4].map((measure) => ({ measure, right: "<5 1' 3'> . . ." })),
};

const bundle = createSongBundle(SONG, {
  baseline: { rightHand: { harmony: HARMONY, fills: FILLS, accompaniment: ACCOMPANIMENT } },
  arrangements: [],
});
const [baseline] = bundle.arrangements;
const midis = (pitches: { midi: number }[]) => pitches.map((pitch) => pitch.midi);

describe('the chords under the melody', () => {
  it('are read as a right-hand part of their own and pass the checks', () => {
    expect(bundle.issues).toEqual([]);
    const part = baseline.rightHand.harmony!;
    expect(part.mode).toBe('harmony');
    expect(part.summary).toBe('Chords on the long notes.');
    expect(part.issues).toEqual([]);
    expect(part.measures.map((measure) => measure !== null)).toEqual([true, true, false, true]);
    expect(summarizeSong(bundle).rightHandParts).toBe(3);
  });

  it('turn melody notes into stacks, with the melody on top and everything else kept', () => {
    const plain = buildPerformance(bundle, baseline, 'off', 0);
    const full = buildPerformance(bundle, baseline, 'off', 0, 'melody', { chords: true });
    expect(plain.chords).toBe(false);
    expect(full.chords).toBe(true);
    expect(midis(plain.song.measures[0].slots[0].pitches)).toEqual([60]);

    const first = full.song.measures[0].slots[0];
    expect(midis(first.pitches)).toEqual([52, 55, 60]);
    expect(first).toMatchObject({ id: 'r0-0', kind: 'note', lyric: 'one' });
    expect(first.rolled).toBeUndefined();
    // The notes between the chords stay single.
    expect(full.song.measures[0].slots.slice(1).map((slot) => slot.pitches.length)).toEqual([
      1, 1, 1,
    ]);
    // Rhythm and holds are those of the melody.
    expect(full.song.measures[1].slots.map((slot) => slot.kind)).toEqual([
      'note',
      'hold',
      'hold',
      'hold',
    ]);
    expect(full.song.measures[1].slots[0]).toMatchObject({ rolled: true, lyric: 'five' });
    expect(midis(full.song.measures[1].slots[0].pitches)).toEqual([59, 62, 67]);
    expect(full.song.measures[2]).toEqual(plain.song.measures[2]);
  });

  it('sound with the melody in front and the long chords rolled', () => {
    const { song, arrangement } = buildPerformance(bundle, baseline, 'off', 0, 'melody', {
      chords: true,
    });
    const chord = buildNoteEvents(song, arrangement)
      .filter((event) => event.slotId === 'r1-0')
      .sort((a, b) => a.midi - b.midi);
    expect(chord.map((event) => event.midi)).toEqual([59, 62, 67]);
    // The melody note arrives on the beat; the notes under it lead up to it.
    expect(chord[2].tick).toBe(4 * 480);
    expect(chord[0].tick).toBeLessThan(chord[1].tick);
    expect(chord[1].tick).toBeLessThan(chord[2].tick);
    expect(chord[0].velocity).toBeLessThan(chord[2].velocity);
    // Every note of the chord lasts as long as the melody note it carries.
    expect(chord.every((event) => event.tick + event.duration === 8 * 480)).toBe(true);
  });

  it('go together with the fills, which leave out what the chord already holds', () => {
    const fills = buildPerformance(bundle, baseline, 'off', 0, 'fills');
    const both = buildPerformance(bundle, baseline, 'off', 0, 'fills', { chords: true });
    expect(both.rightHand).toBe('fills');
    expect(both.chords).toBe(true);

    // Without the chords, the fill adds D under the melody note on beat one.
    expect(midis(fills.song.measures[1].fills![0].pitches)).toEqual([62]);
    // With them, that D is part of the chord, so the fill starts after it.
    expect(midis(both.song.measures[1].slots[0].pitches)).toEqual([59, 62, 67]);
    expect(both.song.measures[1].fills![0]).toMatchObject({ kind: 'rest', pitches: [] });
    expect(both.song.measures[1].fills!.slice(1).map((slot) => slot.kind)).toEqual(
      fills.song.measures[1].fills!.slice(1).map((slot) => slot.kind),
    );

    const events = buildNoteEvents(both.song, both.arrangement).filter(
      (event) => event.track === 'right' && event.tick < 4 * 480 + 240,
    );
    const struck = events.filter((event) => event.midi === 62 && event.tick >= 4 * 480 - 100);
    expect(struck).toHaveLength(1);
  });

  it('do not apply to an accompaniment, which has chords of its own', () => {
    const performance = buildPerformance(bundle, baseline, 'off', 0, 'accompaniment', {
      chords: true,
    });
    expect(performance.chords).toBe(false);
    expect(midis(performance.song.measures[0].voice![0].pitches)).toEqual([60]);
    expect(chordsApply(baseline, 'accompaniment', true)).toBe(false);
    expect(chordsApply(baseline, 'melody', true)).toBe(true);
    expect(chordsApply(baseline, 'melody', false)).toBe(false);

    const bare = createSongBundle(SONG);
    expect(chordsApply(bare.arrangements[0], 'melody', true)).toBe(false);
    expect(
      buildPerformance(bare, bare.arrangements[0], 'off', 0, 'melody', { chords: true }).chords,
    ).toBe(false);
  });

  it('are carried into the last phrase when it is played as the introduction', () => {
    const performance = buildPerformance(bundle, baseline, 'last-phrase', 0, 'melody', {
      chords: true,
    });
    expect(performance.introMeasures).toBe(4);
    expect(midis(performance.song.measures[0].slots[0].pitches)).toEqual([52, 55, 60]);
    expect(performance.song.measures[1].slots[0].rolled).toBe(true);

    const plain = buildPerformance(bundle, baseline, 'last-phrase', 0);
    expect(midis(plain.song.measures[0].slots[0].pitches)).toEqual([60]);
  });

  it('must keep the melody on top and add nothing between its notes', () => {
    const faulty = createSongBundle(SONG, {
      baseline: {
        rightHand: {
          harmony: {
            measures: [
              { measure: 1, right: '<1 3> 2 3 4' },
              { measure: 2, right: '<7, 2 5> . 2 .' },
            ],
          },
        },
      },
      arrangements: [],
    });
    const messages = faulty.arrangements[0].rightHand.harmony!.issues.map(
      (issue) => `${issue.measure}: ${issue.message}`,
    );
    expect(messages).toContain(
      '0: The melody note on beat 1 is missing or changed; the chords part may add notes but must keep the melody on top.',
    );
    expect(messages).toContain(
      '1: A note on beat 3 stands where the melody has none; the chords part only adds notes under melody notes.',
    );
  });
});
