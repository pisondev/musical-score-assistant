import { INTRO_LAST_PHRASE, INTRO_OFF, type IntroChoice, type SongBundle } from '../core';

/** Name of an introduction as shown on the toolbar and above the sheet. */
export function introName(bundle: SongBundle, intro: IntroChoice): string {
  if (intro === INTRO_OFF) return 'Off';
  if (intro === INTRO_LAST_PHRASE) return 'Last phrase';
  return bundle.intro.written.find((written) => written.id === intro)?.name ?? 'Off';
}
