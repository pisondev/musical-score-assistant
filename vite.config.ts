import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { notesPlugin } from './scripts/notes-plugin.ts';

export default defineConfig({
  // The notes plugin lets the app save the player's notes on measures into the song folders.
  plugins: [react(), notesPlugin()],
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
