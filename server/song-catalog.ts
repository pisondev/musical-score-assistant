import type { ObjectStore } from './object-store.ts';
import { isSongId } from './notes-store.ts';
import { PRIVATE_FOLDER, readPrivateSongs, type StoredSong } from './private-songs.ts';

/**
 * Which songs exist, and the private ones themselves. Public songs are part
 * of every deploy and lie in the songs folder. Private songs lie in the same
 * folder on a development machine; on the public server they come from the
 * object store, where `npm run songs:push` puts them, so they need no deploy
 * and never pass through GitHub.
 */
export interface SongCatalog {
  /** True when a song with this id exists. */
  has(songId: string): Promise<boolean>;
  privateSongs(): Promise<StoredSong[]>;
}

/** Every song from the songs folder, private ones included. */
export function folderCatalog(songsDir: string): SongCatalog {
  return {
    has: async (songId) => isSongId(songsDir, songId),
    privateSongs: async () => readPrivateSongs(songsDir),
  };
}

const SONG_FILE = 'song.txt';
const ARRANGEMENTS_FILE = 'arrangements.json';

/**
 * Public songs from the songs folder, private songs from a store whose keys
 * are their paths below the songs folder ("private/kk-1-title/song.txt").
 * Files are fetched again only when their tag has changed.
 */
export function storeCatalog(songsDir: string, store: ObjectStore): SongCatalog {
  const cache = new Map<string, { etag: string; text: string }>();

  async function read(key: string, etag: string): Promise<string | null> {
    const known = cache.get(key);
    if (known && known.etag === etag) return known.text;
    const text = await store.get(key);
    if (text !== null) cache.set(key, { etag, text });
    return text;
  }

  async function privateSongs(): Promise<StoredSong[]> {
    const objects = await store.list(`${PRIVATE_FOLDER}/`);
    const tags = new Map(objects.map((object) => [object.key, object.etag]));
    const songs: StoredSong[] = [];
    for (const object of objects) {
      if (!object.key.endsWith(`/${SONG_FILE}`)) continue;
      const id = object.key.slice(0, -`/${SONG_FILE}`.length);
      const song = await read(object.key, object.etag);
      if (song === null) continue;
      const arrangementsKey = `${id}/${ARRANGEMENTS_FILE}`;
      const arrangementsTag = tags.get(arrangementsKey);
      let arrangements: unknown = null;
      if (arrangementsTag !== undefined) {
        try {
          arrangements = JSON.parse((await read(arrangementsKey, arrangementsTag)) ?? 'null');
        } catch {
          arrangements = null;
        }
      }
      songs.push({ id, song, arrangements });
    }
    return songs.sort((a, b) => a.id.localeCompare(b.id));
  }

  return {
    async has(songId) {
      if (!songId.startsWith(`${PRIVATE_FOLDER}/`)) return isSongId(songsDir, songId);
      return (await store.list(`${songId}/${SONG_FILE}`)).some(
        (object) => object.key === `${songId}/${SONG_FILE}`,
      );
    },
    privateSongs,
  };
}
