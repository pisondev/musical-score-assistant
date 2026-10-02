import { buildArrangement, buildBaseline } from './arrangement';
import { buildWrittenIntro, lastPhraseStart } from './intro';
import { parseSong } from './song';
import type {
  Arrangement,
  ArrangementSpec,
  IntroMeasureSpec,
  IntroSpec,
  Issue,
  Level,
  PatternIdea,
  Song,
  WrittenIntro,
  WrittenIntroSpec,
} from './types';
import { INTRO_LAST_PHRASE, INTRO_OFF } from './types';
import { validateArrangement } from './validate';

/** A song together with its baseline, every stored arrangement, and its introductions. */
export interface SongBundle {
  song: Song;
  arrangements: Arrangement[];
  intro: {
    /** Index of the measure where the last phrase begins. */
    lastPhraseStart: number;
    /** Newly written introductions, in the order of the file. */
    written: WrittenIntro[];
  };
  /** Problems with the arrangement file itself, such as a malformed entry. */
  issues: Issue[];
}

const LEVELS: readonly Level[] = ['easy', 'intermediate', 'advanced'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readPatterns(value: unknown): PatternIdea[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    name: String(item.name ?? ''),
    notation: String(item.notation ?? ''),
    description: String(item.description ?? ''),
  }));
}

/** Reads arrangement descriptions from parsed JSON, reporting entries that are malformed. */
export function readArrangementSpecs(data: unknown, issues: Issue[]): ArrangementSpec[] {
  if (data === undefined || data === null) return [];
  if (!isRecord(data) || !Array.isArray(data.arrangements)) {
    issues.push({
      severity: 'error',
      message: 'The arrangement file must contain an "arrangements" array.',
    });
    return [];
  }

  const specs: ArrangementSpec[] = [];
  const seen = new Set<string>();
  data.arrangements.forEach((entry: unknown, index: number) => {
    const label = `Arrangement ${index + 1}`;
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      issues.push({ severity: 'error', message: `${label} needs a text "id" and "name".` });
      return;
    }
    if (seen.has(entry.id)) {
      issues.push({ severity: 'error', message: `Arrangement id "${entry.id}" is used twice.` });
      return;
    }
    if (!Array.isArray(entry.measures)) {
      issues.push({ severity: 'error', message: `${label} needs a "measures" array.` });
      return;
    }

    const measures: ArrangementSpec['measures'] = [];
    for (const measure of entry.measures) {
      if (
        !isRecord(measure) ||
        typeof measure.measure !== 'number' ||
        typeof measure.left !== 'string'
      ) {
        issues.push({
          severity: 'error',
          message: `${label} has a measure without a numeric "measure" and a text "left".`,
        });
        continue;
      }
      measures.push({
        measure: measure.measure,
        left: measure.left,
        note: typeof measure.note === 'string' ? measure.note : undefined,
      });
    }

    seen.add(entry.id);
    specs.push({
      id: entry.id,
      name: entry.name,
      summary: typeof entry.summary === 'string' ? entry.summary : undefined,
      level: LEVELS.includes(entry.level as Level) ? (entry.level as Level) : undefined,
      style: typeof entry.style === 'string' ? entry.style : undefined,
      tips: readStrings(entry.tips),
      patterns: readPatterns(entry.patterns),
      measures,
    });
  });
  return specs;
}

/** Reads the measures of one written introduction. */
function readIntroMeasures(value: unknown, label: string, issues: Issue[]): IntroMeasureSpec[] {
  if (!Array.isArray(value)) {
    issues.push({ severity: 'error', message: `${label} needs a "measures" array.` });
    return [];
  }
  const measures: IntroMeasureSpec[] = [];
  for (const measure of value) {
    if (
      !isRecord(measure) ||
      typeof measure.right !== 'string' ||
      typeof measure.left !== 'string'
    ) {
      issues.push({
        severity: 'error',
        message: `${label} has a measure without a text "right" and a text "left".`,
      });
      continue;
    }
    measures.push({
      right: measure.right,
      left: measure.left,
      note: typeof measure.note === 'string' ? measure.note : undefined,
    });
  }
  return measures;
}

/** Reads the introduction settings from parsed JSON. */
export function readIntroSpec(data: unknown, issues: Issue[]): IntroSpec {
  if (!isRecord(data) || data.intro === undefined) return {};
  const intro = data.intro;
  if (!isRecord(intro)) {
    issues.push({ severity: 'error', message: 'The "intro" entry must be an object.' });
    return {};
  }

  const spec: IntroSpec = {};
  if (typeof intro.lastPhraseFrom === 'number') spec.lastPhraseFrom = intro.lastPhraseFrom;
  if (intro.written === undefined) return spec;
  if (!Array.isArray(intro.written)) {
    issues.push({ severity: 'error', message: 'The "written" intros must be an array.' });
    return spec;
  }

  const written: WrittenIntroSpec[] = [];
  const seen = new Set<string>([INTRO_OFF, INTRO_LAST_PHRASE]);
  intro.written.forEach((entry: unknown, index: number) => {
    const label = `Intro ${index + 1}`;
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      issues.push({ severity: 'error', message: `${label} needs a text "id" and "name".` });
      return;
    }
    if (seen.has(entry.id)) {
      issues.push({
        severity: 'error',
        message: `Intro id "${entry.id}" is used twice or reserved.`,
      });
      return;
    }
    const measures = readIntroMeasures(entry.measures, label, issues);
    if (measures.length === 0) return;
    seen.add(entry.id);
    written.push({
      id: entry.id,
      name: entry.name,
      style: typeof entry.style === 'string' ? entry.style : undefined,
      summary: typeof entry.summary === 'string' ? entry.summary : undefined,
      measures,
    });
  });
  spec.written = written;
  return spec;
}

/**
 * Builds everything the app needs for one song: the parsed melody, the
 * baseline left hand, each stored arrangement with its validation results,
 * and the introductions.
 */
export function createSongBundle(songText: string, arrangementData?: unknown): SongBundle {
  const issues: Issue[] = [];
  const song = parseSong(songText);
  const baseline = buildBaseline(song);
  baseline.issues.push(...validateArrangement(song, baseline));

  const arrangements = readArrangementSpecs(arrangementData, issues).map((spec) => {
    const arrangement = buildArrangement(song, spec);
    arrangement.issues.push(...validateArrangement(song, arrangement));
    return arrangement;
  });

  const introSpec = readIntroSpec(arrangementData, issues);
  if (
    introSpec.lastPhraseFrom !== undefined &&
    !song.measures.some((measure) => measure.number === introSpec.lastPhraseFrom)
  ) {
    issues.push({
      severity: 'warning',
      message: `Intro: measure ${introSpec.lastPhraseFrom} does not exist; the last four measures are used.`,
    });
  }

  return {
    song,
    arrangements: [baseline, ...arrangements],
    intro: {
      lastPhraseStart: lastPhraseStart(song, introSpec.lastPhraseFrom),
      written: (introSpec.written ?? []).map((spec) => buildWrittenIntro(song, spec)),
    },
    issues,
  };
}
