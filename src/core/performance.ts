import { chordAt, chordTimeline } from './arrangement';
import type { SongBundle } from './bundle';
import { INTRO_ID_PREFIX } from './intro';
import { transpose } from './transpose';
import { INTRO_LAST_PHRASE } from './types';
import type {
  Arrangement,
  ArrangementMeasure,
  DynamicMark,
  IntroChoice,
  Issue,
  Measure,
  Slot,
  Song,
} from './types';

/**
 * What is actually shown and played: the song with the chosen arrangement,
 * optionally preceded by an introduction and moved to another key.
 */
export interface Performance {
  song: Song;
  arrangement: Arrangement;
  /** Number of introduction measures at the start of `song.measures`. */
  introMeasures: number;
}

function copySlots(slots: Slot[]): Slot[] {
  return slots.map((slot) => ({ ...slot, id: `${INTRO_ID_PREFIX}${slot.id}`, lyric: undefined }));
}

/** Copies the closing phrase of the song, with the chosen left hand, as an introduction. */
function lastPhraseIntro(
  bundle: SongBundle,
  arrangement: Arrangement,
): { measures: Measure[]; parts: ArrangementMeasure[] } {
  const { song } = bundle;
  const start = bundle.intro.lastPhraseStart;
  const harmony = chordTimeline(
    song.measures.map((measure, index) => ({
      startTick: measure.startTick,
      chords: arrangement.measures[index].chords,
    })),
  );
  const hasDynamics = song.measures.some((measure) => measure.dynamics.length > 0);

  const measures: Measure[] = [];
  const parts: ArrangementMeasure[] = [];
  song.measures.slice(start).forEach((measure, offset) => {
    const part = arrangement.measures[start + offset];
    const chords = part.chords.map((chord) => ({ ...chord }));
    // The phrase may begin in the middle of a chord; name that chord at its start.
    if (offset === 0 && !chords.some((chord) => chord.start === 0)) {
      const inForce = chordAt(harmony, measure.startTick);
      if (inForce) {
        chords.unshift({ start: 0, symbol: inForce.symbol, recognized: inForce.chord !== null });
      }
    }
    const dynamics: DynamicMark[] = offset === 0 && hasDynamics ? [{ start: 0, sign: 'mf' }] : [];

    measures.push({
      ...measure,
      number: null,
      part: 'intro',
      section: undefined,
      slots: copySlots(measure.slots),
      chords: [],
      dynamics,
      barline: 'single',
    });
    parts.push({ slots: copySlots(part.slots), chords });
  });
  return { measures, parts };
}

function shiftIssues(issues: Issue[], offset: number): Issue[] {
  return offset === 0
    ? issues
    : issues.map((issue) =>
        issue.measure === undefined ? issue : { ...issue, measure: issue.measure + offset },
      );
}

/** Assembles the measures to show and play for the current settings. */
export function buildPerformance(
  bundle: SongBundle,
  arrangement: Arrangement,
  intro: IntroChoice,
  semitones: number,
): Performance {
  const { song } = bundle;
  let introMeasures: Measure[] = [];
  let introParts: ArrangementMeasure[] = [];
  let introIssues: Issue[] = [];

  const written = bundle.intro.written.find((candidate) => candidate.id === intro);
  if (written) {
    introMeasures = written.measures;
    introParts = written.parts;
    introIssues = written.issues;
  } else if (intro === INTRO_LAST_PHRASE) {
    ({ measures: introMeasures, parts: introParts } = lastPhraseIntro(bundle, arrangement));
  }

  const count = introMeasures.length;
  let startTick = 0;
  const measures = [...introMeasures, ...song.measures].map((measure, index) => {
    const placed = { ...measure, index, startTick };
    startTick += measure.length;
    return placed;
  });

  const composed: Song = {
    ...song,
    measures,
    totalTicks: startTick,
    issues: [...introIssues, ...shiftIssues(song.issues, count)],
  };
  const composedArrangement: Arrangement = {
    ...arrangement,
    measures: [...introParts, ...arrangement.measures],
    issues: shiftIssues(arrangement.issues, count),
  };

  return { ...transpose(composed, composedArrangement, semitones), introMeasures: count };
}
