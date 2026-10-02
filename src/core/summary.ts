import type { SongBundle } from './bundle';
import { findGaps } from './gaps';
import type { Issue, Level } from './types';

/** What one song has to offer, counted for the overview of all songs. */
export interface SongSummary {
  /** Numbered measures, without the pickup. */
  measures: number;
  /** Left-hand arrangements, the baseline included. */
  arrangements: number;
  /** How many of them belong to each level. */
  levels: Record<Level, number>;
  /** Styles of the stored arrangements in menu order, each named once. */
  styles: string[];
  /** Right-hand parts (fills and accompaniments) written across all arrangements. */
  rightHandParts: number;
  /** Introductions on offer: the last phrase and every written one. */
  intros: number;
  /** Written endings on offer. */
  endings: number;
  /** Places where the melody waits for more than two beats. */
  gaps: number;
  errors: number;
  warnings: number;
}

/** Counts the arrangements, parts, introductions, and open issues of a song. */
export function summarizeSong(bundle: SongBundle): SongSummary {
  const { song, arrangements, intro, endings, modulation } = bundle;
  const parts = arrangements.flatMap((arrangement) => Object.values(arrangement.rightHand));

  const levels: Record<Level, number> = { easy: 0, intermediate: 0, advanced: 0 };
  const styles: string[] = [];
  for (const arrangement of arrangements) {
    levels[arrangement.level] += 1;
    if (!arrangement.baseline && arrangement.style && !styles.includes(arrangement.style)) {
      styles.push(arrangement.style);
    }
  }

  const issues: Issue[] = [
    ...song.issues,
    ...bundle.issues,
    ...arrangements.flatMap((arrangement) => arrangement.issues),
    ...parts.flatMap((part) => part.issues),
    ...intro.written.flatMap((written) => written.issues),
    ...(intro.bridge?.issues ?? []),
    ...(modulation?.issues ?? []),
    ...endings.flatMap((ending) => ending.issues),
  ];
  const count = (severity: Issue['severity']) =>
    issues.filter((issue) => issue.severity === severity).length;

  return {
    measures: song.measures.filter((measure) => measure.number !== null).length,
    arrangements: arrangements.length,
    levels,
    styles,
    rightHandParts: parts.length,
    // The last phrase needs at least one measure to repeat.
    intros: (song.measures.length > 0 ? 1 : 0) + intro.written.length,
    endings: endings.length,
    gaps: findGaps(song).length,
    errors: count('error'),
    warnings: count('warning'),
  };
}
