import { buildArrangement, buildBaseline } from './arrangement';
import { lastPhraseStart } from './intro';
import { buildPassage } from './passage';
import { buildRightHandPart, RIGHT_HAND_PARTS } from './right-hand';
import { parseSong } from './song';
import type {
  Arrangement,
  ArrangementSpec,
  IntroMeasureSpec,
  IntroSpec,
  Issue,
  Level,
  Passage,
  PassageSpec,
  PatternIdea,
  RightHandMeasureSpec,
  RightHandSpec,
  Song,
} from './types';
import { ENDING_OFF, INTRO_LAST_PHRASE, INTRO_OFF } from './types';
import { validateArrangement, validateRightHand } from './validate';

/**
 * A song together with its baseline, every stored arrangement, and the
 * passages around it: introductions, the key lift, and endings.
 */
export interface SongBundle {
  song: Song;
  arrangements: Arrangement[];
  intro: {
    /** Index of the measure where the last phrase begins. */
    lastPhraseStart: number;
    /** Measures that lead from the last phrase into the song, when the file writes them. */
    bridge: Passage | null;
    /** Newly written introductions, in the order of the file. */
    written: Passage[];
  };
  /** The passage that lifts the key before the song is repeated, when the file writes one. */
  modulation: Passage | null;
  /** Written endings, in the order of the file. */
  endings: Passage[];
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

/** Reads the right-hand parts of one arrangement, reporting entries that are malformed. */
function readRightHandSpec(value: unknown, label: string, issues: Issue[]): RightHandSpec {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push({ severity: 'error', message: `${label}: "rightHand" must be an object.` });
    return {};
  }

  const spec: RightHandSpec = {};
  for (const mode of RIGHT_HAND_PARTS) {
    const entry = value[mode];
    if (entry === undefined) continue;
    if (!isRecord(entry) || !Array.isArray(entry.measures)) {
      issues.push({
        severity: 'error',
        message: `${label}: right hand "${mode}" needs a "measures" array.`,
      });
      continue;
    }

    const measures: RightHandMeasureSpec[] = [];
    for (const measure of entry.measures) {
      if (
        !isRecord(measure) ||
        typeof measure.measure !== 'number' ||
        typeof measure.right !== 'string'
      ) {
        issues.push({
          severity: 'error',
          message: `${label}: right hand "${mode}" has a measure without a numeric "measure" and a text "right".`,
        });
        continue;
      }
      measures.push({
        measure: measure.measure,
        right: measure.right,
        left: typeof measure.left === 'string' ? measure.left : undefined,
        note: typeof measure.note === 'string' ? measure.note : undefined,
      });
    }
    spec[mode] = {
      summary: typeof entry.summary === 'string' ? entry.summary : undefined,
      measures,
    };
  }
  return spec;
}

/** Reads what the file adds to the generated baseline: its right-hand parts. */
export function readBaselineSpec(data: unknown, issues: Issue[]): RightHandSpec {
  if (!isRecord(data) || data.baseline === undefined) return {};
  if (!isRecord(data.baseline)) {
    issues.push({ severity: 'error', message: 'The "baseline" entry must be an object.' });
    return {};
  }
  return readRightHandSpec(data.baseline.rightHand, 'Baseline', issues);
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
      rightHand: readRightHandSpec(entry.rightHand, label, issues),
    });
  });
  return specs;
}

/** Reads the measures of one written passage. */
function readPassageMeasures(value: unknown, label: string, issues: Issue[]): IntroMeasureSpec[] {
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
  const bridge = readUnnamedPassage(intro.bridge, 'The bridge', issues);
  if (bridge) spec.bridge = bridge;
  if (intro.written === undefined) return spec;
  if (!Array.isArray(intro.written)) {
    issues.push({ severity: 'error', message: 'The "written" intros must be an array.' });
    return spec;
  }
  spec.written = readPassageSpecs(intro.written, 'Intro', [INTRO_OFF, INTRO_LAST_PHRASE], issues);
  return spec;
}

/** Reads a list of named passages: the written introductions, or the endings. */
function readPassageSpecs(
  list: unknown[],
  kind: 'Intro' | 'Ending',
  reserved: string[],
  issues: Issue[],
): PassageSpec[] {
  const passages: PassageSpec[] = [];
  const seen = new Set<string>(reserved);
  list.forEach((entry: unknown, index: number) => {
    const label = `${kind} ${index + 1}`;
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      issues.push({ severity: 'error', message: `${label} needs a text "id" and "name".` });
      return;
    }
    if (seen.has(entry.id)) {
      issues.push({
        severity: 'error',
        message: `${kind} id "${entry.id}" is used twice or reserved.`,
      });
      return;
    }
    const measures = readPassageMeasures(entry.measures, label, issues);
    if (measures.length === 0) return;
    seen.add(entry.id);
    passages.push({
      id: entry.id,
      name: entry.name,
      style: typeof entry.style === 'string' ? entry.style : undefined,
      summary: typeof entry.summary === 'string' ? entry.summary : undefined,
      measures,
    });
  });
  return passages;
}

/** Reads a passage that has no name of its own: the bridge, or the key lift. */
function readUnnamedPassage(
  value: unknown,
  label: string,
  issues: Issue[],
): IntroMeasureSpec[] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push({ severity: 'error', message: `${label} must be an object with "measures".` });
    return undefined;
  }
  const measures = readPassageMeasures(value.measures, label, issues);
  return measures.length > 0 ? measures : undefined;
}

/** Reads the passage that lifts the key before the song is repeated. */
export function readModulationSpec(data: unknown, issues: Issue[]): IntroMeasureSpec[] | undefined {
  return isRecord(data) ? readUnnamedPassage(data.modulation, 'The modulation', issues) : undefined;
}

/** Reads the written endings from parsed JSON. */
export function readEndingSpecs(data: unknown, issues: Issue[]): PassageSpec[] {
  if (!isRecord(data) || data.endings === undefined) return [];
  if (!Array.isArray(data.endings)) {
    issues.push({ severity: 'error', message: 'The "endings" must be an array.' });
    return [];
  }
  return readPassageSpecs(data.endings, 'Ending', [ENDING_OFF], issues);
}

/** Builds and checks the right-hand parts written for an arrangement. */
function addRightHand(song: Song, arrangement: Arrangement, spec: RightHandSpec | undefined): void {
  for (const mode of RIGHT_HAND_PARTS) {
    const partSpec = spec?.[mode];
    if (!partSpec) continue;
    const part = buildRightHandPart(song, arrangement, mode, partSpec);
    part.issues.push(...validateRightHand(song, arrangement, part));
    arrangement.rightHand[mode] = part;
  }
}

/**
 * Builds everything the app needs for one song: the parsed melody, the
 * baseline left hand, each stored arrangement with its right-hand parts and
 * validation results, and the introductions.
 */
export function createSongBundle(songText: string, arrangementData?: unknown): SongBundle {
  const issues: Issue[] = [];
  const song = parseSong(songText);
  const baseline = buildBaseline(song);
  baseline.issues.push(...validateArrangement(song, baseline));
  addRightHand(song, baseline, readBaselineSpec(arrangementData, issues));

  const arrangements = readArrangementSpecs(arrangementData, issues).map((spec) => {
    const arrangement = buildArrangement(song, spec);
    arrangement.issues.push(...validateArrangement(song, arrangement));
    addRightHand(song, arrangement, spec.rightHand);
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

  const unnamed = (id: string, name: string, measures: IntroMeasureSpec[] | undefined) =>
    measures ? { id, name, measures } : null;
  const bridge = unnamed('bridge', 'Bridge', introSpec.bridge);
  const modulation = unnamed('modulation', 'Key lift', readModulationSpec(arrangementData, issues));

  return {
    song,
    arrangements: [baseline, ...arrangements],
    intro: {
      lastPhraseStart: lastPhraseStart(song, introSpec.lastPhraseFrom),
      bridge: bridge && buildPassage(song, bridge, 'bridge'),
      written: (introSpec.written ?? []).map((spec) => buildPassage(song, spec, 'intro')),
    },
    modulation: modulation && buildPassage(song, modulation, 'modulation'),
    endings: readEndingSpecs(arrangementData, issues).map((spec) =>
      buildPassage(song, spec, 'ending'),
    ),
    issues,
  };
}
