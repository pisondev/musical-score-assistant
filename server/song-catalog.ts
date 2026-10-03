import { createSongBundle } from '../src/core/bundle.ts';
import { indexSong, type SongIndexEntry } from '../src/core/song-index.ts';
import type { ObjectStore } from './object-store.ts';
import { isSongId } from './notes-store.ts';
import {
  isPrivateSongId,
  parseArrangements,
  PRIVATE_FOLDER,
  privateSongIds,
  privateSongStamp,
  readPrivateSong,
  type StoredSong,
} from './private-songs.ts';

/**
 * Which songs exist, and the private ones themselves. Public songs are part of every deploy
 * and lie in the songs folder. Private songs lie in the same folder on a development machine;
 * on the public server they come from the object store, where `npm run songs:push` puts them,
 * so they need no deploy and never pass through GitHub.
 *
 * The library of the owner lists the private songs from their index entries, and a song is
 * sent whole only when it is opened, so a library of hundreds of songs stays quick.
 */
export interface SongCatalog {
  /** True when a song with this id exists. */
  has(songId: string): Promise<boolean>;
  /** The index entries of the private songs, sorted by id. */
  privateIndex(): Promise<SongIndexEntry[]>;
  /** One private song as its files, or null when there is none by that id. */
  privateSong(songId: string): Promise<StoredSong | null>;
}

/**
 * Index entries by song, made again only when the stamp of the song changes: its files are
 * parsed once per change, not on every request.
 */
function indexCache() {
  let cache = new Map<string, { stamp: string; entry: SongIndexEntry }>();
  return async (
    songs: { id: string; stamp: string }[],
    read: (songId: string) => Promise<StoredSong | null>,
  ): Promise<SongIndexEntry[]> => {
    const next = new Map<string, { stamp: string; entry: SongIndexEntry }>();
    for (const { id, stamp } of songs) {
      const known = cache.get(id);
      if (known && known.stamp === stamp) {
        next.set(id, known);
        continue;
      }
      const stored = await read(id);
      if (!stored) continue;
      const bundle = createSongBundle(stored.song, stored.arrangements ?? undefined);
      next.set(id, { stamp, entry: indexSong(id, bundle) });
    }
    // Songs that are gone leave the cache with this call.
    cache = next;
    return [...next.values()].map((item) => item.entry).sort((a, b) => a.id.localeCompare(b.id));
  };
}

/** Every song from the songs folder, private ones included. */
export function folderCatalog(songsDir: string): SongCatalog {
  const index = indexCache();
  return {
    has: async (songId) => isSongId(songsDir, songId),
    privateIndex: () =>
      index(
        privateSongIds(songsDir).map((id) => ({ id, stamp: privateSongStamp(songsDir, id) })),
        async (songId) => readPrivateSong(songsDir, songId),
      ),
    privateSong: async (songId) => readPrivateSong(songsDir, songId),
  };
}

const SONG_FILE = 'song.txt';
const ARRANGEMENTS_FILE = 'arrangements.json';

/**
 * Public songs from the songs folder, private songs from a store whose keys are their paths
 * below the songs folder ("private/kk-1-title/song.txt"). A song is fetched again for the
 * index only when the tag of one of its files has changed.
 */
export function storeCatalog(songsDir: string, store: ObjectStore): SongCatalog {
  const index = indexCache();

  async function privateSong(songId: string): Promise<StoredSong | null> {
    if (!isPrivateSongId(songId)) return null;
    const song = await store.get(`${songId}/${SONG_FILE}`);
    if (song === null) return null;
    const arrangements = parseArrangements(await store.get(`${songId}/${ARRANGEMENTS_FILE}`));
    return { id: songId, song, arrangements };
  }

  return {
    async has(songId) {
      if (!songId.startsWith(`${PRIVATE_FOLDER}/`)) return isSongId(songsDir, songId);
      return (await store.list(`${songId}/${SONG_FILE}`)).some(
        (object) => object.key === `${songId}/${SONG_FILE}`,
      );
    },
    async privateIndex() {
      const objects = await store.list(`${PRIVATE_FOLDER}/`);
      const tags = new Map(objects.map((object) => [object.key, object.etag]));
      const songs = objects
        .filter((object) => object.key.endsWith(`/${SONG_FILE}`))
        .map((object) => {
          const id = object.key.slice(0, -`/${SONG_FILE}`.length);
          return { id, stamp: `${object.etag}|${tags.get(`${id}/${ARRANGEMENTS_FILE}`) ?? '-'}` };
        });
      return index(songs, privateSong);
    },
    privateSong,
  };
}
