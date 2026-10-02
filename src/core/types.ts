/** Shared domain types for songs, arrangements, and playback. */

export type Hand = 'right' | 'left';

export type Severity = 'error' | 'warning' | 'info';

/** A problem found while parsing or validating a song or an arrangement. */
export interface Issue {
  severity: Severity;
  message: string;
  /** Zero-based measure index within the song, when the issue belongs to one measure. */
  measure?: number;
  hand?: Hand;
  /** One-based source line and column, when the issue comes from song text. */
  line?: number;
  column?: number;
}

export interface TimeSignature {
  /** Beats per measure (the upper number). */
  beats: number;
  /** Note value of one beat (the lower number). */
  unit: number;
}

/** A note name with a letter (0 = C … 6 = B) and an accidental in semitones. */
export interface NoteName {
  letter: number;
  accidental: number;
}

/**
 * A pitch written in numbered notation: scale degree 1-7 with an accidental and
 * an octave offset, all relative to a reference "do".
 */
export interface ScaleTone {
  degree: number;
  accidental: number;
  octave: number;
}

/** A sounding pitch together with the way it is written on the sheet. */
export interface Pitch {
  midi: number;
  tone: ScaleTone;
}

export type SlotKind = 'note' | 'rest' | 'hold';

/**
 * One written symbol on a staff row: a note (or a vertical stack of notes),
 * a rest, or a hold dot that extends the previous note.
 */
export interface Slot {
  id: string;
  kind: SlotKind;
  /** Ticks from the start of the measure. */
  start: number;
  /** Written duration in ticks. */
  duration: number;
  /** Sounding pitches, lowest first. Empty for rests and holds. */
  pitches: Pitch[];
  /** Index of the beat-level element this slot belongs to; beams never cross it. */
  beat: number;
  /** Number of beams drawn above the slot (0 for a full beat or longer). */
  beams: number;
  /** Tuplet size when the slot belongs to an uneven division such as a triplet. */
  tuplet?: number;
  lyric?: string;
  /** Marked with "?" in the source: the transcription needs a second look. */
  uncertain?: boolean;
}

export interface ChordMark {
  /** Ticks from the start of the measure. */
  start: number;
  symbol: string;
  /** False when the symbol could not be parsed. */
  recognized: boolean;
  /** True when an arrangement replaces or adds to the printed chord at this point. */
  changed?: boolean;
}

export type Barline = 'single' | 'final' | 'repeat-end';

export type DynamicLevel = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';

/** A dynamic level, or the start of a crescendo ("<") or diminuendo (">") hairpin. */
export type DynamicSign = DynamicLevel | '<' | '>';

export interface DynamicMark {
  /** Ticks from the start of the measure. */
  start: number;
  sign: DynamicSign;
}

/** Whether a measure belongs to the introduction or to the song itself. */
export type MeasurePart = 'intro' | 'song';

export interface Measure {
  /** Zero-based position in the song. */
  index: number;
  /** Printed measure number; null for pickup and introduction measures. */
  number: number | null;
  part: MeasurePart;
  /** Absolute tick at which the measure begins. */
  startTick: number;
  /** Actual length in ticks; shorter than a full measure for pickups. */
  length: number;
  slots: Slot[];
  chords: ChordMark[];
  dynamics: DynamicMark[];
  barline: Barline;
  repeatStart: boolean;
  /** Section label that begins at this measure, if any. */
  section?: string;
  /** One-based source line of the measure, for diagnostics. */
  line: number;
}

export interface SongMeta {
  title: string;
  number?: string;
  composer?: string;
  lyricist?: string;
  source?: string;
  /** Tonic of the major key that "1" refers to. */
  key: NoteName;
  mode: 'major' | 'minor';
  time: TimeSignature;
  /** Beats per minute, counted in beats of the time signature. */
  tempo: number;
}

export interface Song {
  meta: SongMeta;
  /** MIDI pitch of "1" on the right-hand row. */
  rightDo: number;
  /** MIDI pitch of "1" on the left-hand row. */
  leftDo: number;
  measures: Measure[];
  totalTicks: number;
  issues: Issue[];
}

export type Level = 'easy' | 'intermediate' | 'advanced';

export interface PatternIdea {
  name: string;
  notation: string;
  description: string;
}

export interface ArrangementMeasure {
  slots: Slot[];
  chords: ChordMark[];
  /** Why this measure differs from the printed score. */
  note?: string;
}

export interface Arrangement {
  id: string;
  name: string;
  summary: string;
  level: Level;
  /** Musical style the arrangement teaches, such as "Gospel" or "Jazz". */
  style: string;
  /** True for the automatically generated root-fifth-octave baseline. */
  baseline: boolean;
  tips: string[];
  patterns: PatternIdea[];
  /** One entry per song measure, in the same order. */
  measures: ArrangementMeasure[];
  issues: Issue[];
}

/** Arrangement as stored in arrangements.json. */
export interface ArrangementSpec {
  id: string;
  name: string;
  summary?: string;
  level?: Level;
  style?: string;
  tips?: string[];
  patterns?: PatternIdea[];
  measures: ArrangementMeasureSpec[];
}

export interface ArrangementMeasureSpec {
  /** Printed measure number; 0 addresses the pickup measure. */
  measure: number;
  /** Left-hand notation with chord-relative degrees. */
  left: string;
  note?: string;
}

/** One measure of a written introduction: both hands are given explicitly. */
export interface IntroMeasureSpec {
  /** Right-hand notation, relative to the key like the melody. */
  right: string;
  /** Left-hand notation with chord-relative degrees. */
  left: string;
  note?: string;
}

/** A written introduction as stored in arrangements.json. */
export interface WrittenIntroSpec {
  id: string;
  name: string;
  style?: string;
  summary?: string;
  measures: IntroMeasureSpec[];
}

/** Introduction settings as stored in arrangements.json. */
export interface IntroSpec {
  /** Measure number at which the last phrase begins; defaults to the last four measures. */
  lastPhraseFrom?: number;
  /** Newly written introductions, offered next to the last phrase. */
  written?: WrittenIntroSpec[];
}

export interface ArrangementFile {
  intro?: IntroSpec;
  arrangements: ArrangementSpec[];
}

/** A written introduction, resolved to measures for both hands. */
export interface WrittenIntro {
  id: string;
  name: string;
  /** Musical style of the introduction, such as "Gospel". */
  style: string;
  summary: string;
  measures: Measure[];
  parts: ArrangementMeasure[];
  issues: Issue[];
}

/** The introduction that plays no measures at all. */
export const INTRO_OFF = 'off';
/** The introduction that repeats the closing phrase of the song. */
export const INTRO_LAST_PHRASE = 'last-phrase';

/**
 * Which introduction precedes the song: `INTRO_OFF`, `INTRO_LAST_PHRASE`, or
 * the id of a written introduction.
 */
export type IntroChoice = string;

/** A single sounding note, ready to be scheduled. */
export interface NoteEvent {
  hand: Hand;
  /** Absolute start in ticks. */
  tick: number;
  /** Sounding duration in ticks. */
  duration: number;
  midi: number;
  /** Loudness between 0 and 1. */
  velocity: number;
  slotId: string;
}

/** The time span a written slot occupies, used to highlight the playhead. */
export interface SlotSpan {
  id: string;
  hand: Hand;
  start: number;
  end: number;
}
