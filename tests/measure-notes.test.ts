import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isSongId, loadNotes, NOTES_FILE, notesKey, storeNotes } from '../server/notes-store';
import { FileStore } from '../server/object-store';
import { folderCatalog } from '../server/song-catalog';
import { createSongBundle } from '../src/core/bundle';
import { noteContext, notesAt, noteTarget } from '../src/core/measure-notes';
import { readNotes, sortNotes, type MeasureNote } from '../src/core/notes-file';
import { buildPerformance } from '../src/core/performance';

const SONG = `
title: Notes
key: F
time: 4/4
| (0 5,) (1 1) | [F]3 . 2 1 | [Bb]2 4 . 2 | [C]5 . [C7]4 2 | [F]1 . ||
`;

const bundle = createSongBundle(SONG, {
  intro: {
    written: [
      { id: 'short', name: 'Short lead-in', measures: [{ right: '5 .', left: '[C7]1 .' }] },
    ],
  },
  endings: [
    { id: 'amen', name: 'Amen', measures: [{ right: '<4 6> . <3 5> .', left: '[Bb]1 . [F]1 .' }] },
  ],
  arrangements: [],
});
const [baseline] = bundle.arrangements;

const note = (fields: Partial<MeasureNote>): MeasureNote => ({
  id: 'a',
  part: 'song',
  measure: 1,
  where: 'Measure 1',
  text: 'A note.',
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
  createdAt: '2026-10-03T08:00:00.000Z',
  updatedAt: '2026-10-03T08:00:00.000Z',
  ...fields,
});

describe('the place a note refers to', () => {
  const choices = { intro: 'short', ending: 'amen' };
  const performance = buildPerformance(bundle, baseline, 'short', 0, 'melody', {
    ending: 'amen',
    lift: 1,
  });
  const targets = performance.song.measures.map((_, index) =>
    noteTarget(performance, index, choices),
  );

  it('is the printed measure in the song, the first time and in the repeat', () => {
    const repeat = performance.sections[3].start;
    expect(targets[1]).toEqual({ part: 'song', measure: 0, where: 'Pickup measure' });
    expect(targets[2]).toEqual({ part: 'song', measure: 1, where: 'Measure 1' });
    expect(targets[repeat + 1]).toEqual(targets[2]);
  });

  it('is a position within the passage outside the song', () => {
    expect(targets[0]).toEqual({
      part: 'intro',
      measure: 1,
      passage: 'short',
      where: 'Intro measure 1 (Short lead-in)',
    });
    const interlude = performance.sections[2].start;
    expect(targets[interlude]).toEqual({
      part: 'interlude',
      measure: 1,
      passage: 'short',
      where: 'Interlude measure 1',
    });
    expect(targets[targets.length - 1]).toEqual({
      part: 'ending',
      measure: 1,
      passage: 'amen',
      where: 'Ending measure 1 (Amen)',
    });
    expect(noteTarget(performance, 99, choices)).toBeNull();
  });

  it('finds the notes of a place, and only those', () => {
    const notes = [
      note({ id: 'a', measure: 1 }),
      note({ id: 'b', measure: 2 }),
      note({ id: 'c', part: 'intro', measure: 1, passage: 'short' }),
      note({ id: 'd', part: 'intro', measure: 1, passage: 'other' }),
    ];
    expect(notesAt(notes, targets[2]).map((found) => found.id)).toEqual(['a']);
    expect(notesAt(notes, targets[0]).map((found) => found.id)).toEqual(['c']);
    expect(notesAt(notes, null)).toEqual([]);
  });

  it('records what was on the sheet', () => {
    expect(noteContext(performance, { ...choices, lift: 1 })).toEqual({
      leftHand: 'baseline',
      leftHandName: 'My style',
      rightHand: 'melody',
      chords: false,
      intro: 'short',
      ending: 'amen',
      lift: 1,
      key: 'F',
    });
  });
});

describe('notes read from a file', () => {
  it('keep what is well formed and drop the rest', () => {
    const notes = readNotes({
      notes: [
        note({ id: 'good', text: '  trimmed  ' }),
        note({ id: 'good', text: 'same id again' }),
        note({ id: 'empty', text: '   ' }),
        { id: 'no-place', text: 'x' },
        { id: 'bad-part', part: 'coda', measure: 1, text: 'x' },
        { id: 'sparse', part: 'ending', measure: 2, text: 'kept', passage: 'amen' },
        'not a note',
      ],
    });
    expect(notes.map((found) => found.id)).toEqual(['good', 'sparse']);
    expect(notes[0].text).toBe('trimmed');
    expect(notes[1]).toMatchObject({
      part: 'ending',
      passage: 'amen',
      context: { rightHand: 'melody', chords: false, intro: 'off', lift: 0 },
    });
    expect(readNotes(null)).toEqual([]);
    expect(readNotes([note({})])).toHaveLength(1);
  });

  it('are sorted in the order of the piece', () => {
    const sorted = sortNotes([
      note({ id: 'ending', part: 'ending' }),
      note({ id: 'm12', measure: 12 }),
      note({ id: 'm2-later', measure: 2, createdAt: '2026-10-04T08:00:00.000Z' }),
      note({ id: 'intro', part: 'intro' }),
      note({ id: 'm2', measure: 2 }),
    ]);
    expect(sorted.map((found) => found.id)).toEqual(['intro', 'm2', 'm2-later', 'm12', 'ending']);
  });
});

describe('the notes file of a song', () => {
  const root = mkdtempSync(join(tmpdir(), 'notes-'));
  mkdirSync(join(root, 'private', 'kj-1-song'), { recursive: true });
  writeFileSync(join(root, 'private', 'kj-1-song', 'song.txt'), SONG);
  mkdirSync(join(root, 'empty'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const store = new FileStore(root);
  const catalog = folderCatalog(root);
  const id = 'private/kj-1-song';
  const file = join(root, 'private', 'kj-1-song', NOTES_FILE);

  it('belongs to a folder that holds a song, and to nothing else', async () => {
    expect(notesKey(id)).toBe('private/kj-1-song/notes.json');
    expect(isSongId(root, id)).toBe(true);
    expect(isSongId(root, 'empty')).toBe(false);
    expect(isSongId(root, 'missing')).toBe(false);
    for (const unsafe of ['../private/kj-1-song', 'private/../private/kj-1-song', '/etc', '']) {
      expect(isSongId(root, unsafe)).toBe(false);
      expect(await loadNotes(store, catalog, unsafe)).toBeNull();
    }
    expect(await loadNotes(store, catalog, 'missing')).toBeNull();
    expect(await storeNotes(store, catalog, '../outside', [note({})])).toBe(false);
  });

  it('is written next to the song, read back, and removed when the last note goes', async () => {
    expect(await loadNotes(store, catalog, id)).toEqual([]);
    const written = { notes: [note({ id: 'b', measure: 9 }), note({ id: 'a' })] };
    expect(await storeNotes(store, catalog, id, written)).toBe(true);
    expect(
      JSON.parse(readFileSync(file, 'utf8')).notes.map((found: MeasureNote) => found.id),
    ).toEqual(['a', 'b']);
    expect((await loadNotes(store, catalog, id))?.map((found) => found.measure)).toEqual([1, 9]);

    expect(await storeNotes(store, catalog, id, { notes: [] })).toBe(true);
    expect(existsSync(file)).toBe(false);
  });

  it('is read as empty when it was damaged by hand', async () => {
    writeFileSync(file, '{ not json');
    expect(await loadNotes(store, catalog, id)).toEqual([]);
    rmSync(file);
  });
});
