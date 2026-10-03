import { mkdirSync } from 'node:fs';
import type { Plugin, ViteDevServer } from 'vite';
import { createApi, type ApiHandler } from '../server/api.ts';
import { AppDatabase } from '../server/database.ts';
import { FileStore } from '../server/object-store.ts';
import { PRIVATE_FOLDER } from '../server/private-songs.ts';
import { folderCatalog } from '../server/song-catalog.ts';

/**
 * The API of the app inside the development and the preview server. This
 * computer is the owner: nobody signs in, private songs come straight from
 * `songs/private`, notes are written next to `song.txt`, and the users and the
 * state of the account are kept in `.local/data/app.db`.
 */
const DATA_DIR = '.local/data';

export function devApiPlugin(songsDir = 'songs'): Plugin {
  // The database is opened only when a development or preview server starts, never by a build;
  // it needs `node:sqlite`, which `npm run dev` provides.
  let api: ApiHandler | null = null;
  const startApi = () => {
    if (!api) {
      mkdirSync(DATA_DIR, { recursive: true });
      api = createApi({
        catalog: folderCatalog(songsDir),
        notes: new FileStore(songsDir),
        database: new AppDatabase(`${DATA_DIR}/app.db`),
        earlierState: new FileStore(DATA_DIR),
        localOwner: { email: 'owner@localhost', name: 'This computer' },
      });
    }
    return api;
  };

  // Private songs are fetched, not imported, so Vite does not know to reload the page.
  const reloadOnPrivateSongs = (server: ViteDevServer) => {
    const folder = `${songsDir}/${PRIVATE_FOLDER}`;
    server.watcher.add(folder);
    server.watcher.on('change', (file) => {
      const path = file.replaceAll('\\', '/');
      if (path.includes(`/${folder}/`) && /\/(song\.txt|arrangements\.json)$/.test(path)) {
        server.ws.send({ type: 'full-reload' });
      }
    });
  };

  return {
    name: 'dev-api',
    configureServer(server) {
      // Vitest runs a server in the mode "test"; the tests start an API of their own.
      if (server.config.mode === 'test') return;
      server.middlewares.use(startApi());
      reloadOnPrivateSongs(server);
    },
    configurePreviewServer(server) {
      server.middlewares.use(startApi());
    },
  };
}
