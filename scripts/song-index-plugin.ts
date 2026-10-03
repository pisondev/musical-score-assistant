import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { createSongBundle } from '../src/core/bundle.ts';
import { indexSong, type SongIndexEntry } from '../src/core/song-index.ts';

/**
 * The index of the public songs as the module `virtual:song-index`. The home page lists the
 * songs from it, and each song is loaded from a chunk of its own when it is opened, so the
 * first page stays small however many songs there are. Private songs are not part of it: the
 * server indexes them for the owner.
 */

const VIRTUAL_ID = 'virtual:song-index';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const PRIVATE_FOLDER = 'private';

/** The folders below the songs folder that hold a public song, as paths with forward slashes. */
export function publicSongFolders(songsDir: string): string[] {
  const walk = (folder: string): string[] => {
    if (existsSync(join(folder, 'song.txt'))) return [folder];
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .filter((entry) => !(folder === songsDir && entry.name === PRIVATE_FOLDER))
      .flatMap((entry) => walk(join(folder, entry.name)));
  };
  if (!existsSync(songsDir)) return [];
  return walk(songsDir)
    .map((folder) => relative(songsDir, folder).split(sep).join('/'))
    .sort();
}

function readJson(file: string): unknown {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Index entries of every public song, sorted by title. */
export function publicSongIndex(songsDir: string): SongIndexEntry[] {
  return publicSongFolders(songsDir)
    .map((id) => {
      const folder = join(songsDir, ...id.split('/'));
      const bundle = createSongBundle(
        readFileSync(join(folder, 'song.txt'), 'utf8'),
        readJson(join(folder, 'arrangements.json')),
      );
      return indexSong(id, bundle);
    })
    .sort((a, b) => a.meta.title.localeCompare(b.meta.title));
}

const SONG_FILE = /[\\/](song\.txt|arrangements\.json)$/;

export function songIndexPlugin(songsDir = 'songs'): Plugin {
  let building = false;
  return {
    name: 'song-index',
    configResolved(config) {
      building = config.command === 'build';
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      // A build in watch mode follows the songs; the development server has its own watcher.
      if (building) {
        for (const folder of publicSongFolders(songsDir)) {
          this.addWatchFile(resolve(songsDir, ...folder.split('/'), 'song.txt'));
        }
      }
      return `export default ${JSON.stringify(publicSongIndex(songsDir))};`;
    },
    configureServer(server) {
      // A public song that is added, changed, or removed changes the index, and the page
      // reloads with it; private songs are left to the API.
      const changed = (file: string) => {
        const path = file.replaceAll('\\', '/');
        if (!SONG_FILE.test(path) || !path.includes(`/${songsDir}/`)) return;
        if (path.includes(`/${songsDir}/${PRIVATE_FOLDER}/`)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', changed);
      server.watcher.on('change', changed);
      server.watcher.on('unlink', changed);
    },
  };
}
