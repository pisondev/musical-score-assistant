import { beatTicks } from './time.ts';
import type { Arrangement, Slot, Song } from './types.ts';

/**
 * Fermatas: the places where the music lingers.
 *
 * A fermata is written on one symbol ("^") of any row, but it holds everything
 * that sounds at that moment. So it is not a longer note: the clock of the
 * whole performance runs slower for as long as the marked note lasts, and both
 * hands and the voice stay together. Positions keep being counted in ticks as
 * written; only the time a tick takes changes.
 */

/** A stretch of a performance that a fermata lengthens. */
export interface FermataSpan {
  /** Tick at which the marked note begins, and the tick at which it ends. */
  start: number;
  end: number;
  /** Time the fermata adds to the stretch, in ticks at the tempo of the piece. */
  extra: number;
}

/**
 * A fermata holds its note twice as long. A long note would stand still for
 * too long that way, so it gets at most this many beats on top.
 */
const LONGEST_WAIT_BEATS = 2;

/**
 * Finds the fermatas of a performance, in order. A marked note lasts until the
 * end of its hold dots, across a barline if they go on there. Marks on
 * different rows that sound at the same time are one fermata.
 */
export function findFermatas(song: Song, arrangement: Arrangement): FermataSpan[] {
  const rows: ((index: number) => Slot[] | undefined)[] = [
    (index) => song.measures[index].slots,
    (index) => song.measures[index].voice,
    (index) => song.measures[index].fills,
    (index) => arrangement.measures[index].slots,
  ];

  const marked: { start: number; end: number }[] = [];
  for (const row of rows) {
    let open: { start: number; end: number } | null = null;
    song.measures.forEach((measure, index) => {
      for (const slot of row(index) ?? []) {
        const start = measure.startTick + slot.start;
        if (open && slot.kind === 'hold' && !slot.fermata && start === open.end) {
          open.end += slot.duration;
          continue;
        }
        open = null;
        if (slot.fermata) {
          open = { start, end: start + slot.duration };
          marked.push(open);
        }
      }
    });
  }

  const longest = LONGEST_WAIT_BEATS * beatTicks(song.meta.time);
  const spans: FermataSpan[] = [];
  for (const mark of marked.sort((a, b) => a.start - b.start)) {
    const last = spans[spans.length - 1];
    if (last && mark.start < last.end) last.end = Math.max(last.end, mark.end);
    else spans.push({ ...mark, extra: 0 });
  }
  for (const span of spans) span.extra = Math.min(span.end - span.start, longest);
  return spans;
}

/** How fast the clock runs at a tick, as a share of the tempo: 1, and less inside a fermata. */
export function paceAt(fermatas: readonly FermataSpan[], tick: number): number {
  const span = fermatas.find((candidate) => tick >= candidate.start && tick < candidate.end);
  if (!span) return 1;
  const length = span.end - span.start;
  return length / (length + span.extra);
}

/**
 * How much time has passed when the music reaches a tick, in ticks at the
 * tempo of the piece: the position itself, plus what the fermatas before it
 * have added so far.
 */
export function elapsedTicks(fermatas: readonly FermataSpan[], tick: number): number {
  let elapsed = tick;
  for (const span of fermatas) {
    if (tick <= span.start) break;
    const inside = Math.min(tick, span.end) - span.start;
    elapsed += (span.extra * inside) / (span.end - span.start);
  }
  return elapsed;
}
