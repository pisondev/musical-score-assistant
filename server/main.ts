import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createApi } from './api.ts';
import { startBackups } from './backup.ts';
import { readServerConfig } from './config.ts';
import { AppDatabase } from './database.ts';
import { FileStore, scopedStore, type ObjectStore } from './object-store.ts';
import { R2Store } from './r2-store.ts';
import { folderCatalog, storeCatalog, type SongCatalog } from './song-catalog.ts';
import { serveStatic } from './static-files.ts';

/**
 * The production server: the API under `/api` and the built site for
 * everything else. It sits behind nginx and Cloudflare, which handle HTTPS.
 *
 * The users and what the app remembers for them live in a SQLite database in
 * the data folder (`app.db`). With R2 configured, the private songs come from
 * the bucket (`songs/`), the owner's notes are kept there (`notes/`), and a
 * copy of the database goes there every day (`backups/`). Without R2, songs
 * and notes are kept on disk below the songs and the data folder.
 */

const config = readServerConfig();
for (const warning of config.warnings) console.warn(`Warning: ${warning}`);

mkdirSync(config.dataDir, { recursive: true });
const database = new AppDatabase(join(config.dataDir, 'app.db'));

let catalog: SongCatalog;
let notes: ObjectStore;
// Where the state of accounts was kept before the database; it moves over when it is read.
let earlierState: ObjectStore;
if (config.r2) {
  const bucket = new R2Store(config.r2);
  catalog = storeCatalog(config.songsDir, scopedStore(bucket, 'songs'));
  notes = scopedStore(bucket, 'notes');
  earlierState = bucket;
  startBackups(database, bucket, config.dataDir);
} else {
  catalog = folderCatalog(config.songsDir);
  notes = new FileStore(join(config.dataDir, 'notes'));
  earlierState = new FileStore(config.dataDir);
}

const api = createApi({
  catalog,
  notes,
  database,
  earlierState,
  google: config.google ?? undefined,
});

const server = createServer((request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  // A request that trips over a mistake answers with an error; it never stops the server.
  try {
    api(request, response, () => serveStatic(config.staticDir, request, response));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.statusCode = 500;
    response.end();
  }
});

server.listen(config.port, config.host, () => {
  const storage = config.r2 ? `R2 bucket ${config.r2.bucket}` : `disk (${config.dataDir})`;
  console.log(
    `Musical Score Assistant listening on http://${config.host}:${config.port}, storage: ${storage}, ${database.countUsers()} users`,
  );
});

// Docker stops a container with SIGTERM; finish the requests in flight, then leave.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () =>
    server.close(() => {
      database.close();
      process.exit(0);
    }),
  );
}
