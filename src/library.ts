import { useEffect, useState } from 'react';
import publicIndex from 'virtual:song-index';
import { create } from 'zustand';
import { API_ROOT } from './account';
import { createSongBundle, isIndexEntry, type SongBundle, type SongIndexEntry } from './core';

/**
 * The songs the person in front of the app may open. The library holds their index entries
 * only; a song is loaded when it is opened: a public song from a chunk of its own in the built
 * site, a private one from the server, which hands it to the owner only.
 */

/** One song of the library, as listed before it is opened. */
export type SongEntry = SongIndexEntry;

/** What the "Private" badge of a song means. */
export const PRIVATE_HINT =
  'Licensed, kept in songs/private: never committed, and shown to the owner only.';

const byTitle = (a: SongEntry, b: SongEntry) => a.meta.title.localeCompare(b.meta.title);

// The files of each public song become chunks of their own, loaded on demand. Private songs
// are left out of the built site, because they may be copyrighted.
const songFiles = import.meta.glob<string>(['/songs/**/song.txt', '!/songs/private/**'], {
  query: '?raw',
  import: 'default',
});
const arrangementFiles = import.meta.glob<unknown>(
  ['/songs/**/arrangements.json', '!/songs/private/**'],
  { import: 'default' },
);

/** The songs that are part of the site: everything outside songs/private, sorted by title. */
export const publicLibrary: SongEntry[] = [...publicIndex].sort(byTitle);

/** Where the private songs stand: not asked for yet, on their way, here, or not available. */
export type PrivateSongsStatus = 'idle' | 'loading' | 'loaded' | 'unavailable';

interface LibraryState {
  /** Every song the person in front of the app may see, sorted by title. */
  entries: SongEntry[];
  privateSongs: PrivateSongsStatus;
  /** Fetches the index of the private songs from the server; only the owner gets it. */
  loadPrivateSongs: () => Promise<void>;
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
      const { songs } = (await response.json()) as { songs?: unknown };
      const own = (Array.isArray(songs) ? songs : []).filter(isIndexEntry);
      set({ entries: [...publicLibrary, ...own].sort(byTitle), privateSongs: 'loaded' });
    } catch {
      set({ privateSongs: 'unavailable' });
    }
  },
}));

async function loadPublicSong(id: string): Promise<SongBundle> {
  const loadText = songFiles[`/songs/${id}/song.txt`];
  if (!loadText) throw new Error(`There is no song "${id}".`);
  const loadArrangements = arrangementFiles[`/songs/${id}/arrangements.json`];
  const [text, arrangements] = await Promise.all([loadText(), loadArrangements?.()]);
  return createSongBundle(text, arrangements ?? undefined);
}

async function loadPrivateSong(id: string): Promise<SongBundle> {
  const response = await fetch(`${API_ROOT}/private-songs?id=${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  const { song } = (await response.json()) as { song?: { song?: unknown; arrangements?: unknown } };
  if (typeof song?.song !== 'string') throw new Error('The server sent no song.');
  return createSongBundle(song.song, song.arrangements ?? undefined);
}

const loaded = new Map<string, Promise<SongBundle>>();

/** The full song, loaded once per visit; a failed attempt is tried again the next time. */
export function loadSong(entry: SongEntry): Promise<SongBundle> {
  let pending = loaded.get(entry.id);
  if (!pending) {
    pending = entry.isPrivate ? loadPrivateSong(entry.id) : loadPublicSong(entry.id);
    pending.catch(() => loaded.delete(entry.id));
    loaded.set(entry.id, pending);
  }
  return pending;
}

/** The state of loading one song for a page. */
export type SongLoad =
  | { status: 'loading' }
  | { status: 'ready'; bundle: SongBundle }
  | { status: 'failed'; retry: () => void };

/** Loads the full song of an entry for the page that shows it. */
export function useSongBundle(entry: SongEntry): SongLoad {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ id: string; load: SongLoad } | null>(null);

  useEffect(() => {
    let current = true;
    loadSong(entry).then(
      (bundle) => current && setState({ id: entry.id, load: { status: 'ready', bundle } }),
      () =>
        current &&
        setState({
          id: entry.id,
          load: {
            status: 'failed',
            retry: () => {
              setState(null);
              setAttempt((count) => count + 1);
            },
          },
        }),
    );
    return () => {
      current = false;
    };
  }, [entry, attempt]);

  return state && state.id === entry.id ? state.load : { status: 'loading' };
}
