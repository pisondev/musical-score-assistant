import { readNotes } from '../src/core/notes-file.ts';
import type { CommentRecord } from './database.ts';

/**
 * Comments on measures: what a signed-in user wants to tell the author about a place in a song.
 * A comment changes nothing; it waits in the database until the author fetches it
 * (`npm run comments:pull`), and a reply, written whenever there is time, appears under it in
 * the app. No answer is generated: there is no conversation to keep up with.
 */

/** The longest comment, in characters. */
export const MAX_COMMENT_LENGTH = 1000;
/** How many comments one user may send in a day; enough for anybody, too few for a flood. */
export const COMMENTS_PER_DAY = 30;
export const DAY = 24 * 60 * 60 * 1000;

/** A new comment as the app sends it: the place on the sheet and the text. */
export interface NewComment {
  songId: string;
  place: Record<string, unknown>;
  text: string;
}

/**
 * Reads a new comment from what the app sent, or returns why it cannot be one. The place has
 * the shape of a note on a measure, so it is read the way notes are.
 */
export function readNewComment(body: unknown): NewComment | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'A comment is an object.';
  }
  const { song, ...rest } = body as Record<string, unknown>;
  if (typeof song !== 'string' || song === '') return 'The comment names no song.';
  const text = typeof rest.text === 'string' ? rest.text.trim() : '';
  if (text === '') return 'The comment is empty.';
  if (text.length > MAX_COMMENT_LENGTH) {
    return `A comment has at most ${MAX_COMMENT_LENGTH} characters.`;
  }
  const [note] = readNotes([{ ...rest, text, id: 'comment', createdAt: '' }]);
  if (!note) return 'The comment names no measure.';
  const { part, measure, passage, where, context } = note;
  return {
    songId: song,
    place: { part, measure, ...(passage ? { passage } : {}), where, context },
    text,
  };
}

/** A comment as the app shows it to the person who wrote it. */
export interface CommentView {
  id: string;
  songId: string;
  part: unknown;
  measure: unknown;
  passage?: unknown;
  where: unknown;
  context: unknown;
  text: string;
  /** ISO dates. */
  createdAt: string;
  readAt: string | null;
  reply: string | null;
  repliedAt: string | null;
  replySeen: boolean;
}

const iso = (moment: number | null) => (moment === null ? null : new Date(moment).toISOString());

export function viewComment(comment: CommentRecord): CommentView {
  const { part, measure, passage, where, context } = comment.place;
  return {
    id: String(comment.id),
    songId: comment.songId,
    part,
    measure,
    ...(passage === undefined ? {} : { passage }),
    where,
    context,
    text: comment.text,
    createdAt: new Date(comment.createdAt).toISOString(),
    readAt: iso(comment.readAt),
    reply: comment.reply,
    repliedAt: iso(comment.repliedAt),
    replySeen: comment.replySeenAt !== null,
  };
}
