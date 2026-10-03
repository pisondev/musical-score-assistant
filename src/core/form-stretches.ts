import type { Performance, PerformanceSection } from './performance.ts';
import type { MeasurePart } from './types.ts';

/**
 * A stretch of a performance that has one name for the player: the
 * introduction, the verse, the refrain, the interlude, the ending. The
 * blocks of the sheet are stretches; the song is divided further where its
 * file names a section.
 */
export interface FormStretch {
  kind: MeasurePart;
  /** "Intro", "Song (verse)", "Repeat (refrain)", "Ending". */
  label: string;
  /** Index of the first measure, and how many measures follow from there. */
  start: number;
  count: number;
}

const NAME: Record<MeasurePart, string> = {
  intro: 'Intro',
  song: 'Song',
  interlude: 'Interlude',
  ending: 'Ending',
};

const nameOf = (section: PerformanceSection): string =>
  section.kind === 'song' && section.pass === 2 ? 'Repeat' : NAME[section.kind];

/** The stretches of a performance in order; together they cover every measure. */
export function formStretches(performance: Performance): FormStretch[] {
  const stretches: FormStretch[] = [];
  for (const section of performance.sections) {
    const name = nameOf(section);
    const end = section.start + section.count;

    const named: { index: number; label: string }[] = [];
    if (section.kind === 'song') {
      for (let index = section.start; index < end; index += 1) {
        const label = performance.song.measures[index].section?.trim();
        if (label) named.push({ index, label });
      }
    }
    if (named.length === 0) {
      stretches.push({
        kind: section.kind,
        label: name,
        start: section.start,
        count: section.count,
      });
      continue;
    }
    named.forEach((entry, position) => {
      // Measures before the first name, a pickup for example, belong to it.
      const start = position === 0 ? section.start : entry.index;
      const next = named[position + 1]?.index ?? end;
      stretches.push({
        kind: section.kind,
        label: `${name} (${entry.label.toLowerCase()})`,
        start,
        count: next - start,
      });
    });
  }
  return stretches;
}

/** The position of the stretch a measure belongs to; the last one past the end. */
export function stretchAt(stretches: readonly FormStretch[], measure: number): number {
  const found = stretches.findIndex(
    (stretch) => measure >= stretch.start && measure < stretch.start + stretch.count,
  );
  if (found >= 0) return found;
  return measure < 0 ? 0 : Math.max(0, stretches.length - 1);
}
