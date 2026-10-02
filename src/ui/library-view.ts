import { HYMNALS, hymnalName, songReference } from '../core/hymnals';
import type { SongEntry } from '../library';
import type { OpenedSong } from '../store/history';

export type SongSort = 'recent' | 'title' | 'number';
export type SongFilter = 'all' | 'favourites';

/** The "hymnal" of the songs that name none. */
export const NO_BOOK = '';

export interface LibraryView {
  query: string;
  filter: SongFilter;
  /** A hymnal code, `NO_BOOK` for songs without one, or null for every song. */
  book: string | null;
  sort: SongSort;
  favourites: readonly string[];
  opened: Readonly<Record<string, OpenedSong>>;
}

/** Songs of one hymnal, as a section of the home page. */
export interface HymnalGroup {
  /** The hymnal code, or `NO_BOOK`. */
  code: string;
  /** The full name of the hymnal; the code itself when the library does not know it. */
  name: string;
  songs: SongEntry[];
}

const bookOf = (entry: SongEntry) => entry.bundle.song.meta.book ?? NO_BOOK;

function matches(entry: SongEntry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const { meta } = entry.bundle.song;
  const text = [
    meta.title,
    songReference(meta),
    hymnalName(meta.book),
    meta.composer,
    meta.lyricist,
    ...entry.summary.styles,
  ]
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
 * The songs to list on the home page: those that match the search, the
 * hymnal, and the filter, in the chosen order. Ties fall back to the title.
 */
export function selectSongs(entries: readonly SongEntry[], view: LibraryView): SongEntry[] {
  const byTitle = (a: SongEntry, b: SongEntry) =>
    a.bundle.song.meta.title.localeCompare(b.bundle.song.meta.title);
  const openedAt = (entry: SongEntry) => view.opened[entry.id]?.openedAt ?? 0;

  return entries
    .filter((entry) => view.filter === 'all' || view.favourites.includes(entry.id))
    .filter((entry) => view.book === null || bookOf(entry) === view.book)
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

/**
 * The hymnals to offer, each with the songs it holds: the known hymnals first,
 * whether they have songs or not, then any other code that occurs, then the
 * songs without a hymnal. The songs keep the order they are given in.
 */
export function groupByHymnal(entries: readonly SongEntry[]): HymnalGroup[] {
  const known = HYMNALS.map((hymnal) => hymnal.code);
  const others = [...new Set(entries.map(bookOf))]
    .filter((code) => code !== NO_BOOK && !known.includes(code))
    .sort();
  const codes = [...known, ...others];
  if (entries.some((entry) => bookOf(entry) === NO_BOOK)) codes.push(NO_BOOK);

  return codes.map((code) => ({
    code,
    name: code === NO_BOOK ? 'Other songs' : (hymnalName(code) ?? code),
    songs: entries.filter((entry) => bookOf(entry) === code),
  }));
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
