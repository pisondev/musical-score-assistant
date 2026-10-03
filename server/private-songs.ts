import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Songs under `songs/private`. They may be copyrighted, so they are not part
 * of the built site; the server hands them out to signed-in owners only, as
 * the raw files, and the browser parses them like the bundled songs.
 */

export const PRIVATE_FOLDER = 'private';

/** One song folder: its id and the contents of its two files. */
export interface StoredSong {
  /** Folder path relative to the songs folder, e.g. "private/kj-1-song". */
  id: string;
  /** The text of `song.txt`. */
  song: string;
  /** The parsed `arrangements.json`, or null when there is none or it cannot be read. */
  arrangements: unknown;
}

function songFolders(folder: string): string[] {
  if (!existsSync(folder)) return [];
  if (existsSync(join(folder, 'song.txt'))) return [folder];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .flatMap((entry) => songFolders(join(folder, entry.name)))
    .sort();
}

function readJson(file: string): unknown {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Every private song, read from disk on each call so that a deploy needs no restart. */
export function readPrivateSongs(songsRoot: string): StoredSong[] {
  return songFolders(join(songsRoot, PRIVATE_FOLDER)).map((folder) => ({
    id: relative(songsRoot, folder).split(sep).join('/'),
    song: readFileSync(join(folder, 'song.txt'), 'utf8'),
    arrangements: readJson(join(folder, 'arrangements.json')),
  }));
}
