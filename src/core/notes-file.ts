// The development server loads this module through the Vite configuration, which is why it
// depends on nothing but the types and names its import with the file extension.
import type { MeasurePart, RightHandMode } from './types.ts';

/**
 * Notes the player writes on single measures: a correction, a remark, "I
 * like this one". They are kept per song in a file next to it (`notes.json`),
 * so they can be read later, outside the app, when the song is revised.
 */

/** What was on the sheet when a note was written. */
export interface NoteContext {
  /** Id and name of the left-hand arrangement. */
  leftHand: string;
  leftHandName: string;
  rightHand: RightHandMode;
  /** Whether the chords under the melody were on. */
  chords: boolean;
  intro: string;
  ending: string;
  /** Half steps by which the repeat was lifted; 0 without a repeat. */
  lift: number;
  /** The key that was sounding: "A", "B♭". */
  key: string;
}

export interface MeasureNote {
  id: string;
  /** The stretch of the performance the measure belongs to. */
  part: MeasurePart;
  /**
   * In the song: the printed measure number, 0 for the pickup. Elsewhere: the
   * position within the introduction, the interlude, or the ending, from 1.
   */
  measure: number;
  /** The introduction or ending the measure belongs to, outside the song. */
  passage?: string;
  /** The place in words, so the file can be read without the app: "Measure 12". */
  where: string;
  text: string;
  context: NoteContext;
  /** ISO dates. */
  createdAt: string;
  updatedAt: string;
}

const PARTS: readonly MeasurePart[] = ['intro', 'song', 'interlude', 'ending'];
const MODES: readonly RightHandMode[] = ['melody', 'fills', 'accompaniment'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/**
 * Reads notes from parsed JSON, keeping what is well formed. The file may be
 * edited by hand, and whatever is sent to the server is not trusted either.
 */
export function readNotes(data: unknown): MeasureNote[] {
  const list = isRecord(data) ? data.notes : data;
  if (!Array.isArray(list)) return [];

  const notes: MeasureNote[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const id = text(entry.id);
    const body = text(entry.text).trim();
    const part = entry.part as MeasurePart;
    if (!id || seen.has(id) || !body || !PARTS.includes(part)) continue;
    if (typeof entry.measure !== 'number' || !Number.isInteger(entry.measure)) continue;
    seen.add(id);

    const context = isRecord(entry.context) ? entry.context : {};
    const createdAt = text(entry.createdAt);
    notes.push({
      id,
      part,
      measure: entry.measure,
      ...(typeof entry.passage === 'string' && entry.passage ? { passage: entry.passage } : {}),
      where: text(entry.where),
      text: body,
      context: {
        leftHand: text(context.leftHand),
        leftHandName: text(context.leftHandName),
        rightHand: MODES.includes(context.rightHand as RightHandMode)
          ? (context.rightHand as RightHandMode)
          : 'melody',
        chords: context.chords === true,
        intro: text(context.intro, 'off'),
        ending: text(context.ending, 'off'),
        lift: typeof context.lift === 'number' ? context.lift : 0,
        key: text(context.key),
      },
      createdAt,
      updatedAt: text(entry.updatedAt, createdAt),
    });
  }
  return notes;
}

/** Notes in the order of the piece: introduction, song by measure, interlude, ending. */
export function sortNotes(notes: readonly MeasureNote[]): MeasureNote[] {
  return [...notes].sort(
    (a, b) =>
      PARTS.indexOf(a.part) - PARTS.indexOf(b.part) ||
      a.measure - b.measure ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
