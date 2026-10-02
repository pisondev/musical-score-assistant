import { buildArrangement, buildBaseline } from './arrangement';
import { parseSong } from './song';
import type { Arrangement, ArrangementSpec, Issue, Level, PatternIdea, Song } from './types';
import { validateArrangement } from './validate';

/** A song together with its baseline and every stored arrangement. */
export interface SongBundle {
  song: Song;
  arrangements: Arrangement[];
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
      tips: readStrings(entry.tips),
      patterns: readPatterns(entry.patterns),
      measures,
    });
  });
  return specs;
}

/**
 * Builds everything the app needs for one song: the parsed melody, the
 * baseline left hand, and each stored arrangement with its validation results.
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

  return { song, arrangements: [baseline, ...arrangements], issues };
}
