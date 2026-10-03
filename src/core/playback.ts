import { chordTimeline } from './arrangement.ts';
import { chordPitchClasses } from './chord.ts';
import { DynamicsTimeline } from './dynamics.ts';
import { mod } from './notes.ts';
import { beatTicks, measureTicks } from './time.ts';
import type { Arrangement, NoteEvent, Slot, SlotSpan, Song, Track } from './types.ts';

interface StaffMeasure {
  startTick: number;
  length: number;
  slots: Slot[];
}

/**
 * Velocities at mezzo-forte, where 1 is the highest MIDI velocity; the
 * dynamics of the song scale them up or down. Loudness follows the square of
 * the velocity (see `velocityToGain`), so the left hand at 0.51 sounds a good
 * three decibels under a melody at 0.62. The melody leaves room above itself:
 * at fortissimo its downbeats come to just under 1.
 */
const VELOCITY: Record<Track, { downbeat: number; beat: number; offbeat: number }> = {
  right: { downbeat: 0.62, beat: 0.59, offbeat: 0.56 },
  left: { downbeat: 0.51, beat: 0.48, offbeat: 0.46 },
  voice: { downbeat: 0.58, beat: 0.57, offbeat: 0.55 },
};

/** Fills are played a little under the melody they decorate. */
const FILL_VELOCITY = { downbeat: 0.57, beat: 0.55, offbeat: 0.53 };

/**
 * The notes under the top note of a right-hand chord are played a little
 * softer, so the melody stays in front of the chord that carries it.
 */
const UNDER_THE_TOP = 0.88;

/**
 * Time between two notes of a rolled chord, in ticks: about thirty
 * milliseconds at a moderate tempo, and quicker when the music is.
 */
const ROLL_STEP = 16;

const MIN_VELOCITY = 0.08;
const MAX_VELOCITY = 1;

/** Turns the written slots of one track into sounding notes; hold dots extend them. */
function eventsForTrack(
  track: Track,
  measures: StaffMeasure[],
  beat: number,
  levels = VELOCITY[track],
): NoteEvent[] {
  const events: NoteEvent[] = [];
  let sounding: NoteEvent[] = [];

  for (const measure of measures) {
    for (const slot of measure.slots) {
      if (slot.kind === 'hold') {
        for (const event of sounding) event.duration += slot.duration;
        continue;
      }
      sounding = [];
      if (slot.kind === 'rest') continue;

      const velocity =
        slot.start === 0 ? levels.downbeat : slot.start % beat === 0 ? levels.beat : levels.offbeat;
      slot.pitches.forEach((pitch, position) => {
        const under = track === 'right' && position < slot.pitches.length - 1;
        const event: NoteEvent = {
          track,
          tick: measure.startTick + slot.start,
          duration: slot.duration,
          midi: pitch.midi,
          velocity: under ? velocity * UNDER_THE_TOP : velocity,
          slotId: slot.id,
        };
        events.push(event);
        sounding.push(event);
      });
    }
  }
  return events;
}

/**
 * Lets left-hand notes ring until the harmony changes or the measure ends,
 * the way a sustain pedal changed on every chord would.
 */
function sustainLeftHand(events: NoteEvent[], song: Song, arrangement: Arrangement): void {
  const changes = chordTimeline(
    song.measures.map((measure, index) => ({
      startTick: measure.startTick,
      chords: arrangement.measures[index].chords,
    })),
  ).map((entry) => entry.tick);

  for (const event of events) {
    const measure = song.measures.find(
      (candidate) =>
        event.tick >= candidate.startTick && event.tick < candidate.startTick + candidate.length,
    );
    if (!measure) continue;
    const measureEnd = measure.startTick + measure.length;
    const nextChange = changes.find((tick) => tick > event.tick) ?? Infinity;
    const release = Math.min(measureEnd, nextChange);
    event.duration = Math.max(event.duration, release - event.tick);
  }
}

/**
 * Lets the notes a fill adds ring on until the right hand plays again, the
 * way a pianist keeps them under the fingers or the pedal instead of letting
 * a run stop dead before the melody returns. A note is let go earlier when
 * the harmony moves to a chord it does not belong to, and it never rings for
 * more than a measure beyond its written length.
 */
function sustainFills(
  fills: NoteEvent[],
  rightHand: NoteEvent[],
  song: Song,
  arrangement: Arrangement,
): void {
  if (fills.length === 0) return;
  const onsets = [...new Set(rightHand.map((event) => event.tick))].sort((a, b) => a - b);
  const harmony = chordTimeline(
    song.measures.map((measure, index) => ({
      startTick: measure.startTick,
      chords: arrangement.measures[index].chords,
    })),
  );
  const longest = measureTicks(song.meta.time);

  for (const event of fills) {
    const end = event.tick + event.duration;
    const next = onsets.find((tick) => tick >= end) ?? song.totalTicks;
    if (next <= end) continue;
    let release = Math.min(next, end + longest, song.totalTicks);
    for (const change of harmony) {
      if (change.tick < end) continue;
      if (change.tick >= release) break;
      const belongs =
        change.chord !== null && chordPitchClasses(change.chord).includes(mod(event.midi, 12));
      if (!belongs) {
        release = change.tick;
        break;
      }
    }
    event.duration = Math.max(event.duration, release - event.tick);
  }
}

/**
 * Spreads the notes of rolled chords in time, from the lowest to the highest.
 * In the left hand the bass keeps the beat and the other notes follow it. In
 * the right hand the roll leads up to the beat, so the top note, which is the
 * melody, arrives on time.
 */
function rollChords(events: NoteEvent[], song: Song, arrangement: Arrangement): void {
  const rolled = new Set<string>();
  const collect = (slots: Slot[] | undefined) => {
    for (const slot of slots ?? []) if (slot.rolled && slot.pitches.length > 1) rolled.add(slot.id);
  };
  song.measures.forEach((measure, index) => {
    collect(measure.slots);
    collect(measure.fills);
    collect(measure.voice);
    collect(arrangement.measures[index].slots);
  });
  if (rolled.size === 0) return;

  const chords = new Map<string, NoteEvent[]>();
  for (const event of events) {
    if (!rolled.has(event.slotId)) continue;
    const chord = chords.get(event.slotId);
    if (chord) chord.push(event);
    else chords.set(event.slotId, [event]);
  }
  for (const chord of chords.values()) {
    chord.sort((a, b) => a.midi - b.midi);
    const last = chord.length - 1;
    chord.forEach((event, position) => {
      // A short chord is rolled more tightly, so the roll never eats into the note itself.
      const step = Math.min(ROLL_STEP, Math.floor(event.duration / (3 * last)));
      const shift = event.track === 'left' ? step * position : -step * (last - position);
      const tick = Math.max(0, event.tick + shift);
      event.duration -= tick - event.tick;
      event.tick = tick;
    });
  }
}

/** The written notes of a performance, row by row. */
function writtenRows(
  song: Song,
  arrangement: Arrangement,
): { melody: NoteEvent[]; fills: NoteEvent[]; left: NoteEvent[]; voice: NoteEvent[] } {
  const beat = beatTicks(song.meta.time);
  const rows = (track: Track, slotsOf: (index: number) => Slot[], levels = VELOCITY[track]) =>
    eventsForTrack(
      track,
      song.measures.map((measure, index) => ({
        startTick: measure.startTick,
        length: measure.length,
        slots: slotsOf(index),
      })),
      beat,
      levels,
    );

  return {
    melody: rows('right', (index) => song.measures[index].slots),
    fills: rows('right', (index) => song.measures[index].fills ?? [], FILL_VELOCITY),
    left: rows('left', (index) => arrangement.measures[index].slots),
    voice: rows('voice', (index) => song.measures[index].voice ?? []),
  };
}

/**
 * The notes exactly as written: hold dots extend them, but no pedal, no
 * rolled chords, and no dynamics are applied. The sung melody, when the song carries one beside the
 * right hand, becomes the track "voice".
 */
export function buildWrittenNotes(song: Song, arrangement: Arrangement): NoteEvent[] {
  const { melody, fills, left, voice } = writtenRows(song, arrangement);
  return [...melody, ...fills, ...left, ...voice];
}

/** Builds every sounding note of the song with the given left-hand arrangement. */
export function buildNoteEvents(song: Song, arrangement: Arrangement): NoteEvent[] {
  const { melody, fills, left, voice } = writtenRows(song, arrangement);
  sustainLeftHand(left, song, arrangement);
  sustainFills(fills, [...melody, ...fills], song, arrangement);
  const events = [...melody, ...fills, ...left, ...voice];
  rollChords(events, song, arrangement);

  const dynamics = new DynamicsTimeline(song.measures);
  for (const event of events) {
    const scaled = event.velocity * dynamics.velocityFactorAt(event.tick);
    event.velocity = Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, scaled));
  }
  return events.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
}

/** Lists the time span of every written slot so the sheet can follow the playhead. */
export function buildSlotSpans(song: Song, arrangement: Arrangement): SlotSpan[] {
  const spans: SlotSpan[] = [];
  song.measures.forEach((measure, index) => {
    const rows: [Track, Slot[]][] = [
      ['right', measure.slots],
      ['right', measure.fills ?? []],
      ['left', arrangement.measures[index].slots],
      ['voice', measure.voice ?? []],
    ];
    for (const [track, slots] of rows) {
      for (const slot of slots) {
        const start = measure.startTick + slot.start;
        spans.push({ id: slot.id, track, start, end: start + slot.duration });
      }
    }
  });
  return spans.sort((a, b) => a.start - b.start);
}

/** Returns the index of the measure that contains a tick, clamped to the song. */
export function measureIndexAt(song: Song, tick: number): number {
  for (let index = song.measures.length - 1; index >= 0; index -= 1) {
    if (tick >= song.measures[index].startTick) return index;
  }
  return 0;
}
