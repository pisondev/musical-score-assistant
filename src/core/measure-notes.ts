import { formatNoteName } from './notes.ts';
import type { MeasureNote, NoteContext } from './notes-file.ts';
import { measureNames, type Performance } from './performance.ts';
import type { MeasurePart } from './types.ts';

/**
 * Where the player's notes belong in a performance. The notes themselves, and
 * the file they are kept in, are described in `notes-file.ts`.
 */

/** The place a note refers to. */
export type NoteTarget = Pick<MeasureNote, 'part' | 'measure' | 'passage' | 'where'>;

/** The passage a measure outside the song belongs to, for the choices in effect. */
function passageOf(part: MeasurePart, intro: string, ending: string): string | undefined {
  if (part === 'song') return undefined;
  return part === 'ending' ? ending : intro;
}

/**
 * The place a note on the measure at `index` refers to. A measure of the
 * song is the same place in the first time through and in the repeat.
 */
export function noteTarget(
  performance: Performance,
  index: number,
  choices: { intro: string; ending: string },
): NoteTarget | null {
  const section = performance.sections.find(
    (candidate) => index >= candidate.start && index < candidate.start + candidate.count,
  );
  const measure = performance.song.measures[index];
  if (!section || !measure) return null;

  if (section.kind === 'song') {
    return {
      part: 'song',
      measure: measure.number ?? 0,
      where: measure.number === null ? 'Pickup measure' : `Measure ${measure.number}`,
    };
  }
  const position = index - section.start + 1;
  const passage = passageOf(section.kind, choices.intro, choices.ending);
  const name = measureNames(performance)[index].long;
  return {
    part: section.kind,
    measure: position,
    passage,
    where: section.detail && section.kind !== 'interlude' ? `${name} (${section.detail})` : name,
  };
}

/** The notes that belong to one place. */
export function notesAt<T extends MeasureNote>(
  notes: readonly T[],
  target: NoteTarget | null,
): T[] {
  if (!target) return [];
  return notes.filter(
    (note) =>
      note.part === target.part &&
      note.measure === target.measure &&
      (note.passage ?? '') === (target.passage ?? ''),
  );
}

/** The context to store with a note that is written now. */
export function noteContext(
  performance: Performance,
  choices: { intro: string; ending: string; lift: number },
): NoteContext {
  return {
    leftHand: performance.arrangement.id,
    leftHandName: performance.arrangement.name,
    rightHand: performance.rightHand,
    chords: performance.chords,
    intro: choices.intro,
    ending: choices.ending,
    lift: choices.lift,
    key: formatNoteName(performance.song.meta.key),
  };
}
