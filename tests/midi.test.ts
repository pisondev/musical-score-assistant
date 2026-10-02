import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { exportFileName, toMidiFile, variableLength } from '../src/core/midi';
import { buildPerformance } from '../src/core/performance';
import { buildNoteEvents } from '../src/core/playback';
import type { Hand, NoteEvent } from '../src/core/types';

const bundle = createSongBundle(
  'title: Test Song\nkey: F\ntime: 3/4\ntempo: 90\n| 5, | [F]1 . 3 | [C7]5 . . ||',
  {
    arrangements: [
      {
        id: 'a',
        name: 'A',
        measures: [
          { measure: 0, left: '0' },
          { measure: 1, left: "[F]1 5 1'" },
          { measure: 2, left: '[C7]1 5 7' },
        ],
      },
    ],
  },
);
const performance = buildPerformance(bundle, bundle.arrangements[1], 'off', 0);
const events = buildNoteEvents(performance.song, performance.arrangement);
const write = (hands: Hand[], tempo = 90, notes: NoteEvent[] = events) =>
  toMidiFile(performance.song, notes, { tempo, hands });

/** Minimal reader: splits a file into its chunks. */
function readChunks(bytes: Uint8Array): { id: string; data: Uint8Array }[] {
  const chunks: { id: string; data: Uint8Array }[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0);
    chunks.push({ id, data: bytes.slice(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  return chunks;
}

/** Decodes the channel events of a track into absolute ticks. */
function readNotes(
  data: Uint8Array,
): { tick: number; on: boolean; pitch: number; velocity: number }[] {
  const notes: { tick: number; on: boolean; pitch: number; velocity: number }[] = [];
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
    const status = data[offset];
    if (status === 0xff) {
      offset += 3 + data[offset + 2];
    } else if ((status & 0xf0) === 0xc0) {
      offset += 2;
    } else {
      notes.push({
        tick,
        on: (status & 0xf0) === 0x90,
        pitch: data[offset + 1],
        velocity: data[offset + 2],
      });
      offset += 3;
    }
  }
  return notes;
}

describe('variableLength', () => {
  it('encodes numbers in seven-bit groups', () => {
    expect(variableLength(0)).toEqual([0x00]);
    expect(variableLength(127)).toEqual([0x7f]);
    expect(variableLength(128)).toEqual([0x81, 0x00]);
    expect(variableLength(480)).toEqual([0x83, 0x60]);
    expect(variableLength(16384)).toEqual([0x81, 0x80, 0x00]);
  });
});

describe('toMidiFile', () => {
  const chunks = readChunks(write(['right', 'left']));

  it('writes a format 1 file with a conductor track and one track per hand', () => {
    expect(chunks.map((chunk) => chunk.id)).toEqual(['MThd', 'MTrk', 'MTrk', 'MTrk']);
    // Format 1, three tracks, 480 ticks per quarter note.
    expect([...chunks[0].data]).toEqual([0, 1, 0, 3, 0x01, 0xe0]);
    expect(readChunks(write(['left'])).length).toBe(3);
  });

  it('stores the tempo, the meter, and the key in the conductor track', () => {
    const conductor = [...chunks[1].data];
    const includes = (bytes: number[]) =>
      conductor.some((_, index) => bytes.every((byte, step) => conductor[index + step] === byte));
    // 90 beats per minute is 666667 microseconds per quarter note.
    expect(includes([0xff, 0x51, 0x03, 0x0a, 0x2c, 0x2b])).toBe(true);
    // Three-four time; the denominator is stored as a power of two.
    expect(includes([0xff, 0x58, 0x04, 3, 2, 24, 8])).toBe(true);
    // One flat, major: -1 as a signed byte.
    expect(includes([0xff, 0x59, 0x02, 0xff, 0])).toBe(true);
    expect(conductor.slice(-3)).toEqual([0xff, 0x2f, 0x00]);
  });

  it('follows the tempo that is passed in', () => {
    const conductor = [...readChunks(write(['right'], 120))[1].data];
    // 120 beats per minute is 500000 microseconds per quarter note.
    const position = conductor.findIndex(
      (byte, index) => byte === 0xff && conductor[index + 1] === 0x51,
    );
    expect(conductor.slice(position + 3, position + 6)).toEqual([0x07, 0xa1, 0x20]);
  });

  it('writes every melody note at its tick, with its length', () => {
    const notes = readNotes(chunks[2].data);
    const melody = events.filter((event) => event.hand === 'right');
    expect(notes.filter((note) => note.on).map((note) => [note.tick, note.pitch])).toEqual(
      melody.map((event) => [event.tick, event.midi]),
    );
    expect(notes.filter((note) => !note.on).map((note) => note.tick)).toEqual(
      melody.map((event) => event.tick + event.duration).sort((a, b) => a - b),
    );
    expect(
      notes.filter((note) => note.on).every((note) => note.velocity >= 1 && note.velocity <= 127),
    ).toBe(true);
  });

  it('puts the left hand on its own track', () => {
    const notes = readNotes(chunks[3].data).filter((note) => note.on);
    expect(notes.map((note) => note.pitch)).toEqual(
      events.filter((event) => event.hand === 'left').map((event) => event.midi),
    );
  });

  it('cuts a ringing note when the same key is struck again', () => {
    const overlapping: NoteEvent[] = [
      { hand: 'left', tick: 0, duration: 960, midi: 41, velocity: 0.5, slotId: 'a' },
      { hand: 'left', tick: 480, duration: 480, midi: 41, velocity: 0.5, slotId: 'b' },
    ];
    const notes = readNotes(readChunks(write(['left'], 90, overlapping))[2].data);
    expect(notes.map((note) => [note.tick, note.on])).toEqual([
      [0, true],
      [480, false],
      [480, true],
      [960, false],
    ]);
  });

  it('includes the introduction and the transposition of the performance', () => {
    const moved = buildPerformance(bundle, bundle.arrangements[1], 'last-phrase', 2);
    const file = toMidiFile(moved.song, buildNoteEvents(moved.song, moved.arrangement), {
      tempo: 90,
      hands: ['right'],
    });
    const notes = readNotes(readChunks(file)[2].data).filter((note) => note.on);
    const plain = readNotes(chunks[2].data).filter((note) => note.on);
    expect(notes.length).toBeGreaterThan(plain.length);
    // The song itself follows the introduction, two semitones higher.
    expect(notes.slice(-plain.length).map((note) => note.pitch)).toEqual(
      plain.map((note) => note.pitch + 2),
    );
  });
});

describe('exportFileName', () => {
  it('names the song, the arrangement, and the key, without characters a file system rejects', () => {
    expect(exportFileName('Amazing Grace', 'Gospel waltz', 'Bb', 'mid')).toBe(
      'Amazing Grace - Gospel waltz (1 = Bb).mid',
    );
    expect(exportFileName('What? A "Song"/Two', 'A: B', 'F#', 'mp3')).toBe(
      'What A SongTwo - A B (1 = F#).mp3',
    );
  });
});

describe('toInt16', () => {
  it('scales samples to 16 bits and clips what is out of range', async () => {
    const { toInt16 } = await import('../src/audio/mp3');
    expect([...toInt16(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]))]).toEqual([
      0, 16384, -16384, 32767, -32768, 32767, -32768,
    ]);
  });
});

describe('normalizationGain', () => {
  it('raises the loudest sample to just below full scale, within limits', async () => {
    const { normalizationGain, toInt16 } = await import('../src/audio/mp3');
    expect(normalizationGain(0.18)).toBeCloseTo(5, 5);
    expect(normalizationGain(0.9)).toBeCloseTo(1, 5);
    // Silence is left alone, and a faint recording is not boosted without limit.
    expect(normalizationGain(0)).toBe(1);
    expect(normalizationGain(0.001)).toBe(12);
    expect([...toInt16(new Float32Array([0.1, -0.1]), 5)]).toEqual([16384, -16384]);
  });
});
