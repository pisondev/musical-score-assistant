import {
  categoryName,
  compareCategories,
  compareSubcategories,
  HYMNALS,
  hymnalName,
  songReference,
  subcategoryName,
} from '../core';
import type { SongEntry } from '../library';
import type { OpenedSong } from '../store/history';

export type SongSort = 'recent' | 'title' | 'number';
export type SongFilter = 'all' | 'favourites';

/** The category that holds the hymnals. */
export const CHRISTIAN = 'christian';

export interface LibraryView {
  query: string;
  filter: SongFilter;
  /** A category, or null for every song. */
  category: string | null;
  /** A subcategory of that category, or null for the whole category. */
  subcategory: string | null;
  sort: SongSort;
  favourites: readonly string[];
  opened: Readonly<Record<string, OpenedSong>>;
}

/** The songs of one subcategory, such as a hymnal or a composer. */
export interface SubcategoryGroup {
  /** A hymnal code ("KK"), or the subcategory itself ("Bach", "Hymns"). */
  id: string;
  /** The full name: the name of a hymnal, or the subcategory itself. */
  name: string;
  songs: SongEntry[];
}

/** The songs of one category, with its subcategories. */
export interface CategoryGroup {
  id: string;
  name: string;
  songs: SongEntry[];
  subcategories: SubcategoryGroup[];
}

function matches(entry: SongEntry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const { meta, placement } = entry;
  const text = [
    meta.title,
    songReference(meta),
    hymnalName(meta.book),
    meta.composer,
    meta.lyricist,
    categoryName(placement.category),
    subcategoryName(placement.subcategory),
    ...entry.summary.styles,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((word) => text.includes(word));
}

/** Hymnal numbers sort by value; songs without a number come last. */
function numberOf(entry: SongEntry): number {
  const value = Number.parseInt(entry.meta.number ?? '', 10);
  return Number.isNaN(value) ? Infinity : value;
}

/**
 * The songs to list on the home page: those that match the search, the category, the
 * subcategory, and the filter, in the chosen order. Ties fall back to the title.
 */
export function selectSongs(entries: readonly SongEntry[], view: LibraryView): SongEntry[] {
  const byTitle = (a: SongEntry, b: SongEntry) => a.meta.title.localeCompare(b.meta.title);
  const openedAt = (entry: SongEntry) => view.opened[entry.id]?.openedAt ?? 0;

  return entries
    .filter((entry) => view.filter === 'all' || view.favourites.includes(entry.id))
    .filter((entry) => view.category === null || entry.placement.category === view.category)
    .filter(
      (entry) => view.subcategory === null || entry.placement.subcategory === view.subcategory,
    )
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
 * The categories to offer, each with its subcategories and the songs they hold, in the order
 * of the library. With `hymnals`, for the owner of the licensed hymnals, Christian lists every
 * known hymnal, empty or not; everybody else sees only what holds a song. The songs keep the
 * order they are given in.
 */
export function groupByCategory(
  entries: readonly SongEntry[],
  { hymnals = false }: { hymnals?: boolean } = {},
): CategoryGroup[] {
  const categories = new Set(entries.map((entry) => entry.placement.category));
  if (hymnals) categories.add(CHRISTIAN);

  return [...categories].sort(compareCategories).map((category) => {
    const songs = entries.filter((entry) => entry.placement.category === category);
    const subcategories = new Set(songs.map((entry) => entry.placement.subcategory));
    if (hymnals && category === CHRISTIAN) {
      for (const hymnal of HYMNALS) subcategories.add(hymnal.code);
    }
    return {
      id: category,
      name: categoryName(category),
      songs,
      subcategories: [...subcategories].sort(compareSubcategories).map((subcategory) => ({
        id: subcategory,
        name: subcategoryName(subcategory),
        songs: songs.filter((entry) => entry.placement.subcategory === subcategory),
      })),
    };
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
