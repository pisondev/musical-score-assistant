import type { Slot } from '../core';

/** Share of a beat's width that each extra symbol inside the beat adds. */
const SYMBOL_WEIGHT = 0.75;

export interface SystemLayout {
  /** Zero-based indexes of the measures on this system. */
  measures: number[];
  /** Empty width, in weight units, that keeps a short last system from stretching. */
  filler: number;
}

function symbolsPerBeat(slots: Slot[], beats: number): number[] {
  const counts = new Array<number>(beats).fill(0);
  for (const slot of slots) {
    if (slot.beat < beats) counts[slot.beat] += 1;
  }
  return counts;
}

/**
 * Relative width of one measure. A plain beat weighs 1; a beat that is
 * subdivided weighs more, so busy measures get the room their symbols need.
 * `rows` holds the slots of every staff row that may be shown in the measure:
 * passing the left hand of every arrangement keeps the layout still when the
 * player switches between them.
 */
export function measureWeight(length: number, beat: number, rows: Slot[][]): number {
  const beats = Math.max(1, Math.ceil(length / beat));
  const counts = rows.map((slots) => symbolsPerBeat(slots, beats));
  let weight = 0;
  for (let position = 0; position < beats; position += 1) {
    const busiest = Math.max(0, ...counts.map((row) => row[position]));
    weight += Math.max(1, busiest * SYMBOL_WEIGHT);
  }
  return weight;
}

/**
 * Breaks a run of measures into systems. `indexes` lists the measures in
 * order and `weights` is addressed by those indexes. A system takes measures
 * until its weight capacity or the measure limit is reached; a pickup measure
 * rides along with the first system without counting towards either.
 */
export function layOutSystems(
  indexes: number[],
  weights: number[],
  isPickup: (index: number) => boolean,
  capacity: number,
  maxMeasures: number,
): SystemLayout[] {
  const systems: { measures: number[]; weight: number }[] = [];
  let measures: number[] = [];
  let weight = 0;
  let counted = 0;

  for (const index of indexes) {
    const pickup = isPickup(index);
    const full = counted >= maxMeasures || (counted > 0 && weight + weights[index] > capacity);
    if (!pickup && full) {
      systems.push({ measures, weight });
      measures = [];
      weight = 0;
      counted = 0;
    }
    measures.push(index);
    if (!pickup) {
      weight += weights[index];
      counted += 1;
    }
  }
  if (measures.length > 0) systems.push({ measures, weight });

  const widest = Math.max(0, ...systems.map((system) => system.weight));
  return systems.map((system, position) => ({
    measures: system.measures,
    filler: position === systems.length - 1 ? Math.max(0, widest - system.weight) : 0,
  }));
}
