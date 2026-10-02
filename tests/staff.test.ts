import { describe, expect, it } from 'vitest';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { createSongBundle } from '../src/core/bundle';
import { findGaps } from '../src/core/gaps';
import { KEYBOARD_LOWEST } from '../src/core/keyboard';
import { toMei } from '../src/core/mei';
import { parseNoteName } from '../src/core/notes';
import { buildPerformance } from '../src/core/performance';
import { parseSong } from '../src/core/song';
import {
  engraveRow,
  keySignatureAlters,
  keySignatureFifths,
  spellForStaff,
  splitDuration,
  type StaffEvent,
} from '../src/core/staff';
import type { Song } from '../src/core/types';

const FOUR_FOUR = { beats: 4, unit: 4 };
const THREE_FOUR = { beats: 3, unit: 4 };
const key = (name: string) => parseNoteName(name)!;

const describeEvents = (events: StaffEvent[]) =>
  events.map(
    (event) =>
      `${event.kind === 'rest' ? 'r' : 'n'}${event.value}${'.'.repeat(event.dots)}${event.tie}`,
  );

const engrave = (song: Song) => engraveRow(song.measures, song.meta.time, song.meta.key);

describe('key signatures', () => {
  it('count sharps and flats', () => {
    expect(keySignatureFifths(key('C'))).toBe(0);
    expect(keySignatureFifths(key('G'))).toBe(1);
    expect(keySignatureFifths(key('F'))).toBe(-1);
    expect(keySignatureFifths(key('Eb'))).toBe(-3);
    expect(keySignatureFifths(key('E'))).toBe(4);
  });

  it('give the accidental of every letter', () => {
    // F major flattens B only; letters are indexed C to B.
    expect(keySignatureAlters(key('F'))).toEqual([0, 0, 0, 0, 0, 0, -1]);
    expect(keySignatureAlters(key('D'))).toEqual([1, 0, 0, 1, 0, 0, 0]);
  });
});

describe('spellForStaff', () => {
  const f = key('F');
  const tone = (degree: number, accidental = 0, octave = 0) => ({ degree, accidental, octave });

  it('names scale notes by the key', () => {
    expect(spellForStaff({ midi: 65, tone: tone(1) }, f)).toEqual({
      step: 'f',
      octave: 4,
      alter: 0,
    });
    expect(spellForStaff({ midi: 70, tone: tone(4) }, f)).toEqual({
      step: 'b',
      octave: 4,
      alter: -1,
    });
    expect(spellForStaff({ midi: 60, tone: tone(5, 0, -1) }, f)).toEqual({
      step: 'c',
      octave: 4,
      alter: 0,
    });
  });

  it('applies the accidental of the tone', () => {
    // "#4" in F major is B natural; "b7" is E flat.
    expect(spellForStaff({ midi: 71, tone: tone(4, 1) }, f)).toEqual({
      step: 'b',
      octave: 4,
      alter: 0,
    });
    expect(spellForStaff({ midi: 39, tone: tone(7, -1, -1) }, f)).toEqual({
      step: 'e',
      octave: 2,
      alter: -1,
    });
  });
});

describe('splitDuration', () => {
  const values = (start: number, duration: number, time = FOUR_FOUR, length = 1920) =>
    splitDuration(start, duration, length, time).map(
      (piece) => `${piece.value}${'.'.repeat(piece.dots)}`,
    );

  it('writes plain values as one note', () => {
    expect(values(0, 480)).toEqual(['4']);
    expect(values(0, 720)).toEqual(['4.']);
    expect(values(0, 1920)).toEqual(['1']);
    expect(values(0, 1440, THREE_FOUR, 1440)).toEqual(['2.']);
  });

  it('breaks a note that starts off the beat at the next beat', () => {
    expect(values(240, 480)).toEqual(['8', '8']);
    expect(values(240, 720)).toEqual(['8', '4']);
  });

  it('does not cross the middle of a four-four measure from beat two', () => {
    expect(values(480, 960)).toEqual(['4', '4']);
    expect(values(960, 960)).toEqual(['2']);
  });
});

describe('engraveRow', () => {
  it('merges hold dots into longer notes', () => {
    const song = parseSong('key: C\ntime: 4/4\n| 1 . . . | 5 . 3 0 | 3 (. 5) 1 . |');
    const rows = engrave(song);
    expect(describeEvents(rows[0])).toEqual(['n1']);
    expect(describeEvents(rows[1])).toEqual(['n2', 'n4', 'r4']);
    expect(describeEvents(rows[2])).toEqual(['n4.', 'n8', 'n2']);
  });

  it('ties a note that is held over the barline', () => {
    const song = parseSong('key: G\ntime: 3/4\n| 5 . . | . . 3 |');
    const rows = engrave(song);
    expect(describeEvents(rows[0])).toEqual(['n2.i']);
    expect(describeEvents(rows[1])).toEqual(['n2t', 'n4']);
    expect(rows[1][0].pitches[0]).toMatchObject({ step: 'd', octave: 5 });
  });

  it('keeps the slot ids, so the playhead can find the notes', () => {
    const song = parseSong('key: C\ntime: 4/4\n| 1 (2 3) 4 . |');
    const ids = engrave(song)[0].map((event) => event.id);
    expect(ids).toEqual(['r0-0', 'r0-1', 'r0-2', 'r0-3']);
  });

  it('beams eighth notes within a beat and leaves quarters alone', () => {
    const song = parseSong('key: C\ntime: 4/4\n| (1 2) 3 (4 5) (6 0) |');
    expect(engrave(song)[0].map((event) => event.beam ?? '-')).toEqual([
      'start',
      'end',
      '-',
      'start',
      'end',
      '-',
      '-',
    ]);
  });

  it('writes an accidental once per measure and cancels it with a natural', () => {
    const song = parseSong('key: F\ntime: 4/4\n| #4 #4 4 4 | #4 . . . |');
    const signs = engrave(song).map((events) => events.map((event) => event.pitches[0].accidental));
    // B natural needs a sign, then not again; B flat needs its flat back; a new measure starts fresh.
    expect(signs).toEqual([[0, null, -1, null], [0]]);
  });

  it('writes triplets with the value they would have without the triplet', () => {
    const song = parseSong('key: C\ntime: 4/4\n| (1 2 3) 4 5 6 |');
    const events = engrave(song)[0];
    expect(events.slice(0, 3).map((event) => [event.value, event.triplet])).toEqual([
      [8, 'start'],
      [8, 'middle'],
      [8, 'end'],
    ]);
  });
});

describe('toMei', () => {
  const bundle = createSongBundle(
    'title: Test & Co\nkey: F\ntime: 4/4\n| {mp}(0 5,) (1 1) | [F]3 . {<}2 1 | {f}[C7]5 . . . ||\nL: Me-nga-pa Ye-sus ti-ba',
    {
      arrangements: [
        {
          id: 'a',
          name: 'A',
          measures: [
            { measure: 0, left: '0 0' },
            { measure: 1, left: "[F]1 <5 1'> [Dm7]1 5" },
            { measure: 2, left: '[C7]1 5 7 5' },
          ],
        },
      ],
    },
  );
  const performance = buildPerformance(bundle, bundle.arrangements[1], 'off', 0);
  const options = { showLyrics: true, showDynamics: true };
  const { mei, spans } = toMei(performance.song, performance.arrangement, 0, 3, options);

  it('describes a grand staff in the key and meter of the song', () => {
    expect(mei).toContain('keysig="1f"');
    expect(mei).toContain('meter.count="4" meter.unit="4"');
    expect(mei).toContain('clef.shape="G"');
    expect(mei).toContain('clef.shape="F"');
    expect(mei).toContain('<title>Test &amp; Co</title>');
  });

  it('carries the slot ids, the hand, and the measure ids', () => {
    expect(mei).toContain('xml:id="slot-r1-0" type="right"');
    expect(mei).toContain('xml:id="slot-l1-1" type="left"');
    expect(mei).toContain('xml:id="measure-1" n="1"');
    expect(mei).toContain('metcon="false"');
    expect(mei).toContain('right="end"');
  });

  it('writes chords, dynamics, hairpins, and lyrics', () => {
    expect(mei).toContain('<harm staff="1" place="above" tstamp="1">F</harm>');
    expect(mei).toContain('tstamp="3">Dm7</harm>');
    expect(mei).toContain('<dynam staff="1" place="below" tstamp="1">mp</dynam>');
    expect(mei).toContain('form="cres" tstamp="3" tstamp2="0m+5"');
    expect(mei).toContain('<syl wordpos="i" con="d">Me</syl>');
    expect(mei).toContain('<syl wordpos="t">pa</syl>');
    expect(mei).toContain('<chord xml:id="slot-l1-1"');
  });

  it('leaves out what is switched off', () => {
    const bare = toMei(performance.song, performance.arrangement, 0, 3, {
      showLyrics: false,
      showDynamics: false,
    }).mei;
    expect(bare).not.toContain('<verse');
    expect(bare).not.toContain('<dynam');
    expect(bare).not.toContain('<hairpin');
  });

  it('lists a time span for every written symbol', () => {
    expect(spans.find((span) => span.id === 'r1-0')).toEqual({
      id: 'r1-0',
      track: 'right',
      start: 960,
      end: 1920,
    });
    expect(spans.every((span) => span.end > span.start)).toBe(true);
  });

  it('is accepted by the engraver, which keeps the ids', async () => {
    const toolkit = new VerovioToolkit(await createVerovioModule());
    toolkit.setOptions({ pageWidth: 2000, adjustPageHeight: true, header: 'none', footer: 'none' });
    expect(toolkit.loadData(mei)).toBeTruthy();
    const svg = toolkit.renderToSVG(1);
    expect(svg).toContain('id="slot-r1-0"');
    expect(svg).toContain('id="measure-2"');
    expect(svg).toMatch(/class="[^"]*\bleft\b/);
  }, 30000);
});

describe('gaps', () => {
  const song = parseSong(
    'key: F\ntime: 4/4\n| (0 5,) (1 1) | 3 . 2 1 | 2 4 . 2 | 3 . (0 5,) (1 1) | 3 . . (3 3) | 1 . ||',
  );

  it('are the places where the melody waits for more than two beats', () => {
    const gaps = findGaps(song);
    expect(gaps.map((gap) => gap.measure)).toEqual([3, 4]);
    // Measure 3: the note on beat one is answered on the "and" of three; beats two and three are empty.
    expect(gaps[0].beats.map((tick) => (tick - song.measures[3].startTick) / 480 + 1)).toEqual([
      2, 3,
    ]);
    expect(gaps[1].beats).toHaveLength(2);
  });

  it('do not include the end of the song', () => {
    const held = parseSong('key: C\ntime: 4/4\n| 1 2 3 4 | 1 . . . | . . . . ||');
    expect(findGaps(held)).toEqual([]);
  });

  const withLeft = (level: string, left: string) =>
    createSongBundle('key: F\ntime: 4/4\n| [F]3 . 2 1 | [F]3 . (0 5,) (1 1) | [F]1 . . . ||', {
      arrangements: [
        {
          id: 'a',
          name: 'A',
          level,
          measures: [
            { measure: 1, left: "[F]1 5 1' 5" },
            { measure: 2, left },
            { measure: 3, left: '[F]<1 5> . . .' },
          ],
        },
      ],
    }).arrangements[1].issues.map((issue) => issue.message);

  it('must have the left hand on every beat', () => {
    expect(withLeft('easy', "[F]1 . 1' 5")[0]).toContain('silent on beat 2');
    expect(withLeft('easy', "[F]1 5 1' 5")).toEqual([]);
  });

  it('need a fill that moves from the intermediate level on', () => {
    expect(withLeft('intermediate', "[F]1 5 1' 5")[0]).toContain('add a fill');
    expect(withLeft('intermediate', "[F]1 (5 1') (3' 1') 5")).toEqual([]);
    expect(withLeft('advanced', "[F]1 5 (1' 3') 5")).toEqual([]);
  });
});

describe('keyboard range', () => {
  const song = 'key: C\ntime: 4/4\n| [C]5 . . . | [C]1 . . . ||';
  const arrange = (left: string) =>
    createSongBundle(song, {
      arrangements: [
        {
          id: 'a',
          name: 'A',
          measures: [
            { measure: 1, left },
            { measure: 2, left: '[C]1 5 1 5' },
          ],
        },
      ],
    });

  it('warns about notes below the lowest key', () => {
    const messages = arrange('[C]5, 1 5 1').arrangements[1].issues.map((issue) => issue.message);
    expect(messages.some((message) => message.includes('below C2'))).toBe(true);
    expect(arrange('[C]1 5 1 5').arrangements[1].issues).toEqual([]);
  });

  it('keeps transposed notes on the keyboard', () => {
    const bundle = arrange("[C]<1 1'> 5 1 5");
    const lower = buildPerformance(bundle, bundle.arrangements[1], 'off', -2);
    const pitches = lower.arrangement.measures.flatMap((measure) =>
      measure.slots.flatMap((slot) => slot.pitches),
    );
    expect(Math.min(...pitches.map((pitch) => pitch.midi))).toBeGreaterThanOrEqual(KEYBOARD_LOWEST);

    // The octave C2 and C3 would become B flat 1 and B flat 2; only the upper note remains.
    const first = lower.arrangement.measures[0].slots[0];
    expect(first.pitches.map((pitch) => pitch.midi)).toEqual([46]);
    expect(first.pitches[0].tone).toEqual({ degree: 1, accidental: 0, octave: 1 });
    // Notes that stay on the keyboard simply move down.
    expect(lower.arrangement.measures[0].slots[1].pitches[0].midi).toBe(41);
  });
});
