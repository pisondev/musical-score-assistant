/** The index of the public songs, made at build time by `scripts/song-index-plugin.ts`. */
declare module 'virtual:song-index' {
  import type { SongIndexEntry } from './core/song-index';

  const entries: SongIndexEntry[];
  export default entries;
}
