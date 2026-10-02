import { describe, expect, it } from 'vitest';
import { buildBaseline } from '../src/core/arrangement';
import { parseSong } from '../src/core/song';
import { layOutSystems, measureWeights } from '../src/ui/sheet-layout';

const song = parseSong(`
key: C
time: 4/4
| 5, | [C]1 2 3 4 | [C](1 2) (3 4) 5 . | [G]((1 2) (3 4)) 5 [C]5 . | [C]1 . ||
`);

describe('measureWeights', () => {
  const weights = measureWeights(song, [buildBaseline(song)]);

  it('weighs a plain beat as one unit', () => {
    expect(weights[0]).toBe(1);
    expect(weights[1]).toBe(4);
  });

  it('gives subdivided beats more room', () => {
    expect(weights[2]).toBe(1.5 + 1.5 + 1 + 1);
    expect(weights[3]).toBe(3 + 1 + 1 + 1);
  });

  it('accounts for the left hand of every arrangement', () => {
    const busyLeft = buildBaseline(song);
    busyLeft.measures[1].slots = Array.from({ length: 8 }, (_, index) => ({
      id: `l1-${index}`,
      kind: 'rest' as const,
      start: index * 240,
      duration: 240,
      pitches: [],
      beat: Math.floor(index / 2),
      beams: 1,
    }));
    expect(measureWeights(song, [buildBaseline(song), busyLeft])[1]).toBe(6);
  });
});

describe('layOutSystems', () => {
  const isPickup = (index: number) => index === 0;

  it('keeps the pickup with the first system without counting it', () => {
    const systems = layOutSystems([1, 4, 4, 4, 4, 4, 2], isPickup, 100, 4);
    expect(systems.map((system) => system.measures)).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6],
    ]);
  });

  it('wraps when the weight capacity is reached', () => {
    const systems = layOutSystems([1, 4, 6, 4, 4], isPickup, 10, 4);
    expect(systems.map((system) => system.measures)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
  });

  it('never leaves a system empty, even when one measure exceeds the capacity', () => {
    const systems = layOutSystems([8, 8], () => false, 5, 4);
    expect(systems.map((system) => system.measures)).toEqual([[0], [1]]);
  });

  it('pads the last system so its measures keep their width', () => {
    const systems = layOutSystems([4, 4, 4, 4, 4], () => false, 100, 4);
    expect(systems.map((system) => system.filler)).toEqual([0, 12]);
  });
});
