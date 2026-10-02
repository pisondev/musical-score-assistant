import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
