/**
 * Sends the answers written into `comments.json` files to the server, where each appears under
 * its comment in the app.
 *
 *   npm run comments:reply              to the public server
 *   npm run comments:reply -- --dry-run lists what would be sent
 *   npm run comments:reply -- --local   to the database of the development server
 *
 * An answer is sent when its `reply` is not empty and differs from what was sent before, so an
 * answer can be corrected by editing it and running this again.
 */
import { allCommentsFiles, readCommentsFile, runAdmin, writeCommentsFile } from './comments.ts';

const args = process.argv.slice(2);
const local = args.includes('--local');
const dryRun = args.includes('--dry-run');

const pending = allCommentsFiles().flatMap((file) =>
  readCommentsFile(file)
    .filter((comment) => comment.reply.trim() !== '' && comment.reply.trim() !== comment.replySent)
    .map((comment) => ({ file, id: comment.id, reply: comment.reply.trim() })),
);

if (pending.length === 0) {
  console.log('No answers to send.');
  process.exit(0);
}
for (const { file, id, reply } of pending) {
  console.log(`${file} #${id}: ${reply.length > 70 ? `${reply.slice(0, 70)}…` : reply}`);
}
if (dryRun) {
  console.log(`${pending.length} answer${pending.length === 1 ? '' : 's'} would be sent.`);
  process.exit(0);
}

const result = JSON.parse(
  runAdmin(['replies'], {
    local,
    input: JSON.stringify(pending.map(({ id, reply }) => ({ id, reply }))),
  }),
) as { replied: number; missing: number[] };

// What the server took is marked as sent; a comment that was deleted meanwhile is said.
const now = new Date().toISOString();
for (const file of new Set(pending.map((entry) => entry.file))) {
  const comments = readCommentsFile(file).map((comment) => {
    const sent = pending.find((entry) => entry.file === file && entry.id === comment.id);
    return sent && !result.missing.includes(comment.id)
      ? { ...comment, reply: sent.reply, replySent: sent.reply, repliedAt: now }
      : comment;
  });
  writeCommentsFile(file, comments);
}
console.log(`${result.replied} answer${result.replied === 1 ? '' : 's'} sent.`);
if (result.missing.length > 0) {
  console.log(`Deleted by their writers meanwhile: #${result.missing.join(', #')}.`);
}
