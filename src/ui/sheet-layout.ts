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

/** A piece of text on the sheet, such as a syllable or a chord symbol. */
export interface Label {
  /** Where the label begins, in ticks from the start of the measure. */
  start: number;
  /** Width of the text, in pixels. */
  width: number;
}

/**
 * Width, in pixels, that a row of labels needs so that none runs into the
 * next. A label sits where its note or chord begins, and positions follow
 * time, so two labels can only be pulled apart by widening the whole measure:
 * a long syllable on an eighth note asks for more room than the notes do.
 * The last label may run past the barline, where the margins leave room.
 */
export function labelRowWidth(length: number, labels: Label[], gap: number): number {
  const row = [...labels].sort((first, second) => first.start - second.start);
  let width = 0;
  for (let index = 0; index + 1 < row.length; index += 1) {
    const distance = row[index + 1].start - row[index].start;
    if (distance <= 0) continue;
    width = Math.max(width, ((row[index].width + gap) * length) / distance);
  }
  return width;
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

/**
 * How wide a run of `count` measures in a row typically is, in weight units: the given
 * percentile of the sums of every such run. A line has to hold runs like this one for the
 * score to show `count` measures on most lines.
 */
export function typicalRun(weights: number[], count: number, percentile = 0.8): number {
  if (weights.length === 0) return 0;
  const runs: number[] = [];
  for (let start = 0; start + count <= weights.length; start += 1) {
    runs.push(weights.slice(start, start + count).reduce((sum, weight) => sum + weight, 0));
  }
  if (runs.length === 0) return weights.reduce((sum, weight) => sum + weight, 0);
  runs.sort((a, b) => a - b);
  return runs[Math.min(runs.length - 1, Math.floor(percentile * runs.length))];
}

/**
 * The scale at which a run of measures `runWeight` units wide fits across `width` pixels,
 * never larger than the full size and never smaller than `minimum`. Phones use it to show a
 * few measures per line instead of one big one.
 */
export function fitScale(
  width: number,
  runWeight: number,
  unitWidth: number,
  labelWidth: number,
  minimum = 0.4,
): number {
  if (width <= 0 || runWeight <= 0) return 1;
  return Math.max(minimum, Math.min(1, width / (runWeight * unitWidth + labelWidth)));
}
