import type { SongMeta } from './types.ts';

/** A hymnal that songs are taken from, known by a short code. */
export interface Hymnal {
  /** The code written in the header of a song, such as "PKJ". */
  code: string;
  name: string;
}

/** The hymnals the library knows by name, in the order they are listed. */
export const HYMNALS: readonly Hymnal[] = [
  { code: 'KK', name: 'Kidung Keesaan' },
  { code: 'PKJ', name: 'Pelengkap Kidung Jemaat' },
  { code: 'KJ', name: 'Kidung Jemaat' },
  { code: 'KPJ', name: 'Kidung Pasamuwan Jawi' },
];

/** Writes a hymnal code the way it is compared and shown: upper case, without spaces. */
export function normalizeBook(text: string): string {
  return text.replace(/\s+/g, '').toUpperCase();
}

/** The full name of a hymnal, or null for a code the library does not know. */
export function hymnalName(code: string | undefined): string | null {
  return HYMNALS.find((hymnal) => hymnal.code === code)?.name ?? null;
}

/** How a song is cited: "PKJ 184", or whichever of the two parts it has. */
export function songReference(meta: Pick<SongMeta, 'book' | 'number'>): string {
  return [meta.book, meta.number].filter(Boolean).join(' ');
}
