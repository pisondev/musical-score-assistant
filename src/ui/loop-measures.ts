import type { MeasureName, MeasurePart, Song } from '../core';
import type { SelectGroup } from './Select';

const PART_NAME: Record<MeasurePart, string> = {
  intro: 'Intro',
  song: 'Song',
  interlude: 'Interlude',
  ending: 'Ending',
};

/**
 * The measures to choose from for a loop, one group for every stretch of the piece: the
 * introduction, the song, the interlude, the song again, the ending. In the list a measure
 * is its number within its group; the field shows its full name, such as "Intro 2". A piece
 * that is the song alone needs no heading.
 */
export function loopMeasureGroups(song: Song, names: MeasureName[]): SelectGroup<number>[] {
  const groups: (SelectGroup<number> & { part: MeasurePart })[] = [];
  for (const measure of song.measures) {
    let group = groups[groups.length - 1];
    if (!group || group.part !== measure.part) {
      const again = measure.part === 'song' && groups.some((earlier) => earlier.part === 'song');
      group = {
        part: measure.part,
        label: again ? 'Song, repeated' : PART_NAME[measure.part],
        options: [],
      };
      groups.push(group);
    }
    const name = names[measure.index];
    group.options.push({
      value: measure.index,
      label: name?.label || 'Pickup',
      shown: name?.short ?? '',
    });
  }
  return groups.length === 1
    ? [{ options: groups[0].options }]
    : groups.map(({ label, options }) => ({ label, options }));
}
