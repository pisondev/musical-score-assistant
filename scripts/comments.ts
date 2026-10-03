import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join } from 'node:path';
import { remote } from './remote.ts';

/**
 * What `npm run comments:pull` and `npm run comments:reply` share: running the author's tasks
 * on the database (`server/admin.ts`), and the files the comments are kept in here.
 *
 * The comments on a song are written to `comments.json` in its folder (git-ignored), so they are
 * read with the song when it is revised. A comment on a song that is not on this computer goes
 * to `.local/comments/`.
 */

const CONTAINER = 'musical-score-assistant';
const SONGS_ROOT = 'songs';
const ELSEWHERE = '.local/comments';
export const COMMENTS_FILE = 'comments.json';

/** A comment as it is kept here, with room for the answer. */
export interface PulledComment {
  id: number;
  /** The name of the person, and a short tag that tells two people of one name apart. */
  author: string;
  part: unknown;
  measure: unknown;
  passage?: unknown;
  where: unknown;
  /** What was on the sheet: the left hand, the right-hand mode, the key, and so on. */
  context: unknown;
  text: string;
  createdAt: string;
  /** The answer: write it here, and `npm run comments:reply` sends it. */
  reply: string;
  /** The answer as it was last sent, so that it is sent again only when it changes. */
  replySent?: string;
  repliedAt?: string;
}

/** A comment as the server lists it (`InboxComment` in `server/database.ts`). */
interface InboxComment {
  id: number;
  songId: string;
  author: string;
  place: Record<string, unknown>;
  text: string;
  createdAt: number;
  reply: string | null;
  repliedAt: number | null;
}

/**
 * Runs `admin.js` with the arguments, on the server or, with `local`, on the database of the
 * development server. Returns what it printed.
 */
export function runAdmin(
  args: string[],
  { local = false, input }: { local?: boolean; input?: string } = {},
): string {
  if (!local) {
    return remote(`docker exec -i ${CONTAINER} node dist-server/admin.js ${args.join(' ')}`, input);
  }
  const flags = isBuiltin('node:sqlite') ? [] : ['--experimental-sqlite'];
  const result = spawnSync(
    process.execPath,
    [
      ...flags,
      '--disable-warning=ExperimentalWarning',
      // In this process, so that the flag above applies to the script.
      '--import',
      'tsx',
      'server/admin.ts',
      ...args,
    ],
    {
      input,
      encoding: 'utf8',
      // The development server's database, or another one named by DATA_DIR.
      env: { ...process.env, DATA_DIR: process.env.DATA_DIR ?? '.local/data' },
      stdio: ['pipe', 'pipe', 'inherit'],
    },
  );
  if (result.status !== 0) throw new Error(`admin ${args.join(' ')} failed.`);
  return result.stdout;
}

/** The file that holds the comments on a song. */
export function commentsFile(songId: string): string {
  const folder = join(SONGS_ROOT, ...songId.split('/'));
  return existsSync(join(folder, 'song.txt'))
    ? join(folder, COMMENTS_FILE)
    : join(ELSEWHERE, `${songId.replaceAll('/', '__')}.json`);
}

export function readCommentsFile(file: string): PulledComment[] {
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { comments?: unknown };
    return Array.isArray(data.comments) ? (data.comments as PulledComment[]) : [];
  } catch {
    throw new Error(`${file} is not valid JSON; fix it before going on.`);
  }
}

export function writeCommentsFile(file: string, comments: PulledComment[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const sorted = [...comments].sort((a, b) => a.id - b.id);
  writeFileSync(file, `${JSON.stringify({ comments: sorted }, null, 2)}\n`);
}

const iso = (moment: number | null) =>
  moment === null ? undefined : new Date(moment).toISOString();

/**
 * Joins comments from the server with those kept here. What the server says wins, except for
 * an answer written here and not sent yet.
 */
export function mergeComments(kept: PulledComment[], pulled: InboxComment[]): PulledComment[] {
  const byId = new Map(kept.map((comment) => [comment.id, comment]));
  for (const comment of pulled) {
    const known = byId.get(comment.id);
    const sent = comment.reply ?? undefined;
    const draft = known && known.reply.trim() !== '' && known.reply !== known.replySent;
    const { part, measure, passage, where, context } = comment.place;
    byId.set(comment.id, {
      id: comment.id,
      author: comment.author,
      part,
      measure,
      ...(passage === undefined ? {} : { passage }),
      where,
      context,
      text: comment.text,
      createdAt: new Date(comment.createdAt).toISOString(),
      reply: draft ? known.reply : (sent ?? known?.reply ?? ''),
      ...(sent === undefined ? {} : { replySent: sent }),
      ...(comment.repliedAt === null ? {} : { repliedAt: iso(comment.repliedAt) }),
    });
  }
  return [...byId.values()];
}

/** Every comments file here: in the song folders and in `.local/comments`. */
export function allCommentsFiles(): string[] {
  const walk = (folder: string): string[] =>
    existsSync(folder)
      ? readdirSync(folder).flatMap((name) => {
          const path = join(folder, name);
          if (statSync(path).isDirectory()) return walk(path);
          return name === COMMENTS_FILE ? [path] : [];
        })
      : [];
  const elsewhere = existsSync(ELSEWHERE)
    ? readdirSync(ELSEWHERE)
        .filter((name) => name.endsWith('.json'))
        .map((name) => join(ELSEWHERE, name))
    : [];
  return [...walk(SONGS_ROOT), ...elsewhere];
}

export type { InboxComment };
