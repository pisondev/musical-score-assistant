import { create } from 'zustand';
import { API_ROOT } from './account';
import { createSongBundle, summarizeSong, type SongBundle, type SongSummary } from './core';

/** One song folder found under songs/. */
export interface SongEntry {
  /** Folder path relative to songs/, e.g. "amazing-grace" or "private/my-song". */
  id: string;
  /** True for songs under songs/private: never committed, and shown to the owner only. */
  isPrivate: boolean;
  bundle: SongBundle;
  /** Counts for the overview of all songs. */
  summary: SongSummary;
}

/** What the "Private" badge of a song means. */
export const PRIVATE_HINT =
  'Kept in songs/private: never committed, and shown to the signed-in owner only.';

/** Parses one song folder into an entry of the library. */
export function songEntry(id: string, songText: string, arrangements: unknown): SongEntry {
  const bundle = createSongBundle(songText, arrangements ?? undefined);
  return { id, isPrivate: id.startsWith('private/'), bundle, summary: summarizeSong(bundle) };
}

const byTitle = (a: SongEntry, b: SongEntry) =>
  a.bundle.song.meta.title.localeCompare(b.bundle.song.meta.title);

// Private songs may be copyrighted, so they are left out of the built site and come from the
// server, which hands them to the owner only.
const songFiles = import.meta.glob<string>(['/songs/**/song.txt', '!/songs/private/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const arrangementFiles = import.meta.glob<unknown>(
  ['/songs/**/arrangements.json', '!/songs/private/**'],
  { import: 'default', eager: true },
);

const SONG_PATH = /^\/songs\/(.+)\/song\.txt$/;

/** The songs that are part of the site: everything outside songs/private, sorted by title. */
export const publicLibrary: SongEntry[] = Object.entries(songFiles)
  .flatMap(([path, text]) => {
    const match = SONG_PATH.exec(path);
    if (!match) return [];
    const id = match[1];
    return [songEntry(id, text, arrangementFiles[`/songs/${id}/arrangements.json`])];
  })
  .sort(byTitle);

/** Where the private songs stand: not asked for yet, on their way, here, or not available. */
export type PrivateSongsStatus = 'idle' | 'loading' | 'loaded' | 'unavailable';

interface LibraryState {
  /** Every song the person in front of the app may see, sorted by title. */
  entries: SongEntry[];
  privateSongs: PrivateSongsStatus;
  /** Fetches the private songs from the server; only the owner gets them. */
  loadPrivateSongs: () => Promise<void>;
}

interface StoredSong {
  id: string;
  song: string;
  arrangements: unknown;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  entries: publicLibrary,
  privateSongs: 'idle',

  async loadPrivateSongs() {
    if (get().privateSongs === 'loading' || get().privateSongs === 'loaded') return;
    set({ privateSongs: 'loading' });
    try {
      const response = await fetch(`${API_ROOT}/private-songs`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`The server answered ${response.status}.`);
      const { songs } = (await response.json()) as { songs: StoredSong[] };
      const own = songs
        .filter((stored) => typeof stored.id === 'string' && typeof stored.song === 'string')
        .map((stored) => songEntry(stored.id, stored.song, stored.arrangements));
      set({ entries: [...publicLibrary, ...own].sort(byTitle), privateSongs: 'loaded' });
    } catch {
      set({ privateSongs: 'unavailable' });
    }
  },
}));
