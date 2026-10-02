import { chordTimeline } from './arrangement';
import { DynamicsTimeline } from './dynamics';
import { beatTicks } from './time';
import type { Arrangement, NoteEvent, Slot, SlotSpan, Song, Track } from './types';

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
      for (const pitch of slot.pitches) {
        const event: NoteEvent = {
          track,
          tick: measure.startTick + slot.start,
          duration: slot.duration,
          midi: pitch.midi,
          velocity,
          slotId: slot.id,
        };
        events.push(event);
        sounding.push(event);
      }
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
 * The notes exactly as written: hold dots extend them, but no pedal and no
 * dynamics are applied. The sung melody, when the song carries one beside the
 * right hand, becomes the track "voice".
 */
export function buildWrittenNotes(song: Song, arrangement: Arrangement): NoteEvent[] {
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

  return [
    ...rows('right', (index) => song.measures[index].slots),
    ...rows('right', (index) => song.measures[index].fills ?? [], FILL_VELOCITY),
    ...rows('left', (index) => arrangement.measures[index].slots),
    ...rows('voice', (index) => song.measures[index].voice ?? []),
  ];
}

/** Builds every sounding note of the song with the given left-hand arrangement. */
export function buildNoteEvents(song: Song, arrangement: Arrangement): NoteEvent[] {
  const events = buildWrittenNotes(song, arrangement);
  sustainLeftHand(
    events.filter((event) => event.track === 'left'),
    song,
    arrangement,
  );

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
