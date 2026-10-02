import type { DynamicLevel, DynamicMark } from './types';

/** Loudness of each dynamic level, as a factor applied to note velocities. */
const LEVEL_GAIN: Record<DynamicLevel, number> = {
  pp: 0.42,
  p: 0.55,
  mp: 0.68,
  mf: 0.82,
  f: 1.0,
  ff: 1.18,
};

const LEVEL_ORDER: DynamicLevel[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
const DEFAULT_LEVEL: DynamicLevel = 'mf';

interface TimedMark {
  tick: number;
  sign: DynamicMark['sign'];
}

/** The stretch a hairpin covers: from where it opens to the next dynamic mark. */
export interface Hairpin {
  kind: 'crescendo' | 'diminuendo';
  start: number;
  end: number;
}

function isLevel(sign: DynamicMark['sign']): sign is DynamicLevel {
  return sign !== '<' && sign !== '>';
}

/** One level louder or softer, for a hairpin that no level mark closes. */
function neighbour(level: DynamicLevel, direction: 1 | -1): DynamicLevel {
  const index = LEVEL_ORDER.indexOf(level) + direction;
  return LEVEL_ORDER[Math.min(LEVEL_ORDER.length - 1, Math.max(0, index))];
}

/**
 * The dynamics of a whole piece on one absolute timeline. Level marks set the
 * loudness; a hairpin glides from the level in force to the next level mark.
 */
export class DynamicsTimeline {
  /** Written marks plus an implied level wherever a hairpin is left open. */
  private readonly marks: TimedMark[] = [];
  private readonly spans: Hairpin[] = [];

  constructor(
    measures: ReadonlyArray<{ startTick: number; length: number; dynamics: DynamicMark[] }>,
  ) {
    const written: TimedMark[] = measures
      .flatMap((measure) =>
        measure.dynamics.map((mark) => ({ tick: measure.startTick + mark.start, sign: mark.sign })),
      )
      .sort((a, b) => a.tick - b.tick);
    const last = measures[measures.length - 1];
    const totalTicks = last ? last.startTick + last.length : 0;

    let level = DEFAULT_LEVEL;
    written.forEach((mark, index) => {
      this.marks.push(mark);
      if (isLevel(mark.sign)) {
        level = mark.sign;
        return;
      }
      const next = written[index + 1];
      const end = next ? next.tick : totalTicks;
      this.spans.push({
        kind: mark.sign === '<' ? 'crescendo' : 'diminuendo',
        start: mark.tick,
        end,
      });
      if (!next || !isLevel(next.sign)) {
        level = neighbour(level, mark.sign === '<' ? 1 : -1);
        this.marks.push({ tick: end, sign: level });
      }
    });
  }

  /** Every hairpin with the tick range it spans. */
  hairpins(): Hairpin[] {
    return this.spans;
  }

  /** Velocity factor in force at a tick. */
  gainAt(tick: number): number {
    let level = DEFAULT_LEVEL;
    let hairpin: TimedMark | null = null;

    for (const mark of this.marks) {
      if (mark.tick > tick) {
        if (!hairpin || !isLevel(mark.sign)) break;
        // The first level mark after an open hairpin is where the hairpin lands.
        const from = LEVEL_GAIN[level];
        const to = LEVEL_GAIN[mark.sign];
        const span = mark.tick - hairpin.tick;
        return span > 0 ? from + ((to - from) * (tick - hairpin.tick)) / span : to;
      }
      if (isLevel(mark.sign)) {
        level = mark.sign;
        hairpin = null;
      } else {
        hairpin = mark;
      }
    }
    return LEVEL_GAIN[level];
  }
}
