import { createSongBundle, type SongBundle } from './core';

/** One song folder found under songs/. */
export interface SongEntry {
  /** Folder path relative to songs/, e.g. "amazing-grace" or "private/my-song". */
  id: string;
  /** True for songs under songs/private, which exist on this machine only. */
  isPrivate: boolean;
  bundle: SongBundle;
}

const songFiles = import.meta.glob<string>('/songs/**/song.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const arrangementFiles = import.meta.glob<unknown>('/songs/**/arrangements.json', {
  import: 'default',
  eager: true,
});

const SONG_PATH = /^\/songs\/(.+)\/song\.txt$/;

/** Every song under songs/, parsed and ready to display, sorted by title. */
export const library: SongEntry[] = Object.entries(songFiles)
  .flatMap(([path, text]) => {
    const match = SONG_PATH.exec(path);
    if (!match) return [];
    const id = match[1];
    const arrangements = arrangementFiles[`/songs/${id}/arrangements.json`];
    return [
      { id, isPrivate: id.startsWith('private/'), bundle: createSongBundle(text, arrangements) },
    ];
  })
  .sort((a, b) => a.bundle.song.meta.title.localeCompare(b.bundle.song.meta.title));
