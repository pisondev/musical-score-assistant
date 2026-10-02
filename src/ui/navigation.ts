/** Name of the hash parameter that carries the song, as in "#song=amazing-grace". */
export const SONG_PARAMETER = 'song';

/** The address of a song page. Without a song in the address the app shows the home page. */
export function songHref(songId: string): string {
  return `#${SONG_PARAMETER}=${encodeURIComponent(songId)}`;
}

/** The song the address asks for, or null when it names none. */
export function songIdFromLocation(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get(SONG_PARAMETER);
}
