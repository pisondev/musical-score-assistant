// The development server loads this module through the Vite configuration, which is why it
// depends on nothing but the types and names its import with the file extension.
import type { MeasurePart, RightHandMode } from './types.ts';

/**
 * Notes the player writes on single measures: a correction, a remark, "I
 * like this one". They are kept per song in a file next to it (`notes.json`),
 * so they can be read later, outside the app, when the song is revised. Whoever
 * revises the song answers a note there, and the app shows the answer under it.
 */

/** The name that signs the answers to the player's notes. */
export const REPLY_AUTHOR = 'Composer Admin';

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
  /**
   * The answer of the author who acted on the note. The player does not write it; it
   * arrives with a revision of the song and is shown under the note, like a reply in a
   * conversation.
   */
  reply?: string;
  /** ISO date of the answer. */
  repliedAt?: string;
  /** True once the note has been dealt with; the sheet marks its measure as done. */
  resolved?: boolean;
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
    const reply = text(entry.reply).trim();
    const repliedAt = text(entry.repliedAt);
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
      ...(reply ? { reply } : {}),
      ...(reply && repliedAt ? { repliedAt } : {}),
      ...(entry.resolved === true ? { resolved: true } : {}),
    });
  }
  return notes;
}

/** True when there are notes and every one of them has been dealt with. */
export function allResolved(notes: readonly MeasureNote[]): boolean {
  return notes.length > 0 && notes.every((note) => note.resolved === true);
}

/**
 * A note after its writer changed the text: open again, without the answer, which was
 * given to what the note said before.
 */
export function reopened(note: MeasureNote, newText: string, now: string): MeasureNote {
  const open: MeasureNote = { ...note, text: newText, updatedAt: now };
  delete open.reply;
  delete open.repliedAt;
  delete open.resolved;
  return open;
}

/** What became of the answers when two copies of the notes of a song were joined. */
export interface RepliesTaken {
  notes: MeasureNote[];
  /** Answers that were taken over. */
  taken: number;
  /** Answered notes that say something else by now, and were left alone. */
  changed: number;
  /** Answered notes that the other copy does not have. */
  missing: number;
}

/**
 * Brings the answers from one copy of the notes of a song into another. `kept` decides
 * which notes there are and what they say; `answered` is a copy in which answers were
 * written. An answer is taken over for a note that has none yet, or an older one, as long
 * as the note still says what was answered.
 */
export function takeReplies(
  kept: readonly MeasureNote[],
  answered: readonly MeasureNote[],
): RepliesTaken {
  const answers = new Map(
    answered.filter((note) => note.reply !== undefined).map((note) => [note.id, note]),
  );
  let taken = 0;
  let changed = 0;
  const notes = kept.map((note) => {
    const answer = answers.get(note.id);
    if (!answer) return note;
    answers.delete(note.id);
    if (answer.text !== note.text) {
      changed += 1;
      return note;
    }
    const same =
      note.reply === answer.reply && (note.resolved ?? false) === (answer.resolved ?? false);
    if (same || (note.repliedAt ?? '') > (answer.repliedAt ?? '')) return note;
    taken += 1;
    return {
      ...note,
      reply: answer.reply,
      ...(answer.repliedAt ? { repliedAt: answer.repliedAt } : {}),
      ...(answer.resolved ? { resolved: true } : {}),
    };
  });
  return { notes, taken, changed, missing: answers.size };
}

/** Notes in the order of the piece: introduction, song by measure, interlude, ending. */
export function sortNotes<T extends MeasureNote>(notes: readonly T[]): T[] {
  return [...notes].sort(
    (a, b) =>
      PARTS.indexOf(a.part) - PARTS.indexOf(b.part) ||
      a.measure - b.measure ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
