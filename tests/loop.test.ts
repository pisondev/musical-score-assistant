import { describe, expect, it } from 'vitest';
import { loopRestBeats } from '../src/core/time';

describe('the rest between two rounds of a loop', () => {
  it('is two beats in a meter counted in twos or fours', () => {
    expect(loopRestBeats({ beats: 4, unit: 4 })).toBe(2);
    expect(loopRestBeats({ beats: 2, unit: 4 })).toBe(2);
    expect(loopRestBeats({ beats: 2, unit: 2 })).toBe(2);
  });

  it('is three beats in a meter counted in threes', () => {
    expect(loopRestBeats({ beats: 3, unit: 4 })).toBe(3);
    expect(loopRestBeats({ beats: 6, unit: 8 })).toBe(3);
    expect(loopRestBeats({ beats: 9, unit: 8 })).toBe(3);
    expect(loopRestBeats({ beats: 12, unit: 8 })).toBe(3);
  });

  it('is two beats in the uneven meters', () => {
    expect(loopRestBeats({ beats: 5, unit: 4 })).toBe(2);
    expect(loopRestBeats({ beats: 7, unit: 8 })).toBe(2);
  });
});
