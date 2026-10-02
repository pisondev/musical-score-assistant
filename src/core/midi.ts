import { keySignatureFifths } from './staff';
import { PPQ, quarterNotesPerMinute } from './time';
import type { Hand, NoteEvent, Song } from './types';

/**
 * Writes a performance as a Standard MIDI File (format 1): a conductor track
 * with tempo, time signature, and key, then one track per hand. The file uses
 * the same 480 ticks per quarter note as the rest of the engine, so every
 * note lands exactly where it is played in the app.
 */

export interface MidiOptions {
  /** Beats per minute, counted in beats of the song's time signature. */
  tempo: number;
  /** Hands to include; each becomes a track of its own. */
  hands: Hand[];
}

const CHANNEL: Record<Hand, number> = { right: 0, left: 1 };
const TRACK_NAME: Record<Hand, string> = { right: 'Right hand', left: 'Left hand' };
const ACOUSTIC_GRAND_PIANO = 0;

interface TimedBytes {
  tick: number;
  /** Events at the same tick are written in this order: note-offs before note-ons. */
  order: number;
  bytes: number[];
}

/** Encodes a number as a MIDI variable-length quantity. */
export function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

function textBytes(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

function metaEvent(type: number, data: number[]): number[] {
  return [0xff, type, ...variableLength(data.length), ...data];
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(id: string, data: number[]): number[] {
  return [...textBytes(id), ...uint32(data.length), ...data];
}

/** Turns timed events into a track chunk with delta times and an end-of-track marker. */
function track(events: TimedBytes[], endTick: number): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data: number[] = [];
  let position = 0;
  for (const event of sorted) {
    data.push(...variableLength(event.tick - position), ...event.bytes);
    position = event.tick;
  }
  data.push(...variableLength(Math.max(0, endTick - position)), 0xff, 0x2f, 0x00);
  return chunk('MTrk', data);
}

/**
 * Notes of one hand as note-on and note-off events. When a pitch is struck
 * again while it still rings, the earlier note is cut at that point; MIDI
 * cannot hold the same key twice on one channel.
 */
function noteEvents(events: NoteEvent[], hand: Hand): TimedBytes[] {
  const channel = CHANNEL[hand];
  const notes = events
    .filter((event) => event.hand === hand)
    .map((event) => ({ ...event, end: event.tick + event.duration }))
    .sort((a, b) => a.tick - b.tick);

  const ringing = new Map<number, (typeof notes)[number]>();
  for (const note of notes) {
    const earlier = ringing.get(note.midi);
    if (earlier && earlier.end > note.tick) earlier.end = note.tick;
    ringing.set(note.midi, note);
  }

  const result: TimedBytes[] = [];
  for (const note of notes) {
    if (note.end <= note.tick) continue;
    const velocity = Math.min(127, Math.max(1, Math.round(note.velocity * 127)));
    result.push({ tick: note.tick, order: 1, bytes: [0x90 | channel, note.midi, velocity] });
    result.push({ tick: note.end, order: 0, bytes: [0x80 | channel, note.midi, 0] });
  }
  return result;
}

/** Builds the bytes of a MIDI file for a song and the notes of a performance. */
export function toMidiFile(song: Song, events: NoteEvent[], options: MidiOptions): Uint8Array {
  const { time, key, title } = song.meta;
  const microsecondsPerQuarter = Math.round(
    60_000_000 / quarterNotesPerMinute(options.tempo, time),
  );
  const endTick = Math.max(song.totalTicks, ...events.map((event) => event.tick + event.duration));

  const conductor: TimedBytes[] = [
    { tick: 0, order: 0, bytes: metaEvent(0x03, textBytes(title)) },
    {
      tick: 0,
      order: 0,
      bytes: metaEvent(0x58, [time.beats, Math.round(Math.log2(time.unit)), 24, 8]),
    },
    // Key signature: sharps or flats as a signed byte, then 0 for major.
    { tick: 0, order: 0, bytes: metaEvent(0x59, [keySignatureFifths(key) & 0xff, 0]) },
    {
      tick: 0,
      order: 0,
      bytes: metaEvent(0x51, [
        (microsecondsPerQuarter >> 16) & 0xff,
        (microsecondsPerQuarter >> 8) & 0xff,
        microsecondsPerQuarter & 0xff,
      ]),
    },
  ];

  const tracks = [track(conductor, endTick)];
  for (const hand of options.hands) {
    const channel = CHANNEL[hand];
    tracks.push(
      track(
        [
          { tick: 0, order: 0, bytes: metaEvent(0x03, textBytes(TRACK_NAME[hand])) },
          { tick: 0, order: 0, bytes: [0xc0 | channel, ACOUSTIC_GRAND_PIANO] },
          ...noteEvents(events, hand),
        ],
        endTick,
      ),
    );
  }

  const header = chunk('MThd', [0, 1, 0, tracks.length, (PPQ >> 8) & 0xff, PPQ & 0xff]);
  return new Uint8Array([...header, ...tracks.flat()]);
}

/**
 * A file name for a download that names the song, the arrangement, and the
 * key, without the characters a file system rejects.
 */
export function exportFileName(
  title: string,
  arrangementName: string,
  keyName: string,
  extension: string,
): string {
  const plain = `${title} - ${arrangementName} (1 = ${keyName})`
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${plain}.${extension}`;
}
