import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import {
  allResolved,
  readNotes,
  reopened,
  REPLY_AUTHOR,
  takeReplies,
  type MeasureNote,
} from '../src/core/notes-file';

const note = (change: Partial<MeasureNote>): MeasureNote => ({
  id: 'a',
  part: 'song',
  measure: 4,
  where: 'Measure 4',
  text: 'This place feels empty.',
  context: {
    leftHand: 'baseline',
    leftHandName: 'My style',
    rightHand: 'melody',
    chords: false,
    intro: 'off',
    ending: 'off',
    lift: 0,
    key: 'F',
  },
  createdAt: '2026-10-10T08:00:00.000Z',
  updatedAt: '2026-10-10T08:00:00.000Z',
  ...change,
});

const answer = { reply: 'Done: both hands move here now.', repliedAt: '2026-10-10T12:00:00.000Z' };

describe('the answer to a note', () => {
  it('is signed with the name of the author', () => {
    expect(REPLY_AUTHOR).toBe('Composer Admin');
  });

  it('is kept with the note when the file is read', () => {
    const [read] = readNotes({ notes: [note({ ...answer, resolved: true })] });
    expect(read).toMatchObject({ ...answer, resolved: true });
  });

  it('is left out where there is none, and trimmed where there is one', () => {
    const [plain, blank, padded] = readNotes({
      notes: [
        note({ id: 'plain' }),
        { ...note({ id: 'blank' }), reply: '   ', repliedAt: answer.repliedAt, resolved: 'yes' },
        note({ id: 'padded', reply: '  Done.  ' }),
      ],
    });
    expect(plain).not.toHaveProperty('reply');
    expect(plain).not.toHaveProperty('resolved');
    expect(blank).not.toHaveProperty('reply');
    expect(blank).not.toHaveProperty('repliedAt');
    expect(blank).not.toHaveProperty('resolved');
    expect(padded.reply).toBe('Done.');
  });

  it('settles a measure only when every note on it has been dealt with', () => {
    expect(allResolved([])).toBe(false);
    expect(allResolved([note({ resolved: true })])).toBe(true);
    expect(allResolved([note({ resolved: true }), note({ id: 'b' })])).toBe(false);
    // An answer that asks back does not settle the note.
    expect(allResolved([note(answer)])).toBe(false);
  });

  it('goes when the player changes what the note says', () => {
    const open = reopened(
      note({ ...answer, resolved: true }),
      'Still empty.',
      '2026-10-11T08:00:00.000Z',
    );
    expect(open.text).toBe('Still empty.');
    expect(open.updatedAt).toBe('2026-10-11T08:00:00.000Z');
    expect(open).not.toHaveProperty('reply');
    expect(open).not.toHaveProperty('repliedAt');
    expect(open).not.toHaveProperty('resolved');
  });
});

describe('answers brought from one copy of the notes to another', () => {
  const onSite = [
    note({ id: 'a' }),
    note({ id: 'b', measure: 8 }),
    note({ id: 'new', measure: 9 }),
  ];

  it('go to the notes that are still there and still say the same', () => {
    const here = [
      note({ id: 'a', ...answer, resolved: true }),
      note({ id: 'b', measure: 8, text: 'What it said before.', ...answer }),
      note({ id: 'gone', measure: 2, ...answer }),
    ];
    const { notes, taken, changed, missing } = takeReplies(onSite, here);
    expect([taken, changed, missing]).toEqual([1, 1, 1]);
    expect(notes.map((found) => found.id)).toEqual(['a', 'b', 'new']);
    expect(notes[0]).toMatchObject({ ...answer, resolved: true });
    expect(notes[1]).not.toHaveProperty('reply');
    expect(notes[2]).not.toHaveProperty('reply');
  });

  it('are not counted again once they are there', () => {
    const here = [note({ id: 'a', ...answer, resolved: true })];
    const first = takeReplies(onSite, here);
    const second = takeReplies(first.notes, here);
    expect(second.taken).toBe(0);
    expect(second.notes).toEqual(first.notes);
  });

  it('replace an older answer, and leave a newer one alone', () => {
    const older = note({ id: 'a', reply: 'First answer.', repliedAt: '2026-10-09T12:00:00.000Z' });
    const newer = note({ id: 'a', ...answer, resolved: true });
    expect(takeReplies([older], [newer]).notes[0].reply).toBe(answer.reply);
    expect(takeReplies([newer], [older])).toMatchObject({ taken: 0, notes: [newer] });
  });

  it('keep answers written here when the notes of the site are pulled', () => {
    // Pulling: the site decides the notes; an answer that was not published yet stays.
    const here = [note({ id: 'a', ...answer, resolved: true })];
    expect(takeReplies(onSite, here).notes[0].resolved).toBe(true);
  });
});

const SONG = `title: Mode
key: C
time: 4/4
| [C]1 2 3 4 | [G]5 . . . | [C]3 2 1 2 | [C]1 . . . ||
`;

const measures = [
  { measure: 1, left: '[C]1 5 1 5' },
  { measure: 2, left: '[G](1 5) (1 5) (1 5) (1 5)' },
  { measure: 3, left: '[C]1 5 1 5' },
  { measure: 4, left: '[C]1 5 1 .' },
];

describe('the right-hand mode a left hand was written for', () => {
  it('is named by the arrangement and kept when that part is written', () => {
    const { arrangements } = createSongBundle(SONG, {
      baseline: {
        measures,
        rightHandMode: 'fills',
        rightHand: { fills: { measures: [{ measure: 2, right: "5 (7 2') (7 5) 7" }] } },
      },
      arrangements: [{ id: 'plain', name: 'Plain', measures }],
    });
    expect(arrangements[0].rightHandMode).toBe('fills');
    expect(arrangements[1].rightHandMode).toBeUndefined();
  });

  it('is dropped with a warning when that part is not written', () => {
    const { arrangements } = createSongBundle(SONG, {
      baseline: { measures, rightHandMode: 'accompaniment' },
      arrangements: [],
    });
    expect(arrangements[0].rightHandMode).toBeUndefined();
    expect(arrangements[0].issues.map((issue) => issue.message)).toContain(
      '"rightHandMode" asks for the accompaniment part, which is not written.',
    );
  });

  it('is ignored with a warning when it names no such mode', () => {
    const { arrangements, issues } = createSongBundle(SONG, {
      baseline: { measures, rightHandMode: 'melody' },
      arrangements: [],
    });
    expect(arrangements[0].rightHandMode).toBeUndefined();
    expect(issues.map((issue) => issue.message)).toContain(
      'The baseline: "rightHandMode" must be "fills" or "accompaniment"; it is ignored.',
    );
  });
});
