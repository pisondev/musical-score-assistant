import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { devApiPlugin } from './scripts/dev-api-plugin.ts';
import { serviceWorkerPlugin } from './scripts/service-worker-plugin.ts';
import { songIndexPlugin } from './scripts/song-index-plugin.ts';

export default defineConfig({
  // The API of the app (private songs, notes, the state of the account), with this computer as
  // the owner; the production server mounts the same API behind a Google sign-in.
  // The index of the public songs is made from songs/ at build time (`virtual:song-index`), and
  // the built site also gets the service worker of the installed app (`sw.js`).
  plugins: [react(), devApiPlugin(), songIndexPlugin(), serviceWorkerPlugin()],
  // Relative asset paths let the static build be served from any sub-path.
  base: './',
  build: {
    // The staff-notation engraver is one large WebAssembly chunk, loaded only on demand.
    chunkSizeWarningLimit: 9000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});
