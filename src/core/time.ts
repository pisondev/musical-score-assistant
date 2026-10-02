import type { TimeSignature } from './types';

/** Ticks per quarter note. 480 keeps triplets and sixteenths on whole ticks. */
export const PPQ = 480;

/** Length of one beat of the time signature, in ticks. */
export function beatTicks(time: TimeSignature): number {
  return (PPQ * 4) / time.unit;
}

/** Length of one full measure, in ticks. */
export function measureTicks(time: TimeSignature): number {
  return time.beats * beatTicks(time);
}

/** Converts a tempo counted in beats of the time signature to quarter notes per minute. */
export function quarterNotesPerMinute(tempo: number, time: TimeSignature): number {
  return (tempo * 4) / time.unit;
}

/**
 * Empty beats between two rounds of a loop, so that the player can breathe
 * and find the start again: two in a meter counted in twos or fours, three in
 * a meter counted in threes (three-four, six-eight).
 */
export function loopRestBeats(time: TimeSignature): number {
  return time.beats % 3 === 0 ? 3 : 2;
}

/** How long a number of ticks lasts at a tempo counted in beats of the time signature, in seconds. */
export function ticksToSeconds(ticks: number, tempo: number, time: TimeSignature): number {
  return (ticks / PPQ) * (60 / quarterNotesPerMinute(tempo, time));
}
