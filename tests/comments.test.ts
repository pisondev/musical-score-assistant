import { describe, expect, it } from 'vitest';
import { mergeComments, type InboxComment, type PulledComment } from '../scripts/comments';
import {
  COMMENTS_PER_DAY,
  MAX_COMMENT_LENGTH,
  readNewComment,
  viewComment,
} from '../server/comments';
import { AppDatabase } from '../server/database';

const PLACE = {
  part: 'song',
  measure: 5,
  where: 'Measure 5',
  context: {
    leftHand: 'gospel',
    leftHandName: 'Gospel',
    rightHand: 'fills',
    chords: true,
    key: 'A',
  },
};

describe('a new comment', () => {
  it('is read from what the app sends, with the place of a note', () => {
    const comment = readNewComment({ song: 'amazing-grace', ...PLACE, text: '  Too fast here.  ' });
    expect(comment).toEqual({
      songId: 'amazing-grace',
      place: {
        part: 'song',
        measure: 5,
        where: 'Measure 5',
        context: expect.objectContaining({ leftHandName: 'Gospel', rightHand: 'fills' }),
      },
      text: 'Too fast here.',
    });
  });

  it('is refused when it is empty, too long, or names no song or measure', () => {
    expect(readNewComment(null)).toBe('A comment is an object.');
    expect(readNewComment({ ...PLACE, text: 'x' })).toBe('The comment names no song.');
    expect(readNewComment({ song: 'a', ...PLACE, text: '   ' })).toBe('The comment is empty.');
    expect(
      readNewComment({ song: 'a', ...PLACE, text: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }),
    ).toMatch(/at most/);
    expect(readNewComment({ song: 'a', part: 'song', text: 'x' })).toBe(
      'The comment names no measure.',
    );
    expect(COMMENTS_PER_DAY).toBeGreaterThan(5);
  });
});

describe('comments in the database', () => {
  it('wait for the author, are marked read when fetched, and carry the answer', () => {
    const database = new AppDatabase(':memory:');
    try {
      expect(database.version).toBe(2);
      database.recordUser({ email: 'member@example.test', name: 'Ana' });
      database.recordUser({ email: 'other@example.test', name: 'Ana' });
      const first = database.addComment('member@example.test', 'amazing-grace', PLACE, 'One', 1000);
      database.addComment('other@example.test', 'amazing-grace', PLACE, 'Two', 2000);
      expect(database.countCommentsSince('member@example.test', 0)).toBe(1);
      expect(database.countCommentsSince('member@example.test', 1001)).toBe(0);

      // Peeking leaves them unread; fetching marks them read, once.
      expect(database.inbox({ peek: true })).toHaveLength(2);
      const inbox = database.inbox({}, 5000);
      expect(inbox.map((comment) => [comment.text, comment.readAt])).toEqual([
        ['One', null],
        ['Two', null],
      ]);
      // Two people of one name are told apart, without their addresses.
      expect(inbox[0].author).toMatch(/^Ana \([0-9a-f]{6}\)$/);
      expect(inbox[0].author).not.toBe(inbox[1].author);
      expect(JSON.stringify(inbox)).not.toContain('example.test');
      expect(database.inbox()).toEqual([]);
      expect(database.inbox({ all: true })).toHaveLength(2);
      expect(database.commentsOf('member@example.test')[0].readAt).toBe(5000);

      expect(database.reply(first.id, 'Thanks, fixed.', 6000)).toBe(true);
      expect(database.reply(999, 'Nobody')).toBe(false);
      const [answered] = database.commentsOf('member@example.test', 'amazing-grace');
      expect(viewComment(answered)).toMatchObject({
        id: String(first.id),
        songId: 'amazing-grace',
        where: 'Measure 5',
        reply: 'Thanks, fixed.',
        replySeen: false,
      });
      // Only the writer marks an answer as seen, and only their own.
      database.markRepliesSeen('other@example.test', [first.id]);
      expect(database.commentsOf('member@example.test')[0].replySeenAt).toBeNull();
      database.markRepliesSeen('member@example.test', [first.id], 7000);
      expect(database.commentsOf('member@example.test')[0].replySeenAt).toBe(7000);

      // A comment is taken back by its writer only; an account takes its comments with it.
      expect(database.deleteComment('other@example.test', first.id)).toBe(false);
      database.deleteUser('member@example.test');
      expect(database.inbox({ all: true }).map((comment) => comment.text)).toEqual(['Two']);
    } finally {
      database.close();
    }
  });
});

describe('the comments kept on this computer', () => {
  const pulled = (id: number, reply: string | null = null): InboxComment => ({
    id,
    songId: 'amazing-grace',
    author: 'Ana (abc123)',
    place: PLACE,
    text: `Comment ${id}`,
    createdAt: Date.UTC(2026, 9, 3),
    reply,
    repliedAt: reply ? Date.UTC(2026, 9, 4) : null,
  });

  it('take new comments in, keep an answer that is not sent yet, and follow sent ones', () => {
    const kept: PulledComment[] = [
      { ...mergeComments([], [pulled(1)])[0], reply: 'A draft' },
      { ...mergeComments([], [pulled(2)])[0] },
    ];
    const merged = mergeComments(kept, [pulled(1), pulled(2, 'Sent from elsewhere'), pulled(3)]);
    expect(merged.map((comment) => [comment.id, comment.reply, comment.replySent])).toEqual([
      [1, 'A draft', undefined],
      [2, 'Sent from elsewhere', 'Sent from elsewhere'],
      [3, '', undefined],
    ]);
    expect(merged[0]).toMatchObject({ where: 'Measure 5', createdAt: '2026-10-03T00:00:00.000Z' });
  });
});
