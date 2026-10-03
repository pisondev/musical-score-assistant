import type { SongBundle } from './bundle.ts';
import { placeSong, type Placement } from './categories.ts';
import { summarizeSong, type SongSummary } from './summary.ts';
import type { SongMeta } from './types.ts';

/**
 * What the library knows of a song before it is opened: enough to list, search, sort, and
 * place it, without its measures. The home page works from these entries alone, and the full
 * song is loaded when it is opened, so the library can grow to hundreds of songs.
 */
export interface SongIndexEntry {
  /** Folder path relative to songs/, e.g. "amazing-grace" or "private/kk-1-title". */
  id: string;
  /** True for songs under songs/private: licensed, and handed to the owner only. */
  isPrivate: boolean;
  meta: SongMeta;
  placement: Placement;
  summary: SongSummary;
  /** The left hands by id, so that "continue practising" can name the one last used. */
  arrangements: { id: string; name: string }[];
}

export const PRIVATE_PREFIX = 'private/';

/** The index entry of a parsed song. */
export function indexSong(id: string, bundle: SongBundle): SongIndexEntry {
  return {
    id,
    isPrivate: id.startsWith(PRIVATE_PREFIX),
    meta: bundle.song.meta,
    placement: placeSong(bundle.song.meta),
    summary: summarizeSong(bundle),
    arrangements: bundle.arrangements.map(({ id: arrangementId, name }) => ({
      id: arrangementId,
      name,
    })),
  };
}

/** True for a value that has the shape of an index entry, as an answer of the server must. */
export function isIndexEntry(value: unknown): value is SongIndexEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<SongIndexEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.isPrivate === 'boolean' &&
    typeof entry.meta?.title === 'string' &&
    typeof entry.placement?.category === 'string' &&
    typeof entry.placement.subcategory === 'string' &&
    typeof entry.summary?.measures === 'number' &&
    Array.isArray(entry.arrangements)
  );
}
