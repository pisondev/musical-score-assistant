/**
 * Checks every song under songs/ (or the folders given as arguments).
 *
 *   npm run check                      check all songs
 *   npm run check -- songs/amazing-grace
 *   npm run check -- --dump            also print the notes of every part per measure
 *
 * Exits with status 1 when any song or arrangement contains an error.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  beatTicks,
  categoryName,
  createSongBundle,
  findGaps,
  formatNoteName,
  midiToText,
  placeSong,
  readNotes,
  RIGHT_HAND_PARTS,
  songReference,
  subcategoryName,
  toneToText,
} from '../src/core';
import type {
  Arrangement,
  Issue,
  RightHandPart,
  Slot,
  Song,
  Passage,
  RightHandPartKind,
} from '../src/core';

const SONG_FILE = 'song.txt';
const ARRANGEMENT_FILE = 'arrangements.json';
const ANALYSIS_FILE = 'analysis.md';
const NOTES_FILE = 'notes.json';
const COMMENTS_FILE = 'comments.json';
const SONGS_ROOT = 'songs';
const RIGHT_HAND_LABEL: Record<RightHandPartKind, string> = {
  harmony: 'chords under the melody',
  fills: 'melody + fills',
  accompaniment: 'accompaniment',
};

function findSongFolders(root: string): string[] {
  if (!existsSync(root)) return [];
  if (existsSync(join(root, SONG_FILE))) return [root];
  return readdirSync(root)
    .map((entry) => join(root, entry))
    .filter((path) => statSync(path).isDirectory())
    .flatMap(findSongFolders)
    .sort();
}

function describeIssue(issue: Issue, song: Song, rightName = 'melody', indent = '    '): string {
  const where: string[] = [];
  if (issue.measure !== undefined) {
    const number = song.measures[issue.measure]?.number;
    where.push(number === null ? 'pickup' : `m.${number}`);
  }
  if (issue.hand) where.push(issue.hand === 'right' ? rightName : 'left hand');
  if (issue.line) where.push(`line ${issue.line}${issue.column ? `:${issue.column}` : ''}`);
  const location = where.length > 0 ? ` (${where.join(', ')})` : '';
  return `${indent}${issue.severity.toUpperCase()}${location}: ${issue.message}`;
}

function describeSlots(slots: Slot[]): string {
  return slots
    .map((slot) => {
      if (slot.kind === 'hold') return '.';
      if (slot.kind === 'rest') return '0';
      const names = slot.pitches.map(
        (pitch) => `${midiToText(pitch.midi)}=${toneToText(pitch.tone)}`,
      );
      return names.length > 1 ? `<${names.join(' ')}>` : names[0];
    })
    .join('  ');
}

function dumpArrangement(song: Song, arrangement: Arrangement): void {
  song.measures.forEach((measure, index) => {
    const part = arrangement.measures[index];
    const chords = part.chords.map((chord) => chord.symbol).join(' ');
    const label = measure.number === null ? 'pickup' : `m.${measure.number}`;
    console.log(`      ${label.padEnd(6)} ${chords.padEnd(18)} ${describeSlots(part.slots)}`);
  });
}

/** Prints the measures a right-hand part writes, with the left hand where it replaces it. */
function dumpRightHand(song: Song, part: RightHandPart): void {
  song.measures.forEach((measure, index) => {
    const written = part.measures[index];
    if (!written) return;
    const label = measure.number === null ? 'pickup' : `m.${measure.number}`;
    console.log(`        ${label.padEnd(6)} ${''.padEnd(18)} R: ${describeSlots(written.slots)}`);
    if (written.left) {
      const chords = written.left.chords.map((chord) => chord.symbol).join(' ');
      console.log(
        `        ${''.padEnd(6)} ${chords.padEnd(18)} L: ${describeSlots(written.left.slots)}`,
      );
    }
  });
}

function dumpPassage(passage: Passage, letter: string): void {
  passage.measures.forEach((measure, index) => {
    const part = passage.parts[index];
    const chords = part.chords.map((chord) => chord.symbol).join(' ');
    const label = `${letter}.${index + 1}`;
    console.log(`      ${label.padEnd(6)} ${''.padEnd(18)} R: ${describeSlots(measure.slots)}`);
    console.log(`      ${''.padEnd(6)} ${chords.padEnd(18)} L: ${describeSlots(part.slots)}`);
  });
}

/** Lists the places where the melody waits for more than two beats. */
function describeGaps(song: Song): string {
  const beat = beatTicks(song.meta.time);
  const gaps = findGaps(song).map((gap) => {
    const position = (tick: number) => {
      const measure = [...song.measures]
        .reverse()
        .find((candidate) => tick >= candidate.startTick)!;
      const label = measure.number === null ? 'pickup' : `m.${measure.number}`;
      return `${label} beat ${(tick - measure.startTick) / beat + 1}`;
    };
    return `${position(gap.start)} to ${position(gap.end)}`;
  });
  return gaps.length > 0 ? gaps.join('; ') : 'none';
}

/** Whether the reading of the song, which precedes its arrangements, is written. */
function describeReading(folder: string): string {
  const file = join(folder, ANALYSIS_FILE);
  const written = existsSync(file) && readFileSync(file, 'utf8').trim() !== '';
  return written
    ? ANALYSIS_FILE
    : `not written yet; read the text and the tune and write ${ANALYSIS_FILE} before arranging`;
}

/** How many comments users have sent on the song, and how many have no answer yet. */
function countComments(folder: string): { all: number; open: number } {
  const file = join(folder, COMMENTS_FILE);
  if (!existsSync(file)) return { all: 0, open: 0 };
  try {
    const { comments } = JSON.parse(readFileSync(file, 'utf8')) as {
      comments?: { replySent?: string }[];
    };
    const list = Array.isArray(comments) ? comments : [];
    return { all: list.length, open: list.filter((comment) => !comment.replySent).length };
  } catch {
    return { all: 0, open: 0 };
  }
}

/** How many notes the player has left on the measures of the song. */
function countPlayerNotes(folder: string): number {
  const file = join(folder, NOTES_FILE);
  if (!existsSync(file)) return 0;
  try {
    return readNotes(JSON.parse(readFileSync(file, 'utf8'))).length;
  } catch {
    return 0;
  }
}

function summarize(issues: Issue[]): string {
  const count = (severity: Issue['severity']) =>
    issues.filter((issue) => issue.severity === severity).length;
  const parts = [
    [count('error'), 'error'],
    [count('warning'), 'warning'],
  ]
    .filter(([total]) => (total as number) > 0)
    .map(([total, label]) => `${total} ${label}${total === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : 'OK';
}

function checkFolder(folder: string, dump: boolean): boolean {
  const songText = readFileSync(join(folder, SONG_FILE), 'utf8');
  const arrangementPath = join(folder, ARRANGEMENT_FILE);
  let arrangementData: unknown;
  const fileIssues: Issue[] = [];
  if (existsSync(arrangementPath)) {
    try {
      arrangementData = JSON.parse(readFileSync(arrangementPath, 'utf8'));
    } catch (error) {
      fileIssues.push({
        severity: 'error',
        message: `${ARRANGEMENT_FILE} is not valid JSON: ${(error as Error).message}`,
      });
    }
  }

  const { song, arrangements, intro, modulation, endings, issues } = createSongBundle(
    songText,
    arrangementData,
  );
  const { meta } = song;
  const reportable = (list: Issue[]) => list.filter((issue) => issue.severity !== 'info');

  const reference = songReference(meta);
  console.log(
    `\n${reference ? `${reference}  ` : ''}${meta.title}  [${relative(process.cwd(), folder).replaceAll('\\', '/')}]`,
  );
  console.log(
    `  melody: ${song.measures.length} measures, 1 = ${formatNoteName(meta.key)}, ` +
      `${meta.time.beats}/${meta.time.unit}, tempo ${meta.tempo}, ` +
      `right-hand 1 = ${midiToText(song.rightDo)}, left-hand 1 = ${midiToText(song.leftDo)} ` +
      `- ${summarize(song.issues)}`,
  );
  reportable(song.issues).forEach((issue) => console.log(describeIssue(issue, song)));
  console.log(`  gaps to fill: ${describeGaps(song)}`);
  console.log(`  reading: ${describeReading(folder)}`);
  const placement = placeSong(meta);
  console.log(
    `  listed under: ${categoryName(placement.category)} > ${subcategoryName(placement.subcategory)}`,
  );
  // Hymnals are licensed: a song from one belongs to the owner's private library only.
  const isPrivate = relative(resolve(SONGS_ROOT), resolve(folder)).split(sep)[0] === 'private';
  if (meta.book && !isPrivate) {
    fileIssues.push({
      severity: 'error',
      message: `Songs from a hymnal (${meta.book}) are licensed: keep them under songs/private/, never in the public library.`,
    });
  }
  if (!meta.book && !meta.category) {
    fileIssues.push({
      severity: 'warning',
      message: 'Header "category" is missing; the song is listed under Other.',
    });
  }
  const playerNotes = countPlayerNotes(folder);
  if (playerNotes > 0) {
    console.log(
      `  player's notes: ${playerNotes} in ${NOTES_FILE}; read them before revising the song`,
    );
  }
  const comments = countComments(folder);
  if (comments.all > 0) {
    console.log(
      `  users' comments: ${comments.all} in ${COMMENTS_FILE}, ${comments.open} without an answer; read them before revising the song`,
    );
  }
  [...fileIssues, ...issues].forEach((issue) => console.log(describeIssue(issue, song)));

  for (const arrangement of arrangements) {
    const kind = [arrangement.level, arrangement.style].filter(Boolean).join(', ');
    console.log(`  arrangement "${arrangement.name}" (${kind}): ${summarize(arrangement.issues)}`);
    reportable(arrangement.issues).forEach((issue) => console.log(describeIssue(issue, song)));
    if (dump) dumpArrangement(song, arrangement);

    for (const mode of RIGHT_HAND_PARTS) {
      const part = arrangement.rightHand[mode];
      if (!part) continue;
      console.log(`    right hand, ${RIGHT_HAND_LABEL[mode]}: ${summarize(part.issues)}`);
      reportable(part.issues).forEach((issue) =>
        console.log(describeIssue(issue, song, 'right hand', '      ')),
      );
      if (dump) dumpRightHand(song, part);
    }
  }

  const firstOfPhrase = song.measures[intro.lastPhraseStart]?.number ?? 0;
  console.log(`  intro "Last phrase": from measure ${firstOfPhrase}`);
  // The passages around the song: what leads into it, what lifts its key, and what closes it.
  const passages: { title: string; noun: string; letter: string; passage: Passage }[] = [
    ...(intro.bridge
      ? [
          {
            title: 'bridge after the last phrase',
            noun: 'bridge',
            letter: 'b',
            passage: intro.bridge,
          },
        ]
      : []),
    ...intro.written.map((passage) => ({
      title: `intro "${passage.name}"${passage.style ? ` (${passage.style})` : ''}`,
      noun: 'intro',
      letter: 'i',
      passage,
    })),
    ...(modulation
      ? [{ title: 'key lift for the repeat', noun: 'key lift', letter: 'k', passage: modulation }]
      : []),
    ...endings.map((passage) => ({
      title: `ending "${passage.name}"${passage.style ? ` (${passage.style})` : ''}`,
      noun: 'ending',
      letter: 'e',
      passage,
    })),
  ];
  for (const { title, noun, letter, passage } of passages) {
    const count = passage.measures.length;
    console.log(
      `  ${title}: ${count} measure${count === 1 ? '' : 's'} - ${summarize(passage.issues)}`,
    );
    reportable(passage.issues).forEach((issue) => {
      const hand = issue.hand === 'right' ? 'right hand' : 'left hand';
      const where =
        issue.measure === undefined ? '' : ` (${noun} measure ${issue.measure + 1}, ${hand})`;
      console.log(`    ${issue.severity.toUpperCase()}${where}: ${issue.message}`);
    });
    if (dump) dumpPassage(passage, letter);
  }
  const missing = [
    !intro.bridge && 'a bridge after the last phrase',
    !modulation && 'a key lift for the repeat',
    endings.length === 0 && 'endings',
  ].filter(Boolean);
  if (missing.length > 0) console.log(`  not written yet: ${missing.join(', ')}`);
  const passageIssues = passages.flatMap(({ passage }) => passage.issues);

  const all = [
    ...song.issues,
    ...fileIssues,
    ...issues,
    ...arrangements.flatMap((a) => a.issues),
    ...arrangements.flatMap((a) => Object.values(a.rightHand).flatMap((part) => part.issues)),
    ...passageIssues,
  ];
  return !all.some((issue) => issue.severity === 'error');
}

const args = process.argv.slice(2);
const dump = args.includes('--dump');
const targets = args.filter((arg) => !arg.startsWith('--'));
const folders = (targets.length > 0 ? targets : [SONGS_ROOT]).flatMap((target) =>
  findSongFolders(resolve(target)),
);

if (folders.length === 0) {
  console.error('No song folders found.');
  process.exit(1);
}

const results = folders.map((folder) => checkFolder(folder, dump));
const failed = results.filter((passed) => !passed).length;
console.log(
  failed === 0
    ? `\nAll ${folders.length} song(s) passed.`
    : `\n${failed} of ${folders.length} song(s) have errors.`,
);
process.exit(failed === 0 ? 0 : 1);
