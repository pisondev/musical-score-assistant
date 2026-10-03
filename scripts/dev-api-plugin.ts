import type { Plugin, ViteDevServer } from 'vite';
import { createApi } from '../server/api.ts';
import { FileStore } from '../server/object-store.ts';
import { PRIVATE_FOLDER } from '../server/private-songs.ts';
import { folderCatalog } from '../server/song-catalog.ts';

/**
 * The API of the app inside the development and the preview server. This
 * computer is the owner: nobody signs in, private songs come straight from
 * `songs/private`, notes are written next to `song.txt`, and the state of the
 * account is kept in `.local/data`.
 */
export function devApiPlugin(songsDir = 'songs'): Plugin {
  const api = createApi({
    catalog: folderCatalog(songsDir),
    notes: new FileStore(songsDir),
    state: new FileStore('.local/data'),
    localOwner: { email: 'owner@localhost', name: 'This computer' },
  });

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
      server.middlewares.use(api);
      reloadOnPrivateSongs(server);
    },
    configurePreviewServer(server) {
      server.middlewares.use(api);
    },
  };
}
