/** Shared domain types for songs, arrangements, and playback. */

export type Hand = 'right' | 'left';

/** A line of music that sounds: one of the hands, or the sung melody played as a guide. */
export type Track = Hand | 'voice';

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

/**
 * Which stretch of a performance a measure belongs to: the introduction (with
 * its bridge), the song itself, the interlude that lifts the key before the
 * song is repeated, or the ending. Only measures of the song are numbered.
 */
export type MeasurePart = 'intro' | 'song' | 'interlude' | 'ending';

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
  /**
   * The sung melody, when the right hand accompanies instead of playing it.
   * It is shown as a cue above the right hand and can be played as a guide.
   */
  voice?: Slot[];
  /**
   * What the right hand adds to the melody where it waits: a second voice
   * beside `slots`, which keep the melody exactly as printed.
   */
  fills?: Slot[];
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
  /** Code of the hymnal the song is taken from, such as "KK" or "PKJ". */
  book?: string;
  /** Number of the song in that hymnal. */
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
  /** What the right hand does in this measure, when it does not play the plain melody. */
  rightNote?: string;
}

/**
 * What the right hand plays: the printed melody, the melody with fills where
 * it waits, or an accompaniment for singers that leaves the melody to them.
 */
export type RightHandMode = 'melody' | 'fills' | 'accompaniment';

/** The right-hand modes that are written out measure by measure. */
export type WrittenRightHandMode = Exclude<RightHandMode, 'melody'>;

export interface RightHandMeasure {
  /** The right hand of the measure as it is written in the part, on one line. */
  slots: Slot[];
  /** For fills: the same line without the melody notes, as a voice of its own. */
  fills?: Slot[];
  /** Left hand that replaces the arrangement's own here, when the hands trade roles. */
  left?: ArrangementMeasure;
  note?: string;
}

/** A right-hand part that belongs to one left-hand arrangement. */
export interface RightHandPart {
  mode: WrittenRightHandMode;
  summary: string;
  /** One entry per song measure; null where the measure keeps the printed melody. */
  measures: (RightHandMeasure | null)[];
  issues: Issue[];
}

export type RightHandParts = Partial<Record<WrittenRightHandMode, RightHandPart>>;

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
  /** Right-hand parts written to go with this left hand. */
  rightHand: RightHandParts;
  issues: Issue[];
}

/** One measure of a right-hand part as stored in arrangements.json. */
export interface RightHandMeasureSpec {
  /** Printed measure number; 0 addresses the pickup measure. */
  measure: number;
  /** Right-hand notation, relative to the key like the melody. */
  right: string;
  /** Left-hand notation that replaces the arrangement's own in this measure. */
  left?: string;
  note?: string;
}

export interface RightHandPartSpec {
  summary?: string;
  measures: RightHandMeasureSpec[];
}

export type RightHandSpec = Partial<Record<WrittenRightHandMode, RightHandPartSpec>>;

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
  rightHand?: RightHandSpec;
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
/**
 * A passage written for both hands that is not part of the song itself: an
 * introduction, the bridge into the song, the key lift, or an ending.
 */
export interface PassageSpec {
  id: string;
  name: string;
  style?: string;
  summary?: string;
  measures: IntroMeasureSpec[];
}

export type WrittenIntroSpec = PassageSpec;

/** Introduction settings as stored in arrangements.json. */
export interface IntroSpec {
  /** Measure number at which the last phrase begins; defaults to the last four measures. */
  lastPhraseFrom?: number;
  /** Measures that lead from the last phrase into the song. */
  bridge?: IntroMeasureSpec[];
  /** Newly written introductions, offered next to the last phrase. */
  written?: PassageSpec[];
}

export interface ArrangementFile {
  intro?: IntroSpec;
  /** The passage that lifts the key before the song is repeated. */
  modulation?: { measures: IntroMeasureSpec[] };
  /** Written endings, offered after the last measure of the song. */
  endings?: PassageSpec[];
  /** Additions to the generated baseline, which has no entry under `arrangements`. */
  baseline?: { rightHand?: RightHandSpec };
  arrangements: ArrangementSpec[];
}

/** A written passage, resolved to measures for both hands. */
export interface Passage {
  id: string;
  name: string;
  /** Musical style of the passage, such as "Gospel". */
  style: string;
  summary: string;
  measures: Measure[];
  parts: ArrangementMeasure[];
  issues: Issue[];
}

export type WrittenIntro = Passage;

/** The introduction that plays no measures at all. */
export const INTRO_OFF = 'off';
/** The introduction that repeats the closing phrase of the song. */
export const INTRO_LAST_PHRASE = 'last-phrase';

/**
 * Which introduction precedes the song: `INTRO_OFF`, `INTRO_LAST_PHRASE`, or
 * the id of a written introduction.
 */
export type IntroChoice = string;

/** The ending that adds nothing: the song stops with its last measure. */
export const ENDING_OFF = 'off';

/** Which ending follows the song: `ENDING_OFF` or the id of a written ending. */
export type EndingChoice = string;

/** A single sounding note, ready to be scheduled. */
export interface NoteEvent {
  track: Track;
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
  track: Track;
  start: number;
  end: number;
}
