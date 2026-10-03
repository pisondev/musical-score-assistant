/**
 * The piano samples. The engine plays them, and the service worker fetches them ahead of time
 * so that an installed app can play without a connection; both take the names from here.
 */

/** One sample every three semitones; the sampler pitch-shifts the notes in between. */
export const SAMPLE_NOTES = [
  'A1',
  'C2',
  'D#2',
  'F#2',
  'A2',
  'C3',
  'D#3',
  'F#3',
  'A3',
  'C4',
  'D#4',
  'F#4',
  'A4',
  'C5',
  'D#5',
  'F#5',
  'A5',
  'C6',
];

/** The folder of the samples, relative to the root of the site. */
export const SAMPLE_FOLDER = 'samples/piano/';

/**
 * The samples have no hash in their names, and browsers and Cloudflare keep them for a month.
 * Raising the version makes every one of them fetch the files afresh.
 */
export const SAMPLE_VERSION = 1;

/** The file of one sample, relative to `SAMPLE_FOLDER`. */
export function sampleFile(note: string): string {
  return `${note.replace('#', 's')}.mp3?v=${SAMPLE_VERSION}`;
}
