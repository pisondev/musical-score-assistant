import { describe, expect, it } from 'vitest';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { createSongBundle } from '../src/core/bundle';
import { elapsedTicks, findFermatas, paceAt } from '../src/core/fermata';
import { toMei } from '../src/core/mei';
import { toMidiFile } from '../src/core/midi';
import { parseNotationLine } from '../src/core/notation';
import { buildPerformance } from '../src/core/performance';
import { buildNoteEvents } from '../src/core/playback';
import { INTRO_LAST_PHRASE } from '../src/core/types';

const BEAT = 480;
const MEASURE = 4 * BEAT;

// Three measures in four-four. The melody holds the third beat of the second measure.
const SONG = `title: Hold
key: C
time: 4/4
tempo: 60
| [C]1 2 3 4 | [F]6 5 4^ (3 2) | [C]1 . . 0 ||
`;

const ARRANGEMENTS = {
  baseline: {
    rightHand: {
      accompaniment: {
        measures: [
          { measure: 1, right: '<1 3 5> . <1 3 5> .' },
          { measure: 2, right: '<1 4 6> . <1 4 6> .' },
          { measure: 3, right: '<1 3 5> . . .' },
        ],
      },
    },
  },
  intro: { lastPhraseFrom: 2 },
  endings: [
    {
      id: 'amen',
      name: 'Amen',
      measures: [
        { right: '<4 6> . <3 5>^ .', left: '[F]1 . [C]<1 5>^ .' },
        { right: "<3 5 1'>^ . . .", left: '[C]1 5 1 .' },
      ],
    },
  ],
  arrangements: [
    {
      id: 'plain',
      name: 'Plain',
      measures: [
        { measure: 1, left: '[C]1 5 1 5' },
        { measure: 2, left: '[F]1 5 1 5' },
        { measure: 3, left: '[C]<1 5>^ . . .' },
      ],
    },
  ],
};

const bundle = createSongBundle(SONG, ARRANGEMENTS);
const [baseline, plain] = bundle.arrangements;

describe('a fermata in the notation', () => {
  it('is a caret behind a note, a stack, a rest, or a hold dot', () => {
    const { measures, issues } = parseNotationLine(
      "| 1^ 2 <1 3>^ 0^ | 5'^ . .^ ~<1 5>^ |",
      BEAT,
      1,
    );
    expect(issues).toEqual([]);
    expect(measures.map((measure) => measure.slots.map((slot) => slot.fermata))).toEqual([
      [true, false, true, true],
      [true, false, true, true],
    ]);
    expect(measures[1].slots[0].tones[0].octave).toBe(1);
    expect(measures[1].slots[3].rolled).toBe(true);
  });

  it('goes with the mark of an uncertain note, in either order', () => {
    const { measures, issues } = parseNotationLine('| 1?^ 2^? 0?^ <1 3?>^ |', BEAT, 1);
    expect(issues).toEqual([]);
    expect(measures[0].slots.map((slot) => [slot.uncertain, slot.fermata])).toEqual([
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ]);
  });

  it('is written after the octave marks of its note', () => {
    const { issues } = parseNotationLine("| 1^' 2 3 4 |", BEAT, 1);
    expect(issues.map((issue) => issue.message)).toEqual([`Unexpected character "'".`]);
  });

  it('is kept by the melody, the left hand, and every passage', () => {
    expect(bundle.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(bundle.song.issues).toEqual([]);
    expect(bundle.song.measures[1].slots.map((slot) => slot.fermata ?? false)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(plain.measures[2].slots[0].fermata).toBe(true);
    expect(plain.measures[1].slots[0].fermata).toBeUndefined();

    const ending = bundle.endings[0];
    expect(ending.measures[0].slots[2].fermata).toBe(true);
    expect(ending.parts[0].slots[2].fermata).toBe(true);
    expect(ending.measures[1].slots[0].fermata).toBe(true);
  });
});

describe('the time a fermata takes', () => {
  it('doubles a note of one beat', () => {
    expect(findFermatas(bundle.song, baseline)).toEqual([
      { start: MEASURE + 2 * BEAT, end: MEASURE + 3 * BEAT, extra: BEAT },
    ]);
  });

  it('lasts as long as the marked note with its hold dots, and adds two beats at most', () => {
    const fermatas = findFermatas(bundle.song, plain);
    expect(fermatas).toEqual([
      { start: MEASURE + 2 * BEAT, end: MEASURE + 3 * BEAT, extra: BEAT },
      { start: 2 * MEASURE, end: 3 * MEASURE, extra: 2 * BEAT },
    ]);
  });

  it('follows a held note across the barline', () => {
    const tied = createSongBundle('key: C\ntime: 3/4\n| [C]1 2 3^ | . . 5 | 1 . . ||', {
      arrangements: [],
    });
    expect(findFermatas(tied.song, tied.arrangements[0])).toEqual([
      { start: 2 * BEAT, end: 5 * BEAT, extra: 2 * BEAT },
    ]);
  });

  it('counts marks that sound together in both hands as one', () => {
    const performance = buildPerformance(bundle, baseline, 'off', 0, 'melody', { ending: 'amen' });
    const start = 3 * MEASURE;
    expect(findFermatas(performance.song, performance.arrangement)).toEqual([
      { start: MEASURE + 2 * BEAT, end: MEASURE + 3 * BEAT, extra: BEAT },
      { start: start + 2 * BEAT, end: start + MEASURE, extra: 2 * BEAT },
      { start: start + MEASURE, end: start + 2 * MEASURE, extra: 2 * BEAT },
    ]);
  });

  it('holds the accompaniment too, which leaves the marked melody to the singers', () => {
    const performance = buildPerformance(bundle, baseline, 'off', 0, 'accompaniment');
    expect(performance.rightHand).toBe('accompaniment');
    expect(performance.song.measures[1].voice?.[2].fermata).toBe(true);
    expect(findFermatas(performance.song, performance.arrangement)).toEqual([
      { start: MEASURE + 2 * BEAT, end: MEASURE + 3 * BEAT, extra: BEAT },
    ]);
  });

  it('is played in the last phrase when that is the introduction', () => {
    const performance = buildPerformance(bundle, baseline, INTRO_LAST_PHRASE, 0);
    expect(performance.introMeasures).toBe(2);
    expect(
      findFermatas(performance.song, performance.arrangement).map((span) => span.start),
    ).toEqual([2 * BEAT, 3 * MEASURE + 2 * BEAT]);
  });

  it('slows the clock down inside the fermata only', () => {
    const fermatas = findFermatas(bundle.song, plain);
    expect(paceAt(fermatas, MEASURE + 2 * BEAT - 1)).toBe(1);
    expect(paceAt(fermatas, MEASURE + 2 * BEAT)).toBe(0.5);
    expect(paceAt(fermatas, MEASURE + 3 * BEAT - 1)).toBe(0.5);
    expect(paceAt(fermatas, MEASURE + 3 * BEAT)).toBe(1);
    // A whole note gets two beats on top: six beats where four are written.
    expect(paceAt(fermatas, 2 * MEASURE)).toBeCloseTo(4 / 6);
    expect(paceAt([], 0)).toBe(1);
  });

  it('adds up to the length of the piece', () => {
    const fermatas = findFermatas(bundle.song, plain);
    expect(elapsedTicks(fermatas, MEASURE)).toBe(MEASURE);
    expect(elapsedTicks(fermatas, MEASURE + 2 * BEAT + BEAT / 2)).toBe(MEASURE + 3 * BEAT);
    expect(elapsedTicks(fermatas, MEASURE + 3 * BEAT)).toBe(MEASURE + 4 * BEAT);
    expect(elapsedTicks(fermatas, 2 * MEASURE)).toBe(2 * MEASURE + BEAT);
    expect(elapsedTicks(fermatas, bundle.song.totalTicks)).toBe(3 * MEASURE + 3 * BEAT);
    expect(elapsedTicks([], 1234)).toBe(1234);
  });
});

/** The tempo marks of the conductor track: tick and microseconds per quarter note. */
function readTempos(bytes: Uint8Array): { tick: number; tempo: number }[] {
  // The conductor track follows the 14 bytes of the header and the 8 bytes that open a chunk.
  const length = new DataView(bytes.buffer, bytes.byteOffset + 18, 4).getUint32(0);
  const data = bytes.slice(22, 22 + length);
  const tempos: { tick: number; tempo: number }[] = [];
  let offset = 0;
  let tick = 0;
  while (offset < data.length) {
    let delta = 0;
    for (;;) {
      const byte = data[offset];
      offset += 1;
      delta = (delta << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    tick += delta;
    const type = data[offset + 1];
    const size = data[offset + 2];
    if (type === 0x51) {
      tempos.push({
        tick,
        tempo: (data[offset + 3] << 16) | (data[offset + 4] << 8) | data[offset + 5],
      });
    }
    offset += 3 + size;
  }
  return tempos;
}

describe('a fermata in a MIDI file', () => {
  const events = buildNoteEvents(bundle.song, plain);

  it('is a slower tempo for the length of its note', () => {
    const file = toMidiFile(bundle.song, events, {
      tempo: 60,
      tracks: ['right', 'left'],
      fermatas: findFermatas(bundle.song, plain),
    });
    expect(readTempos(file)).toEqual([
      { tick: 0, tempo: 1_000_000 },
      { tick: MEASURE + 2 * BEAT, tempo: 2_000_000 },
      { tick: MEASURE + 3 * BEAT, tempo: 1_000_000 },
      { tick: 2 * MEASURE, tempo: 1_500_000 },
      { tick: 3 * MEASURE, tempo: 1_000_000 },
    ]);
  });

  it('leaves a piece without one at a single tempo', () => {
    const file = toMidiFile(bundle.song, events, { tempo: 60, tracks: ['right'] });
    expect(readTempos(file)).toEqual([{ tick: 0, tempo: 1_000_000 }]);
  });
});

describe('a fermata on the staff', () => {
  const performance = buildPerformance(bundle, plain, 'off', 0);
  const { mei } = toMei(performance.song, performance.arrangement, 0, 3, {
    showLyrics: false,
    showDynamics: false,
  });

  it('stands over its note in the right hand and under it in the left', () => {
    const melody = bundle.song.measures[1].slots[2].id;
    const bass = plain.measures[2].slots[0].id;
    expect(mei.match(/<fermata /g)).toHaveLength(2);
    expect(mei).toContain(`<fermata startid="#slot-${melody}" place="above"/>`);
    expect(mei).toContain(`<fermata startid="#slot-${bass}" place="below"/>`);
    expect(mei).toContain(`xml:id="slot-${melody}"`);
    expect(mei).toContain(`xml:id="slot-${bass}"`);
  });

  it('is drawn by the engraver', async () => {
    const toolkit = new VerovioToolkit(await createVerovioModule());
    toolkit.setOptions({ pageWidth: 2000, adjustPageHeight: true, header: 'none', footer: 'none' });
    expect(toolkit.loadData(mei)).toBeTruthy();
    const svg = toolkit.renderToSVG(1);
    expect(svg.match(/class="fermata/g)).toHaveLength(2);
  }, 30000);
});
