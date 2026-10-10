import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { buildPerformance, measureNames, type PerformanceForm } from '../src/core/performance';
import { loopMeasureGroups } from '../src/ui/loop-measures';

const SONG = `title: Loop
key: C
time: 4/4
| 5 | [C]1 2 3 4 | [G]5 . . . | [C]3 2 1 . | [C]1 . . ||
`;

const ARRANGEMENTS = {
  intro: {
    written: [
      {
        id: 'short',
        name: 'Short',
        measures: [
          { right: '1 2 3 4', left: '[C]1 5 1 5' },
          { right: '5 . .', left: '[G]1 . .' },
        ],
      },
    ],
  },
  modulation: { measures: [{ right: '5 . .', left: '[G]1 . .' }] },
  endings: [{ id: 'amen', name: 'Amen', measures: [{ right: '1 . . .', left: '[C]1 . . .' }] }],
  arrangements: [],
};

const bundle = createSongBundle(SONG, ARRANGEMENTS);
const baseline = bundle.arrangements[0];
const groupsOf = (intro: string, form: PerformanceForm = {}) => {
  const performance = buildPerformance(bundle, baseline, intro, 0, 'melody', form);
  return loopMeasureGroups(performance.song, measureNames(performance));
};

describe('the measures a loop can be set to', () => {
  it('are one list without a heading when the piece is the song alone', () => {
    const groups = groupsOf('off');
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeUndefined();
    expect(groups[0].options.map((option) => [option.value, option.label, option.shown])).toEqual([
      [0, 'Pickup', 'Pickup'],
      [1, '1', '1'],
      [2, '2', '2'],
      [3, '3', '3'],
      [4, '4', '4'],
    ]);
  });

  it('are grouped by the stretches of the piece, each counted from one', () => {
    const groups = groupsOf('short', { ending: 'amen' });
    expect(
      groups.map((group) => [group.label, group.options.map((option) => option.label)]),
    ).toEqual([
      ['Intro', ['1', '2']],
      ['Song', ['Pickup', '1', '2', '3', '4']],
      ['Ending', ['1']],
    ]);
    // The field names the measure in full, so that "1" of the ending is not taken for the song's.
    expect(groups[0].options[1].shown).toBe('Intro 2');
    expect(groups[2].options[0].shown).toBe('Ending 1');
    // Every measure of the performance is offered once, by its index.
    expect(groups.flatMap((group) => group.options.map((option) => option.value))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('name the second time through the song', () => {
    const groups = groupsOf('short', { lift: 1 });
    expect(groups.map((group) => group.label)).toEqual([
      'Intro',
      'Song',
      'Interlude',
      'Song, repeated',
    ]);
    expect(groups[3].options[1].shown).toBe('1 (repeat)');
  });
});
