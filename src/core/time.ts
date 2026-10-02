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
