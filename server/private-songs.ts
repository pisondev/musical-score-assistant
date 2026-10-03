import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isWellFormedSongId } from './notes-store.ts';

/**
 * Songs under `songs/private`. They are licensed, so they are not part of the built site; the
 * server hands them out to the owner only, as the raw files, and the browser parses them like
 * the songs of the site.
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

/** True for the id of a private song: well formed, below `private/`. */
export function isPrivateSongId(songId: string): boolean {
  return isWellFormedSongId(songId) && songId.startsWith(`${PRIVATE_FOLDER}/`);
}

/** Parses the text of `arrangements.json`; a damaged file counts as none. */
export function parseArrangements(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function songFolders(folder: string): string[] {
  if (!existsSync(folder)) return [];
  if (existsSync(join(folder, 'song.txt'))) return [folder];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .flatMap((entry) => songFolders(join(folder, entry.name)))
    .sort();
}

/** The ids of the private songs on disk, nested folders included. */
export function privateSongIds(songsRoot: string): string[] {
  return songFolders(join(songsRoot, PRIVATE_FOLDER)).map((folder) =>
    relative(songsRoot, folder).split(sep).join('/'),
  );
}

const readText = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

/** One private song from disk, or null when its folder holds none. */
export function readPrivateSong(songsRoot: string, songId: string): StoredSong | null {
  if (!isPrivateSongId(songId)) return null;
  const folder = join(songsRoot, ...songId.split('/'));
  const song = readText(join(folder, 'song.txt'));
  if (song === null) return null;
  return {
    id: songId,
    song,
    arrangements: parseArrangements(readText(join(folder, 'arrangements.json'))),
  };
}

/** What changes whenever a file of the song changes: the sizes and times of both files. */
export function privateSongStamp(songsRoot: string, songId: string): string {
  const folder = join(songsRoot, ...songId.split('/'));
  return ['song.txt', 'arrangements.json']
    .map((name) => {
      const file = join(folder, name);
      if (!existsSync(file)) return '-';
      const stats = statSync(file);
      return `${stats.size}:${stats.mtimeMs}`;
    })
    .join('|');
}
