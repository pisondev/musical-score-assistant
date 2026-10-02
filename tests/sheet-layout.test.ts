import { describe, expect, it } from 'vitest';
import { parseSong } from '../src/core/song';
import type { Slot } from '../src/core/types';
import { layOutSystems, measureWeight } from '../src/ui/sheet-layout';

const BEAT = 480;

const song = parseSong(`
key: C
time: 4/4
| 5, | [C]1 2 3 4 | [C](1 2) (3 4) 5 . | [G]((1 2) (3 4)) 5 [C]5 . | [C]1 . ||
`);

const weightOf = (index: number, extraRows: Slot[][] = []) =>
  measureWeight(song.measures[index].length, BEAT, [song.measures[index].slots, ...extraRows]);

describe('measureWeight', () => {
  it('weighs a plain beat as one unit', () => {
    expect(weightOf(0)).toBe(1);
    expect(weightOf(1)).toBe(4);
  });

  it('gives subdivided beats more room', () => {
    expect(weightOf(2)).toBe(1.5 + 1.5 + 1 + 1);
    expect(weightOf(3)).toBe(3 + 1 + 1 + 1);
  });

  it('accounts for every row that may be shown', () => {
    const busyLeft: Slot[] = Array.from({ length: 8 }, (_, index) => ({
      id: `l1-${index}`,
      kind: 'rest' as const,
      start: index * 240,
      duration: 240,
      pitches: [],
      beat: Math.floor(index / 2),
      beams: 1,
    }));
    expect(weightOf(1, [busyLeft])).toBe(6);
  });
});

describe('layOutSystems', () => {
  const range = (count: number) => Array.from({ length: count }, (_, index) => index);
  const isPickup = (index: number) => index === 0;

  it('keeps the pickup with the first system without counting it', () => {
    const systems = layOutSystems(range(7), [1, 4, 4, 4, 4, 4, 2], isPickup, 100, 4);
    expect(systems.map((system) => system.measures)).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6],
    ]);
  });

  it('wraps when the weight capacity is reached', () => {
    const systems = layOutSystems(range(5), [1, 4, 6, 4, 4], isPickup, 10, 4);
    expect(systems.map((system) => system.measures)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
  });

  it('never leaves a system empty, even when one measure exceeds the capacity', () => {
    const systems = layOutSystems(range(2), [8, 8], () => false, 5, 4);
    expect(systems.map((system) => system.measures)).toEqual([[0], [1]]);
  });

  it('pads the last system so its measures keep their width', () => {
    const systems = layOutSystems(range(5), [4, 4, 4, 4, 4], () => false, 100, 4);
    expect(systems.map((system) => system.filler)).toEqual([0, 12]);
  });

  it('lays out a sub-range of measures, addressing weights by measure index', () => {
    const systems = layOutSystems([4, 5, 6], [9, 9, 9, 9, 2, 2, 2], () => false, 100, 2);
    expect(systems.map((system) => system.measures)).toEqual([[4, 5], [6]]);
    expect(systems[1].filler).toBe(2);
  });
});
