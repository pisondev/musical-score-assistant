import { HYMNALS, hymnalName } from './hymnals.ts';
import type { SongMeta } from './types.ts';

/** A category of the library, such as Christian or Classical. */
export interface Category {
  /** The id written in the header of a song, such as "classical". */
  id: string;
  name: string;
}

/** The categories the library knows, in the order they are listed. */
export const CATEGORIES: readonly Category[] = [
  { id: 'christian', name: 'Christian' },
  { id: 'classical', name: 'Classical' },
  { id: 'traditional', name: 'Traditional' },
  { id: 'other', name: 'Other' },
];

/** The category of a song whose header names none and that comes from no hymnal. */
export const DEFAULT_CATEGORY = 'other';

/** The subcategory of Christian songs that come from no hymnal. */
export const HYMNS = 'Hymns';

/** The subcategory of songs in any other category whose header names none. */
export const GENERAL = 'General';

/** Where a song is listed: its category and, inside it, its subcategory. */
export interface Placement {
  category: string;
  /**
   * A hymnal code ("KK") for a song from a hymnal; otherwise the subcategory of the header,
   * such as a composer ("Bach"), or `HYMNS` or `GENERAL` when it names none.
   */
  subcategory: string;
}

/** Writes a category the way it is compared: lower case, without surrounding spaces. */
export function normalizeCategory(text: string): string {
  return text.trim().toLowerCase();
}

/** True for a category the library knows. */
export function isKnownCategory(id: string): boolean {
  return CATEGORIES.some((category) => category.id === id);
}

/**
 * Where a song is listed. Every hymnal is a subcategory of Christian, so a song that names a
 * hymnal is listed there whatever its header says about the category.
 */
export function placeSong(meta: Pick<SongMeta, 'book' | 'category' | 'subcategory'>): Placement {
  if (meta.book) return { category: 'christian', subcategory: meta.book };
  const category = meta.category ?? DEFAULT_CATEGORY;
  const subcategory = meta.subcategory ?? (category === 'christian' ? HYMNS : GENERAL);
  return { category, subcategory };
}

/** The name of a category; an id the library does not know is shown with a capital. */
export function categoryName(id: string): string {
  const known = CATEGORIES.find((category) => category.id === id);
  return known ? known.name : id.charAt(0).toUpperCase() + id.slice(1);
}

/** The full name of a subcategory: the name of a hymnal, or the subcategory itself. */
export function subcategoryName(subcategory: string): string {
  return hymnalName(subcategory) ?? subcategory;
}

/** Categories in the order of `CATEGORIES`; unknown ones after them, alphabetically. */
export function compareCategories(first: string, second: string): number {
  const rank = (id: string) => {
    const index = CATEGORIES.findIndex((category) => category.id === id);
    return index < 0 ? CATEGORIES.length : index;
  };
  return rank(first) - rank(second) || first.localeCompare(second);
}

/**
 * Subcategories in the order they are listed: the hymnals in the order of `HYMNALS`, then the
 * rest alphabetically, with the songs that name no subcategory last.
 */
export function compareSubcategories(first: string, second: string): number {
  const rank = (subcategory: string) => {
    const hymnal = HYMNALS.findIndex((candidate) => candidate.code === subcategory);
    if (hymnal >= 0) return hymnal;
    return subcategory === HYMNS || subcategory === GENERAL ? HYMNALS.length + 2 : HYMNALS.length;
  };
  return rank(first) - rank(second) || first.localeCompare(second);
}
