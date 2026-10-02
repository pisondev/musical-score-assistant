import type { SongEntry } from '../library';
import type { OpenedSong } from '../store/history';

export type SongSort = 'recent' | 'title' | 'number';
export type SongFilter = 'all' | 'favourites';

export interface LibraryView {
  query: string;
  filter: SongFilter;
  sort: SongSort;
  favourites: readonly string[];
  opened: Readonly<Record<string, OpenedSong>>;
}

function matches(entry: SongEntry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const { meta } = entry.bundle.song;
  const text = [meta.title, meta.number, meta.composer, meta.lyricist, ...entry.summary.styles]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((word) => text.includes(word));
}

/** Hymnal numbers sort by value; songs without a number come last. */
function numberOf(entry: SongEntry): number {
  const value = Number.parseInt(entry.bundle.song.meta.number ?? '', 10);
  return Number.isNaN(value) ? Infinity : value;
}

/**
 * The songs to list on the home page: those that match the search and the
 * filter, in the chosen order. Ties fall back to the title.
 */
export function selectSongs(entries: readonly SongEntry[], view: LibraryView): SongEntry[] {
  const byTitle = (a: SongEntry, b: SongEntry) =>
    a.bundle.song.meta.title.localeCompare(b.bundle.song.meta.title);
  const openedAt = (entry: SongEntry) => view.opened[entry.id]?.openedAt ?? 0;

  return entries
    .filter((entry) => view.filter === 'all' || view.favourites.includes(entry.id))
    .filter((entry) => matches(entry, view.query))
    .sort((a, b) => {
      if (view.sort === 'recent') return openedAt(b) - openedAt(a) || byTitle(a, b);
      if (view.sort === 'number') {
        const [first, second] = [numberOf(a), numberOf(b)];
        return (first === second ? 0 : first < second ? -1 : 1) || byTitle(a, b);
      }
      return byTitle(a, b);
    });
}

/** The song that was opened most recently, if it still exists. */
export function lastOpened(
  entries: readonly SongEntry[],
  opened: Readonly<Record<string, OpenedSong>>,
): SongEntry | null {
  let latest: SongEntry | null = null;
  for (const entry of entries) {
    const at = opened[entry.id]?.openedAt;
    if (at !== undefined && (latest === null || at > opened[latest.id].openedAt)) latest = entry;
  }
  return latest;
}
