import type { MeasureNote } from '../core';
import { RIGHT_HAND_NAME } from './right-hand-name';

/** What a note was written about, in a line: "Gospel walk-ups · Melody + fills · 3 Oct 2026". */
export function noteByline(note: MeasureNote): string {
  const date = new Date(note.updatedAt || note.createdAt);
  const day = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const hand = RIGHT_HAND_NAME[note.context.rightHand];
  return [note.context.leftHandName, note.context.chords ? `${hand} with chords` : hand, day]
    .filter(Boolean)
    .join(' · ');
}
