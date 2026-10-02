import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { toMei } from '../src/core/mei';
import { parseNotationLine } from '../src/core/notation';
import { buildPerformance } from '../src/core/performance';
import { buildNoteEvents, buildWrittenNotes } from '../src/core/playback';

const BEAT = 480;
const ROLL = 16;

// "1" is C4 on the right-hand row and C2 on the left-hand row.
const SONG = `key: C
time: 4/4
| [C]~<1 3 5> . 2 . | [G]7, . ~<5, 7, 2> . ||
`;

const ARRANGEMENTS = {
  arrangements: [
    {
      id: 'rolled',
      name: 'Rolled',
      level: 'advanced',
      measures: [
        { measure: 1, left: "[C]~<1 5 1'> . <1 5> ." },
        { measure: 2, left: "[G]1 5 ~<1 5 1'> ." },
      ],
    },
  ],
};

const bundle = createSongBundle(SONG, ARRANGEMENTS);
const rolled = bundle.arrangements[1];

describe('rolled chords in the notation', () => {
  it('are stacked notes written with a tilde', () => {
    const { measures, issues } = parseNotationLine('| ~<1 3 5> . <1 3> (2 ~<5, 2>) |', BEAT, 1);
    expect(issues).toEqual([]);
    expect(measures[0].slots.map((slot) => [slot.kind, slot.tones.length, slot.rolled])).toEqual([
      ['note', 3, true],
      ['hold', 0, false],
      ['note', 2, false],
      ['note', 1, false],
      ['note', 2, true],
    ]);
  });

  it('need stacked notes to roll', () => {
    const { issues } = parseNotationLine('| ~1 2 3 4 |', BEAT, 1);
    expect(issues.map((issue) => issue.message)).toEqual([
      '"~" rolls a chord and must be followed by stacked notes: ~<1 3 5>.',
    ]);
  });

  it('are kept by the melody, the left hand, and every passage', () => {
    expect(bundle.song.issues).toEqual([]);
    expect(rolled.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(bundle.song.measures[0].slots[0].rolled).toBe(true);
    expect(bundle.song.measures[0].slots[2].rolled).toBeUndefined();
    expect(rolled.measures[0].slots[0].rolled).toBe(true);
    expect(rolled.measures[0].slots[2].rolled).toBeUndefined();

    const ending = createSongBundle(SONG, {
      endings: [
        {
          id: 'amen',
          name: 'Amen',
          measures: [{ right: "~<3 5 1'> . . .", left: "[C]~<1 5 1'> . . ." }],
        },
      ],
      arrangements: [],
    }).endings[0];
    expect(ending.measures[0].slots[0].rolled).toBe(true);
    expect(ending.parts[0].slots[0].rolled).toBe(true);
  });
});

describe('rolled chords in the sound', () => {
  const events = buildNoteEvents(bundle.song, rolled);
  const of = (slotId: string) =>
    events
      .filter((event) => event.slotId === slotId)
      .sort((a, b) => a.midi - b.midi)
      .map((event) => ({ tick: event.tick, end: event.tick + event.duration, midi: event.midi }));

  it('start on the beat in the left hand and climb from the bass', () => {
    const chord = of(rolled.measures[1].slots[2].id);
    const beat = 4 * BEAT + 2 * BEAT;
    expect(chord.map((note) => note.midi)).toEqual([43, 50, 55]);
    expect(chord.map((note) => note.tick)).toEqual([beat, beat + ROLL, beat + 2 * ROLL]);
    // Every note is released together, where the written chord ends.
    expect(new Set(chord.map((note) => note.end)).size).toBe(1);
  });

  it('lead up to the beat in the right hand, so the top note is on time', () => {
    const chord = of(bundle.song.measures[1].slots[2].id);
    const beat = 4 * BEAT + 2 * BEAT;
    expect(chord.map((note) => note.midi)).toEqual([55, 59, 62]);
    expect(chord.map((note) => note.tick)).toEqual([beat - 2 * ROLL, beat - ROLL, beat]);
    expect(chord.every((note) => note.end === beat + 2 * BEAT)).toBe(true);
  });

  it('never start before the piece does', () => {
    const chord = of(bundle.song.measures[0].slots[0].id);
    expect(chord.map((note) => note.tick)).toEqual([0, 0, 0]);
  });

  it('leave the written notes, which the checker reads, on the beat', () => {
    const written = buildWrittenNotes(bundle.song, rolled).filter(
      (event) => event.slotId === bundle.song.measures[1].slots[2].id,
    );
    expect(written.map((event) => event.tick)).toEqual([6 * BEAT, 6 * BEAT, 6 * BEAT]);
  });

  it('are played with the top note in front', () => {
    const chord = events
      .filter((event) => event.slotId === bundle.song.measures[1].slots[2].id)
      .sort((a, b) => a.midi - b.midi);
    expect(chord[0].velocity).toBeLessThan(chord[2].velocity);
    expect(chord[1].velocity).toBe(chord[0].velocity);
    const left = events.filter((event) => event.slotId === rolled.measures[0].slots[2].id);
    expect(left[0].velocity).toBe(left[1].velocity);
  });
});

describe('rolled chords on the staff', () => {
  it('get an arpeggio line that points at the chord', () => {
    const performance = buildPerformance(bundle, rolled, 'off', 0);
    const { mei } = toMei(performance.song, performance.arrangement, 0, 2, {
      showLyrics: false,
      showDynamics: false,
    });
    const marks = mei.match(/<arpeg plist="#slot-[^"]+"\/>/g) ?? [];
    expect(marks).toHaveLength(4);
    expect(mei).toContain(`<arpeg plist="#slot-${bundle.song.measures[0].slots[0].id}"/>`);
    expect(mei).toContain(`<chord xml:id="slot-${bundle.song.measures[0].slots[0].id}"`);
  });
});
