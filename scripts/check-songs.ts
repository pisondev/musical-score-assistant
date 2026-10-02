/**
 * Checks every song under songs/ (or the folders given as arguments).
 *
 *   npm run check                      check all songs
 *   npm run check -- songs/amazing-grace
 *   npm run check -- --dump            also print the left-hand notes per measure
 *
 * Exits with status 1 when any song or arrangement contains an error.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createSongBundle, formatNoteName, midiToText, toneToText } from '../src/core';
import type { Arrangement, ImprovisedIntro, Issue, Slot, Song } from '../src/core';

const SONG_FILE = 'song.txt';
const ARRANGEMENT_FILE = 'arrangements.json';
const SONGS_ROOT = 'songs';

function findSongFolders(root: string): string[] {
  if (!existsSync(root)) return [];
  if (existsSync(join(root, SONG_FILE))) return [root];
  return readdirSync(root)
    .map((entry) => join(root, entry))
    .filter((path) => statSync(path).isDirectory())
    .flatMap(findSongFolders)
    .sort();
}

function describeIssue(issue: Issue, song: Song): string {
  const where: string[] = [];
  if (issue.measure !== undefined) {
    const number = song.measures[issue.measure]?.number;
    where.push(number === null ? 'pickup' : `m.${number}`);
  }
  if (issue.hand) where.push(issue.hand === 'right' ? 'melody' : 'left hand');
  if (issue.line) where.push(`line ${issue.line}${issue.column ? `:${issue.column}` : ''}`);
  const location = where.length > 0 ? ` (${where.join(', ')})` : '';
  return `    ${issue.severity.toUpperCase()}${location}: ${issue.message}`;
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

function dumpIntro(intro: ImprovisedIntro): void {
  intro.measures.forEach((measure, index) => {
    const part = intro.parts[index];
    const chords = part.chords.map((chord) => chord.symbol).join(' ');
    const label = `i.${index + 1}`;
    console.log(`      ${label.padEnd(6)} ${''.padEnd(18)} R: ${describeSlots(measure.slots)}`);
    console.log(`      ${''.padEnd(6)} ${chords.padEnd(18)} L: ${describeSlots(part.slots)}`);
  });
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

  const { song, arrangements, intro, issues } = createSongBundle(songText, arrangementData);
  const { meta } = song;
  const reportable = (list: Issue[]) => list.filter((issue) => issue.severity !== 'info');

  console.log(`\n${meta.title}  [${relative(process.cwd(), folder).replaceAll('\\', '/')}]`);
  console.log(
    `  melody: ${song.measures.length} measures, 1 = ${formatNoteName(meta.key)}, ` +
      `${meta.time.beats}/${meta.time.unit}, tempo ${meta.tempo}, ` +
      `right-hand 1 = ${midiToText(song.rightDo)}, left-hand 1 = ${midiToText(song.leftDo)} ` +
      `- ${summarize(song.issues)}`,
  );
  reportable(song.issues).forEach((issue) => console.log(describeIssue(issue, song)));
  [...fileIssues, ...issues].forEach((issue) => console.log(describeIssue(issue, song)));

  for (const arrangement of arrangements) {
    const kind = [arrangement.level, arrangement.style].filter(Boolean).join(', ');
    console.log(`  arrangement "${arrangement.name}" (${kind}): ${summarize(arrangement.issues)}`);
    reportable(arrangement.issues).forEach((issue) => console.log(describeIssue(issue, song)));
    if (dump) dumpArrangement(song, arrangement);
  }

  const firstOfPhrase = song.measures[intro.lastPhraseStart]?.number ?? 0;
  console.log(`  intro "Last phrase": from measure ${firstOfPhrase}`);
  const introIssues = intro.improvised?.issues ?? [];
  if (intro.improvised) {
    console.log(
      `  intro "Improvised": ${intro.improvised.measures.length} measures - ${summarize(introIssues)}`,
    );
    reportable(introIssues).forEach((issue) => {
      const hand = issue.hand === 'right' ? 'right hand' : 'left hand';
      const where =
        issue.measure === undefined ? '' : ` (intro measure ${issue.measure + 1}, ${hand})`;
      console.log(`    ${issue.severity.toUpperCase()}${where}: ${issue.message}`);
    });
    if (dump) dumpIntro(intro.improvised);
  }

  const all = [
    ...song.issues,
    ...fileIssues,
    ...issues,
    ...arrangements.flatMap((a) => a.issues),
    ...introIssues,
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
