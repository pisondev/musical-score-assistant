import { chordAt, chordTimeline } from './arrangement';
import type { SongBundle } from './bundle';
import { INTRO_ID_PREFIX } from './intro';
import { formatNoteName } from './notes';
import { applyRightHand, availableRightHand, chordsApply, composeRightHand } from './right-hand';
import { beatTicks, measureTicks } from './time';
import { keyShift, transposeMeasures } from './transpose';
import { ENDING_OFF, INTRO_LAST_PHRASE } from './types';
import type {
  Arrangement,
  ArrangementMeasure,
  DynamicMark,
  EndingChoice,
  IntroChoice,
  Issue,
  Measure,
  MeasurePart,
  NoteName,
  Passage,
  RightHandMode,
  Slot,
  SlotKind,
  Song,
} from './types';

/** A stretch of a performance that the sheet shows as a block of its own. */
export interface PerformanceSection {
  kind: MeasurePart;
  /** Heading of the block, such as "Intro". */
  title: string;
  /** What the heading adds: the name of the introduction, or the key of a repeat. */
  detail: string;
  /** Index of the first measure, and how many measures follow from there. */
  start: number;
  count: number;
  /** The key the section is in. */
  key: NoteName;
  /** 1 for the first time through the song, 2 for the repeat in the lifted key. */
  pass: 1 | 2;
}

/** What surrounds the song beyond its introduction. */
export interface PerformanceForm {
  /** The ending after the last measure; `ENDING_OFF` or missing for none. */
  ending?: EndingChoice;
  /** Half steps by which the key rises for a repeat of the song; 0 or missing for no repeat. */
  lift?: number;
  /** Puts the written chords under the melody notes, in the modes that play the melody. */
  chords?: boolean;
}

/**
 * What is actually shown and played: the song with the chosen arrangement and
 * right-hand part, moved to the chosen key, optionally preceded by an
 * introduction, repeated a step higher after an interlude, and closed by an
 * ending.
 */
export interface Performance {
  song: Song;
  arrangement: Arrangement;
  /** The blocks of the performance in order; together they cover every measure. */
  sections: PerformanceSection[];
  /** Number of introduction measures at the start of `song.measures`. */
  introMeasures: number;
  /** What the right hand plays; "melody" when the arrangement has no part for the request. */
  rightHand: RightHandMode;
  /** Whether the melody carries the written chords under it. */
  chords: boolean;
}

/** How one measure of a performance is referred to. */
export interface MeasureName {
  /** Written above the measure: its number, or a counter within its section. */
  label: string;
  /** For a menu: "5", "Pickup", "Intro 2", "5 (repeat)". */
  short: string;
  /** For a readout: "m. 5", "Intro 2". */
  position: string;
  /** Spoken in full: "Measure 5", "Intro measure 2". */
  long: string;
}

/** Measures that belong together, with the left hand that goes with them. */
interface Chunk {
  measures: Measure[];
  parts: ArrangementMeasure[];
  /** Problems of these measures, indexed from the first of them. */
  issues: Issue[];
  /** Problems of the left hand of these measures, indexed the same way. */
  arrangementIssues: Issue[];
  /** True for the song itself, whose first measure may be a pickup. */
  isSong: boolean;
}

interface Block {
  kind: MeasurePart;
  title: string;
  detail: string;
  pass: 1 | 2;
  chunks: Chunk[];
}

/** Prefix that keeps the ids of the second time through apart from those of the first. */
const REPEAT_ID_PREFIX = 'p2-';

function copySlots(slots: Slot[]): Slot[] {
  return slots.map((slot) => ({ ...slot, id: `${INTRO_ID_PREFIX}${slot.id}`, lyric: undefined }));
}

/**
 * Copies the closing phrase of the song, with the chosen left hand, as an
 * introduction. `tune` is the song as the right hand plays its melody: plain,
 * or with the chords under it.
 */
function lastPhraseIntro(bundle: SongBundle, arrangement: Arrangement, tune: Song): Chunk {
  const song = tune;
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
  return { measures, parts, issues: [], arrangementIssues: [], isSong: false };
}

function passageChunk(passage: Passage): Chunk {
  return {
    measures: passage.measures,
    parts: passage.parts,
    issues: passage.issues,
    arrangementIssues: [],
    isSong: false,
  };
}

/** What leads into the song: a written introduction, or the last phrase and its bridge. */
function leadIn(
  bundle: SongBundle,
  arrangement: Arrangement,
  intro: IntroChoice,
  tune: Song,
): { name: string; chunks: Chunk[] } {
  const written = bundle.intro.written.find((candidate) => candidate.id === intro);
  if (written) return { name: written.name, chunks: [passageChunk(written)] };
  if (intro !== INTRO_LAST_PHRASE) return { name: '', chunks: [] };

  const chunks = [lastPhraseIntro(bundle, arrangement, tune)];
  if (bundle.intro.bridge) chunks.push(passageChunk(bundle.intro.bridge));
  return { name: 'Last phrase', chunks };
}

function renameSlots(slots: Slot[], prefix: string): Slot[] {
  return slots.map((slot) => ({ ...slot, id: `${prefix}${slot.id}` }));
}

/**
 * Measures for the second time through, with ids of their own. When they were
 * already played the first time, their problems and explanations are not
 * repeated: both are listed with the first appearance.
 */
function repeatChunk(chunk: Chunk, playedBefore: boolean): Chunk {
  return {
    ...chunk,
    measures: chunk.measures.map((measure) => ({
      ...measure,
      slots: renameSlots(measure.slots, REPEAT_ID_PREFIX),
      voice: measure.voice && renameSlots(measure.voice, REPEAT_ID_PREFIX),
      fills: measure.fills && renameSlots(measure.fills, REPEAT_ID_PREFIX),
    })),
    parts: chunk.parts.map((part) => ({
      ...part,
      slots: renameSlots(part.slots, REPEAT_ID_PREFIX),
      note: playedBefore ? undefined : part.note,
      rightNote: playedBefore ? undefined : part.rightNote,
    })),
    issues: playedBefore ? [] : chunk.issues,
    arrangementIssues: playedBefore ? [] : chunk.arrangementIssues,
  };
}

/** Extends a row of slots to the end of a full measure, one symbol for each beat. */
function completeSlots(
  slots: Slot[],
  from: number,
  to: number,
  beat: number,
  kind?: SlotKind,
): Slot[] {
  const last = slots[slots.length - 1];
  if (!last) return slots;
  const added: Slot[] = [];
  for (let start = from; start < to; start += beat) {
    added.push({
      id: `${last.id}-x${added.length}`,
      kind: kind ?? (last.kind === 'rest' ? 'rest' : 'hold'),
      start,
      duration: Math.min(beat, to - start),
      pitches: [],
      beat: Math.floor(start / beat),
      beams: 0,
    });
  }
  return [...slots, ...added];
}

/**
 * Fills up a measure that was cut short for the pickup of the song. Such a
 * measure is only right when the pickup follows; before anything else its
 * last notes are held to the end of the bar, so the meter stays intact.
 */
function completeLastMeasure(chunk: Chunk, full: number, beat: number): Chunk {
  const index = chunk.measures.length - 1;
  const measure = chunk.measures[index];
  if (!measure || measure.length >= full) return chunk;

  const from = measure.length;
  const measures = [...chunk.measures];
  measures[index] = {
    ...measure,
    length: full,
    slots: completeSlots(measure.slots, from, full, beat),
    voice: measure.voice && completeSlots(measure.voice, from, full, beat),
    fills: measure.fills && completeSlots(measure.fills, from, full, beat, 'rest'),
  };
  const parts = [...chunk.parts];
  parts[index] = { ...parts[index], slots: completeSlots(parts[index].slots, from, full, beat) };
  return { ...chunk, measures, parts };
}

function shiftIssues(issues: Issue[], offset: number): Issue[] {
  return offset === 0
    ? issues
    : issues.map((issue) =>
        issue.measure === undefined ? issue : { ...issue, measure: issue.measure + offset },
      );
}

function liftName(semitones: number): string {
  if (semitones === 1) return 'up a half step';
  if (semitones === 2) return 'up a whole step';
  return `up ${semitones} half steps`;
}

/**
 * Assembles the measures to show and play for the current settings. The
 * right-hand mode applies to the song only: introductions, the interlude, and
 * endings are instrumental and always carry their own right hand.
 *
 * With a lift, the song is played twice: after the first time an interlude
 * (the written key lift, then the introduction again) leads into a repeat
 * that many half steps higher, and the ending follows in the new key.
 */
export function buildPerformance(
  bundle: SongBundle,
  arrangement: Arrangement,
  intro: IntroChoice,
  semitones: number,
  rightHand: RightHandMode = 'melody',
  form: PerformanceForm = {},
): Performance {
  const mode = availableRightHand(arrangement, rightHand);
  const chords = chordsApply(arrangement, mode, form.chords ?? false);
  const { song, arrangement: played } = applyRightHand(bundle.song, arrangement, mode, chords);
  // The last phrase is instrumental: it carries the tune, with its chords when they are on.
  const harmony = arrangement.rightHand.harmony;
  const tune =
    harmony && (form.chords ?? false)
      ? composeRightHand(bundle.song, arrangement, harmony).song
      : bundle.song;
  const beat = beatTicks(song.meta.time);
  const full = measureTicks(song.meta.time);
  const lift = Math.max(0, Math.round(form.lift ?? 0));
  const ending =
    form.ending && form.ending !== ENDING_OFF
      ? bundle.endings.find((candidate) => candidate.id === form.ending)
      : undefined;

  const keyOf = (pass: 1 | 2) => {
    const shift = semitones + (pass === 2 ? lift : 0);
    return shift === 0 ? song.meta.key : keyShift(song.meta.key, shift).key;
  };
  const keyName = (pass: 1 | 2) => `1 = ${formatNoteName(keyOf(pass))}`;

  const opening = leadIn(bundle, arrangement, intro, tune);
  const songChunk: Chunk = {
    measures: song.measures,
    parts: played.measures,
    issues: song.issues,
    arrangementIssues: played.issues,
    isSong: true,
  };

  const blocks: Block[] = [];
  if (opening.chunks.length > 0) {
    blocks.push({
      kind: 'intro',
      title: 'Intro',
      detail: opening.name,
      pass: 1,
      chunks: opening.chunks,
    });
  }
  blocks.push({
    kind: 'song',
    title: 'Song',
    detail: lift > 0 ? keyName(1) : '',
    pass: 1,
    chunks: [songChunk],
  });
  if (lift > 0) {
    const interlude = [
      ...(bundle.modulation ? [repeatChunk(passageChunk(bundle.modulation), false)] : []),
      ...opening.chunks.map((chunk) => repeatChunk(chunk, true)),
    ];
    if (interlude.length > 0) {
      blocks.push({
        kind: 'interlude',
        title: 'Interlude',
        detail: `${liftName(lift)}, to ${keyName(2)}`,
        pass: 2,
        chunks: interlude,
      });
    }
    blocks.push({
      kind: 'song',
      title: 'Song, repeated',
      detail: keyName(2),
      pass: 2,
      chunks: [repeatChunk(songChunk, true)],
    });
  }
  if (ending) {
    blocks.push({
      kind: 'ending',
      title: 'Ending',
      detail: ending.name,
      pass: lift > 0 ? 2 : 1,
      chunks: [passageChunk(ending)],
    });
  }

  // A measure cut short for the pickup is completed wherever the pickup does not follow.
  const sequence = blocks.flatMap((block) => block.chunks.map((chunk) => ({ block, chunk })));
  sequence.forEach((entry, position) => {
    const next = sequence[position + 1];
    if (next && !next.chunk.isSong) entry.chunk = completeLastMeasure(entry.chunk, full, beat);
  });

  const measures: Measure[] = [];
  const parts: ArrangementMeasure[] = [];
  const issues: Issue[] = [];
  const arrangementIssues: Issue[] = [];
  const sections: PerformanceSection[] = [];
  for (const block of blocks) {
    const start = measures.length;
    const shift = keyShift(song.meta.key, semitones + (block.pass === 2 ? lift : 0));
    for (const entry of sequence) {
      if (entry.block !== block) continue;
      const offset = measures.length;
      const moved = transposeMeasures(entry.chunk.measures, entry.chunk.parts, shift);
      measures.push(...moved.measures.map((measure) => ({ ...measure, part: block.kind })));
      parts.push(...moved.parts);
      issues.push(...shiftIssues(entry.chunk.issues, offset));
      arrangementIssues.push(...shiftIssues(entry.chunk.arrangementIssues, offset));
    }
    sections.push({
      kind: block.kind,
      title: block.title,
      detail: block.detail,
      start,
      count: measures.length - start,
      key: keyOf(block.pass),
      pass: block.pass,
    });
  }

  // Only the very last measure closes the piece.
  let startTick = 0;
  const placed = measures.map((measure, index) => {
    const last = index === measures.length - 1;
    const barline = last
      ? ending || measure.barline === 'final'
        ? ('final' as const)
        : measure.barline
      : measure.barline === 'final'
        ? ('single' as const)
        : measure.barline;
    const result = { ...measure, index, startTick, barline };
    startTick += measure.length;
    return result;
  });

  return {
    song: {
      ...song,
      meta: { ...song.meta, key: keyOf(1) },
      rightDo: song.rightDo + semitones,
      leftDo: song.leftDo + semitones,
      measures: placed,
      totalTicks: startTick,
      issues,
    },
    arrangement: { ...played, measures: parts, issues: arrangementIssues },
    sections,
    introMeasures: sections[0]?.kind === 'intro' ? sections[0].count : 0,
    rightHand: mode,
    chords,
  };
}

const COUNTED: Record<Exclude<MeasurePart, 'song'>, string> = {
  intro: 'Intro',
  interlude: 'Interlude',
  ending: 'Ending',
};

/** Names every measure of a performance, for labels, menus, and the position readout. */
export function measureNames(performance: Performance): MeasureName[] {
  const names: MeasureName[] = [];
  for (const section of performance.sections) {
    for (let offset = 0; offset < section.count; offset += 1) {
      const measure = performance.song.measures[section.start + offset];
      if (section.kind !== 'song') {
        const name = `${COUNTED[section.kind]} ${offset + 1}`;
        names.push({
          label: `${offset + 1}`,
          short: name,
          position: name,
          long: `${COUNTED[section.kind]} measure ${offset + 1}`,
        });
        continue;
      }
      const again = section.pass === 2;
      if (measure.number === null) {
        names.push({
          label: '',
          short: again ? 'Pickup (repeat)' : 'Pickup',
          position: again ? 'Pickup (repeat)' : 'Pickup',
          long: again ? 'Pickup measure of the repeat' : 'Pickup measure',
        });
      } else {
        names.push({
          label: `${measure.number}`,
          short: again ? `${measure.number} (repeat)` : `${measure.number}`,
          position: again ? `m. ${measure.number} (repeat)` : `m. ${measure.number}`,
          long: again ? `Measure ${measure.number} of the repeat` : `Measure ${measure.number}`,
        });
      }
    }
  }
  return names;
}
