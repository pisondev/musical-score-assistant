import { parseChord } from './chord.ts';
import { CATEGORIES, isKnownCategory, normalizeCategory } from './categories.ts';
import { normalizeBook } from './hymnals.ts';
import { KEYBOARD_LOWEST } from './keyboard.ts';
import { parseNotationLine, type RawMeasure } from './notation.ts';
import { lowestAtOrAbove, MAJOR_SCALE, parseNoteName, pitchClass } from './notes.ts';
import { beatTicks, measureTicks } from './time.ts';
import type { Issue, Measure, NoteName, Slot, Song, SongMeta, TimeSignature } from './types.ts';

/**
 * Lowest pitch a left-hand root may take: the bottom key of the keyboard.
 * Every chord root sits in the octave above it.
 */
export const BASS_FLOOR = KEYBOARD_LOWEST;

/** Pitch the melody is centred on when its octave is chosen automatically: G4. */
const MELODY_CENTRE = 67;

const DEFAULT_TIME: TimeSignature = { beats: 4, unit: 4 };
const DEFAULT_TEMPO = 80;
const C_MAJOR: NoteName = { letter: 0, accidental: 0 };

interface MusicLine {
  measures: RawMeasure[];
  lyrics: string | null;
}

interface Header {
  values: Map<string, string>;
  lines: Map<string, number>;
}

function parseTime(text: string): TimeSignature | null {
  const match = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const beats = Number(match[1]);
  const unit = Number(match[2]);
  if (beats < 1 || ![1, 2, 4, 8, 16].includes(unit)) return null;
  return { beats, unit };
}

/** Splits a lyric line into syllables, keeping the hyphen on syllables that continue. */
function splitSyllables(text: string): string[] {
  const syllables: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    if (word === '') continue;
    const parts = word.split('-');
    parts.forEach((part, index) => {
      if (part === '' && index === parts.length - 1) return;
      syllables.push(index < parts.length - 1 ? `${part}-` : part);
    });
  }
  return syllables;
}

/**
 * Picks the octave of "1" so the melody sits around the middle of the keyboard,
 * unless the header pins it with `octave:`.
 */
function chooseRightDo(key: NoteName, lines: MusicLine[], octave: number | null): number {
  const tonic = pitchClass(key);
  if (octave !== null) return 12 * (octave + 1) + tonic;

  let lowest = Infinity;
  let highest = -Infinity;
  for (const line of lines) {
    for (const measure of line.measures) {
      for (const slot of measure.slots) {
        for (const tone of slot.tones) {
          const offset = MAJOR_SCALE[tone.degree - 1] + tone.accidental + 12 * tone.octave;
          lowest = Math.min(lowest, offset);
          highest = Math.max(highest, offset);
        }
      }
    }
  }
  const centre = lowest === Infinity ? 0 : (lowest + highest) / 2;
  const candidates = [48 + tonic, 60 + tonic];
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate + centre - MELODY_CENTRE) < Math.abs(best + centre - MELODY_CENTRE)
      ? candidate
      : best,
  );
}

function readHeader(header: Header, issues: Issue[]): { meta: SongMeta; octave: number | null } {
  const get = (name: string) => header.values.get(name);
  const warn = (name: string, message: string) =>
    issues.push({ severity: 'error', message, line: header.lines.get(name) });

  let key = C_MAJOR;
  const keyText = get('key');
  if (keyText === undefined) {
    issues.push({ severity: 'warning', message: 'Header "key" is missing; assuming C.' });
  } else {
    const parsed = parseNoteName(keyText);
    if (parsed) key = parsed;
    else warn('key', `Key "${keyText}" is not a note name.`);
  }

  let time = DEFAULT_TIME;
  const timeText = get('time');
  if (timeText === undefined) {
    issues.push({ severity: 'warning', message: 'Header "time" is missing; assuming 4/4.' });
  } else {
    const parsed = parseTime(timeText);
    if (parsed) time = parsed;
    else warn('time', `Time signature "${timeText}" is not valid.`);
  }

  let tempo = DEFAULT_TEMPO;
  const tempoText = get('tempo');
  if (tempoText !== undefined) {
    const parsed = Number(tempoText);
    if (Number.isFinite(parsed) && parsed >= 20 && parsed <= 300) tempo = parsed;
    else warn('tempo', `Tempo "${tempoText}" must be a number between 20 and 300.`);
  }

  let mode: SongMeta['mode'] = 'major';
  const modeText = get('mode')?.toLowerCase();
  if (modeText === 'minor') mode = 'minor';
  else if (modeText !== undefined && modeText !== 'major') {
    warn('mode', `Mode "${modeText}" must be "major" or "minor".`);
  }

  let octave: number | null = null;
  const octaveText = get('octave');
  if (octaveText !== undefined) {
    const parsed = Number(octaveText);
    if (Number.isInteger(parsed) && parsed >= 2 && parsed <= 6) octave = parsed;
    else warn('octave', `Octave "${octaveText}" must be a whole number between 2 and 6.`);
  }

  const categoryText = get('category');
  const category = categoryText ? normalizeCategory(categoryText) : undefined;
  if (category !== undefined && !isKnownCategory(category)) {
    issues.push({
      severity: 'warning',
      message: `Category "${categoryText}" is not known; use one of ${CATEGORIES.map((known) => known.id).join(', ')}.`,
      line: header.lines.get('category'),
    });
  }
  const book = get('book') ? normalizeBook(get('book')!) : undefined;
  if (book && category !== undefined && category !== 'christian') {
    issues.push({
      severity: 'warning',
      message: `A song from a hymnal is listed under Christian, not "${categoryText}".`,
      line: header.lines.get('category'),
    });
  }

  const meta: SongMeta = {
    title: get('title') ?? 'Untitled',
    book,
    number: get('number'),
    category,
    subcategory: get('subcategory')?.trim() || undefined,
    composer: get('composer'),
    lyricist: get('lyricist'),
    source: get('source'),
    key,
    mode,
    time,
    tempo,
  };
  return { meta, octave };
}

const HEADER_NAMES = new Set([
  'title',
  'book',
  'number',
  'category',
  'subcategory',
  'composer',
  'lyricist',
  'source',
  'key',
  'mode',
  'time',
  'tempo',
  'octave',
]);

/** Parses a song file into measures, chords, lyrics, and a list of issues. */
export function parseSong(text: string): Song {
  const issues: Issue[] = [];
  const header: Header = { values: new Map(), lines: new Map() };
  const sections = new Map<number, string>();
  const pending: { text: string; line: number }[] = [];
  const lyricLines = new Map<number, string>();
  let pendingSection: string | null = null;
  const sectionAtLine = new Map<number, string>();

  // First pass: classify lines. Notation is parsed after the header is known,
  // because the beat length depends on the time signature.
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('//')) return;

    if (trimmed.startsWith('|')) {
      if (pendingSection !== null) {
        sectionAtLine.set(line, pendingSection);
        pendingSection = null;
      }
      pending.push({ text: rawLine, line });
      return;
    }

    const lyric = /^L\s*:(.*)$/.exec(trimmed);
    if (lyric) {
      const previous = pending[pending.length - 1];
      if (!previous) {
        issues.push({
          severity: 'warning',
          message: 'Lyric line has no melody line above it.',
          line,
        });
      } else if (!lyricLines.has(previous.line)) {
        lyricLines.set(previous.line, lyric[1]);
      }
      return;
    }

    const field = /^([A-Za-z][A-Za-z-]*)\s*[:=]\s*(.*)$/.exec(trimmed);
    if (field) {
      const name = field[1].toLowerCase();
      const value = field[2].trim();
      if (name === 'section') {
        pendingSection = value;
        return;
      }
      if (HEADER_NAMES.has(name)) {
        if (pending.length > 0) {
          issues.push({
            severity: 'warning',
            message: `Header "${name}" appears after the music and is ignored.`,
            line,
          });
        } else {
          header.values.set(name, value);
          header.lines.set(name, line);
        }
        return;
      }
    }
    issues.push({ severity: 'error', message: `Line is not recognized: "${trimmed}".`, line });
  });

  const { meta, octave } = readHeader(header, issues);
  const beat = beatTicks(meta.time);
  const fullMeasure = measureTicks(meta.time);

  const lines: MusicLine[] = pending.map(({ text: lineText, line }) => {
    const parsed = parseNotationLine(lineText, beat, line);
    issues.push(...parsed.issues);
    if (parsed.measures.length > 0 && sectionAtLine.has(line)) {
      sections.set(line, sectionAtLine.get(line)!);
    }
    return { measures: parsed.measures, lyrics: lyricLines.get(line) ?? null };
  });

  const rightDo = chooseRightDo(meta.key, lines, octave);
  const leftDo = lowestAtOrAbove(pitchClass(meta.key), BASS_FLOOR);

  const measures: Measure[] = [];
  let startTick = 0;
  let nextNumber = 1;
  let hasSoundingNote = false;

  for (const line of lines) {
    const syllables = line.lyrics === null ? [] : splitSyllables(line.lyrics);
    let syllableIndex = 0;
    let noteCount = 0;

    line.measures.forEach((raw, positionInLine) => {
      const index = measures.length;
      const isPickup = index === 0 && raw.length < fullMeasure;

      const slots: Slot[] = raw.slots.map((slot, slotIndex) => {
        const built: Slot = {
          id: `r${index}-${slotIndex}`,
          kind: slot.kind,
          start: slot.start,
          duration: slot.duration,
          pitches: slot.tones.map((tone) => ({
            midi: rightDo + MAJOR_SCALE[tone.degree - 1] + tone.accidental + 12 * tone.octave,
            tone: { ...tone },
          })),
          beat: slot.beat,
          beams: slot.beams,
          tuplet: slot.tuplet,
          rolled: slot.rolled || undefined,
          uncertain: slot.uncertain || undefined,
        };

        if (slot.kind === 'note') {
          hasSoundingNote = true;
          noteCount += 1;
          const syllable = syllables[syllableIndex];
          syllableIndex += 1;
          if (syllable !== undefined && syllable !== '_') built.lyric = syllable;
        } else if (slot.kind === 'rest') {
          hasSoundingNote = false;
        } else if (!hasSoundingNote) {
          issues.push({
            severity: 'warning',
            message: 'Hold dot has no note to extend.',
            measure: index,
            hand: 'right',
            line: raw.line,
            column: slot.column,
          });
        }
        if (slot.uncertain) {
          issues.push({
            severity: 'warning',
            message: 'Note is marked as uncertain; compare it with the printed score.',
            measure: index,
            hand: 'right',
            line: raw.line,
            column: slot.column,
          });
        }
        return built;
      });

      const chords = raw.chords.map((chord) => {
        const recognized = parseChord(chord.symbol) !== null;
        if (!recognized) {
          issues.push({
            severity: 'error',
            message: `Chord [${chord.symbol}] is not recognized.`,
            measure: index,
            line: raw.line,
            column: chord.column,
          });
        }
        return { start: chord.start, symbol: chord.symbol, recognized };
      });

      measures.push({
        index,
        number: isPickup ? null : nextNumber,
        part: 'song',
        startTick,
        length: raw.length,
        slots,
        chords,
        dynamics: raw.dynamics.map(({ start, sign }) => ({ start, sign })),
        barline: raw.barline,
        repeatStart: raw.repeatStart,
        section: positionInLine === 0 ? sections.get(raw.line) : undefined,
        line: raw.line,
      });
      if (!isPickup) nextNumber += 1;
      startTick += raw.length;
    });

    if (line.lyrics !== null && syllables.length !== noteCount) {
      issues.push({
        severity: 'warning',
        message: `Lyric line has ${syllables.length} syllables for ${noteCount} notes; use "_" to skip a note.`,
        line: line.measures[0]?.line,
      });
    }
  }

  checkMeasureLengths(measures, fullMeasure, beat, issues);

  if (measures.length === 0) {
    issues.push({ severity: 'error', message: 'The song has no measures.' });
  }

  return { meta, rightDo, leftDo, measures, totalTicks: startTick, issues };
}

function checkMeasureLengths(measures: Measure[], full: number, beat: number, issues: Issue[]) {
  const beats = (ticks: number) => Number((ticks / beat).toFixed(2));
  const pickup = measures[0] && measures[0].number === null ? measures[0].length : 0;

  measures.forEach((measure, index) => {
    if (measure.length === full || (index === 0 && measure.number === null)) return;

    const isLast = index === measures.length - 1;
    if (isLast && measure.length < full) {
      if (pickup > 0 && pickup + measure.length !== full) {
        issues.push({
          severity: 'info',
          message: `Pickup and final measure add up to ${beats(pickup + measure.length)} beats instead of ${beats(full)}.`,
          measure: index,
          hand: 'right',
          line: measure.line,
        });
      }
      return;
    }
    issues.push({
      severity: 'error',
      message: `Measure has ${beats(measure.length)} beats; the time signature needs ${beats(full)}.`,
      measure: index,
      hand: 'right',
      line: measure.line,
    });
  });
}
