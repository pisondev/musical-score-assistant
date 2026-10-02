import { chordTimeline } from './arrangement';
import { DynamicsTimeline } from './dynamics';
import { beatTicks } from './time';
import type { Arrangement, Hand, NoteEvent, Slot, SlotSpan, Song } from './types';

interface StaffMeasure {
  startTick: number;
  length: number;
  slots: Slot[];
}

/** Velocities at mezzo-forte; the dynamics of the song scale them up or down. */
const VELOCITY: Record<Hand, { downbeat: number; beat: number; offbeat: number }> = {
  right: { downbeat: 0.7, beat: 0.64, offbeat: 0.58 },
  left: { downbeat: 0.48, beat: 0.42, offbeat: 0.38 },
};

const MEZZO_FORTE_GAIN = 0.82;
const MIN_VELOCITY = 0.08;
const MAX_VELOCITY = 1;

/** Turns the written slots of one hand into sounding notes; hold dots extend them. */
function eventsForHand(hand: Hand, measures: StaffMeasure[], beat: number): NoteEvent[] {
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

      const levels = VELOCITY[hand];
      const velocity =
        slot.start === 0 ? levels.downbeat : slot.start % beat === 0 ? levels.beat : levels.offbeat;
      for (const pitch of slot.pitches) {
        const event: NoteEvent = {
          hand,
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

/** Builds every sounding note of the song with the given left-hand arrangement. */
export function buildNoteEvents(song: Song, arrangement: Arrangement): NoteEvent[] {
  const beat = beatTicks(song.meta.time);
  const right = eventsForHand('right', song.measures, beat);
  const left = eventsForHand(
    'left',
    song.measures.map((measure, index) => ({
      startTick: measure.startTick,
      length: measure.length,
      slots: arrangement.measures[index].slots,
    })),
    beat,
  );
  sustainLeftHand(left, song, arrangement);

  const dynamics = new DynamicsTimeline(song.measures);
  const events = [...right, ...left];
  for (const event of events) {
    const scaled = (event.velocity * dynamics.gainAt(event.tick)) / MEZZO_FORTE_GAIN;
    event.velocity = Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, scaled));
  }
  return events.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
}

/** Lists the time span of every written slot so the sheet can follow the playhead. */
export function buildSlotSpans(song: Song, arrangement: Arrangement): SlotSpan[] {
  const spans: SlotSpan[] = [];
  song.measures.forEach((measure, index) => {
    const rows: [Hand, Slot[]][] = [
      ['right', measure.slots],
      ['left', arrangement.measures[index].slots],
    ];
    for (const [hand, slots] of rows) {
      for (const slot of slots) {
        const start = measure.startTick + slot.start;
        spans.push({ id: slot.id, hand, start, end: start + slot.duration });
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
