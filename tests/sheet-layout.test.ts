import { describe, expect, it } from 'vitest';
import { parseSong } from '../src/core/song';
import type { Slot } from '../src/core/types';
import {
  fitScale,
  labelRowWidth,
  layOutSystems,
  measureWeight,
  typicalRun,
} from '../src/ui/sheet-layout';
import { canZoomIn, canZoomOut, ZOOM_STEPS, zoomIn, zoomOut } from '../src/ui/zoom';

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

describe('labelRowWidth', () => {
  const MEASURE = 4 * BEAT;

  it('asks for nothing when no label has a neighbour', () => {
    expect(labelRowWidth(MEASURE, [], 2)).toBe(0);
    expect(labelRowWidth(MEASURE, [{ start: 0, width: 80 }], 2)).toBe(0);
  });

  it('scales the room a label needs by how soon the next one follows', () => {
    // A label of 20 pixels with a beat to itself needs a quarter of the measure to be 22 pixels.
    const beats = [0, 1, 2, 3].map((beat) => ({ start: beat * BEAT, width: 20 }));
    expect(labelRowWidth(MEASURE, beats, 2)).toBe(88);
    // The same label followed half a beat later needs twice the width.
    const eighths = [
      { start: 0, width: 20 },
      { start: BEAT / 2, width: 20 },
    ];
    expect(labelRowWidth(MEASURE, eighths, 2)).toBe(176);
  });

  it('is decided by the tightest pair, in whatever order the labels are given', () => {
    const labels = [
      { start: 3 * BEAT, width: 10 },
      { start: 0, width: 10 },
      { start: 3.5 * BEAT, width: 30 },
      { start: 2.5 * BEAT, width: 28 },
    ];
    // 28 + 2 pixels in half a beat; the last label has no neighbour to run into.
    expect(labelRowWidth(MEASURE, labels, 2)).toBe(240);
  });

  it('ignores labels that share a position', () => {
    const labels = [
      { start: 0, width: 40 },
      { start: 0, width: 40 },
      { start: 2 * BEAT, width: 10 },
    ];
    expect(labelRowWidth(MEASURE, labels, 0)).toBe(80);
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

describe('the size of the score on a phone', () => {
  it('takes the width of a typical run of measures in a row', () => {
    const weights = [4, 4, 6, 4, 8, 4, 4, 4, 5, 4];
    // Runs of two: 8, 10, 10, 12, 12, 8, 8, 9, 9; the 80th percentile is 12.
    expect(typicalRun(weights, 2)).toBe(12);
    expect(typicalRun(weights, 1)).toBe(6);
    expect(typicalRun([3, 4], 4)).toBe(7);
    expect(typicalRun([], 2)).toBe(0);
  });

  it('shrinks the score until such a run fits, within limits', () => {
    // A run of 10 units at 40 pixels each, plus 22 for the labels, needs 422 pixels.
    expect(fitScale(211, 10, 40, 22)).toBeCloseTo(0.5);
    expect(fitScale(1000, 10, 40, 22)).toBe(1);
    expect(fitScale(50, 10, 40, 22)).toBe(0.4);
    expect(fitScale(0, 10, 40, 22)).toBe(1);
  });
});

describe('the zoom of the score', () => {
  it('steps through the sizes and stops at both ends', () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomIn(ZOOM_STEPS[ZOOM_STEPS.length - 1])).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    expect(zoomOut(ZOOM_STEPS[0])).toBe(ZOOM_STEPS[0]);
    expect(canZoomIn(1.8)).toBe(false);
    expect(canZoomOut(0.5)).toBe(false);
    // A value between the steps snaps to the nearest one first.
    expect(zoomIn(1.03)).toBe(1.1);
  });
});
