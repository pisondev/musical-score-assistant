import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readNotes, sortNotes, type MeasureNote } from '../src/core/notes-file.ts';
import type { ObjectStore } from './object-store.ts';
import type { SongCatalog } from './song-catalog.ts';

/**
 * The player's notes on measures, one `notes.json` per song, kept in an
 * object store under `<song id>/notes.json`.
 *
 * On a development machine the store is the songs folder itself, so the
 * notes lie next to `song.txt` and are read in the editor when the song is
 * revised. On the public server it is the `notes/` part of the R2 bucket, and
 * `npm run notes:pull` brings the notes here.
 */

export const NOTES_FILE = 'notes.json';
const SONG_FILE = 'song.txt';

/** A song id is the path of its folder below the songs folder, with plain names only. */
const SONG_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function isWellFormedSongId(songId: string): boolean {
  return SONG_ID.test(songId);
}

/** True when the id is well formed and names a folder that holds a song. */
export function isSongId(songsRoot: string, songId: string): boolean {
  return (
    isWellFormedSongId(songId) &&
    existsSync(join(resolve(songsRoot), ...songId.split('/'), SONG_FILE))
  );
}

/** The key of the notes of a song. */
export function notesKey(songId: string): string {
  return `${songId}/${NOTES_FILE}`;
}

/** The notes of a song; an empty list when none are written, null for an unknown song. */
export async function loadNotes(
  store: ObjectStore,
  catalog: SongCatalog,
  songId: string,
): Promise<MeasureNote[] | null> {
  if (!isWellFormedSongId(songId) || !(await catalog.has(songId))) return null;
  const text = await store.get(notesKey(songId));
  if (text === null) return [];
  try {
    return readNotes(JSON.parse(text));
  } catch {
    // A file that was damaged by hand is treated as empty rather than breaking the app.
    return [];
  }
}

/**
 * Writes the notes of a song, in the order of the piece. Without notes the
 * file is removed. Returns false for an unknown song.
 */
export async function storeNotes(
  store: ObjectStore,
  catalog: SongCatalog,
  songId: string,
  notes: unknown,
): Promise<boolean> {
  if (!isWellFormedSongId(songId) || !(await catalog.has(songId))) return false;
  const list = sortNotes(readNotes(notes));
  if (list.length === 0) await store.delete(notesKey(songId));
  else {
    await store.put(
      notesKey(songId),
      `${JSON.stringify({ notes: list }, null, 2)}\n`,
      'application/json',
    );
  }
  return true;
}
