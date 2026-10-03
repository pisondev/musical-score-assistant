/**
 * Brings the comments of the users here, to be read when a song is revised.
 *
 *   npm run comments:pull              the new comments, which the server then marks as read
 *   npm run comments:pull -- --all     every comment again, with the replies sent so far
 *   npm run comments:pull -- --local   from the database of the development server
 *
 * Each song gets its comments in `comments.json` in its folder (git-ignored). To answer one,
 * write the answer into its `reply` field and run `npm run comments:reply`.
 */
import {
  commentsFile,
  mergeComments,
  readCommentsFile,
  runAdmin,
  writeCommentsFile,
  type InboxComment,
} from './comments.ts';

const args = process.argv.slice(2);
const local = args.includes('--local');
const all = args.includes('--all');

const output = runAdmin(all ? ['comments', '--all'] : ['comments'], { local });
const { comments } = JSON.parse(output) as { comments: InboxComment[] };

const bySong = new Map<string, InboxComment[]>();
for (const comment of comments) {
  bySong.set(comment.songId, [...(bySong.get(comment.songId) ?? []), comment]);
}

for (const [songId, pulled] of bySong) {
  const file = commentsFile(songId);
  const merged = mergeComments(readCommentsFile(file), pulled);
  writeCommentsFile(file, merged);
  const open = merged.filter((comment) => !comment.replySent).length;
  console.log(
    `${file}: ${pulled.length} pulled, ${merged.length} in the file, ${open} without a reply`,
  );
}
console.log(
  comments.length === 0
    ? 'No new comments.'
    : `${comments.length} comment${comments.length === 1 ? '' : 's'} on ${bySong.size} song${bySong.size === 1 ? '' : 's'}.`,
);
