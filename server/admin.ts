import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readServerConfig } from './config.ts';
import { AppDatabase } from './database.ts';

/**
 * The author's tasks on the database, run where the database lives:
 *
 *   node dist-server/admin.js comments [--all] [--peek]   the comments to read, as JSON
 *   node dist-server/admin.js replies < replies.json      writes replies: [{ "id": 1, "reply": "…" }]
 *
 * `comments` lists the comments not fetched before and marks them as read (`--peek` leaves
 * them unread, `--all` lists every comment and marks nothing). On the VPS the scripts
 * `npm run comments:pull` and `npm run comments:reply` run these through `docker exec`; on this
 * computer they open `.local/data/app.db`. Nothing here is reachable over the network.
 */

/** The longest reply, in characters. */
const MAX_REPLY_LENGTH = 4000;

function readReplies(input: string): { id: number; reply: string }[] {
  const data: unknown = JSON.parse(input);
  const list = Array.isArray(data) ? data : (data as { replies?: unknown })?.replies;
  if (!Array.isArray(list)) throw new Error('Expected a list of { id, reply }.');
  return list.flatMap((entry: unknown) => {
    const { id, reply } = (entry ?? {}) as { id?: unknown; reply?: unknown };
    const text = typeof reply === 'string' ? reply.trim() : '';
    return Number.isInteger(id) && text && text.length <= MAX_REPLY_LENGTH
      ? [{ id: id as number, reply: text }]
      : [];
  });
}

const [command, ...flags] = process.argv.slice(2);
const database = new AppDatabase(join(readServerConfig().dataDir, 'app.db'));
try {
  if (command === 'comments') {
    const comments = database.inbox({
      all: flags.includes('--all'),
      peek: flags.includes('--peek'),
    });
    process.stdout.write(`${JSON.stringify({ comments }, null, 2)}\n`);
  } else if (command === 'replies') {
    const replies = readReplies(readFileSync(0, 'utf8'));
    const missing = replies
      .filter(({ id, reply }) => !database.reply(id, reply))
      .map(({ id }) => id);
    process.stdout.write(
      `${JSON.stringify({ replied: replies.length - missing.length, missing })}\n`,
    );
  } else {
    process.stderr.write('Usage: admin.js comments [--all] [--peek] | admin.js replies < file\n');
    process.exitCode = 2;
  }
} finally {
  database.close();
}
