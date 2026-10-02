import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { hymnalName, songReference } from '../src/core/hymnals';
import { parseSong } from '../src/core/song';
import { summarizeSong } from '../src/core/summary';
import type { SongEntry } from '../src/library';
import {
  groupByHymnal,
  lastOpened,
  NO_BOOK,
  selectSongs,
  type LibraryView,
} from '../src/ui/library-view';
import { timeAgo } from '../src/ui/time-ago';

const MUSIC = `
| [C]1 2 3 4 | [G]5 . . . | [C]0 0 3 2 | [C]1 . . . ||
`;

const ARRANGEMENTS = {
  intro: {
    written: [{ id: 'a', name: 'A', measures: [{ right: '1 . . .', left: '[C]1 5 1 5' }] }],
  },
  baseline: {
    rightHand: {
      fills: {
        measures: [
          { measure: 2, right: "5 (7 2') (7 5) 7" },
          { measure: 3, right: "(2' 7) 5 3 2" },
        ],
      },
    },
  },
  arrangements: [
    {
      id: 'one',
      name: 'One',
      level: 'intermediate',
      style: 'Gospel',
      measures: [
        { measure: 1, left: "[C]1 5 1' 5" },
        { measure: 2, left: "[G](1 5) (1' 5) (1 5) (1' 5)" },
        { measure: 3, left: "[C](1 5) (1' 5) 1 5" },
        { measure: 4, left: "[C]<1 5 1'> . . ." },
      ],
    },
    {
      id: 'two',
      name: 'Two',
      level: 'advanced',
      style: 'Gospel',
      // Silent through the gap, which the checker reports.
      measures: [{ measure: 2, left: '[G]1 0 0 0' }],
    },
  ],
};

function entry(id: string, header: string, arrangements?: unknown): SongEntry {
  const bundle = createSongBundle(`${header}\nkey: C\ntime: 4/4\n${MUSIC}`, arrangements);
  return { id, isPrivate: id.startsWith('private/'), bundle, summary: summarizeSong(bundle) };
}

describe('summarizeSong', () => {
  it('counts what a song offers', () => {
    const summary = entry('song', 'title: Song', ARRANGEMENTS).summary;
    expect(summary).toMatchObject({
      measures: 4,
      arrangements: 3,
      levels: { easy: 1, intermediate: 1, advanced: 1 },
      styles: ['Gospel'],
      rightHandParts: 1,
      intros: 2,
      gaps: 1,
      errors: 0,
    });
    expect(summary.warnings).toBeGreaterThan(0);
  });

  it('describes a song without an arrangement file', () => {
    expect(entry('song', 'title: Song').summary).toEqual({
      measures: 4,
      arrangements: 1,
      levels: { easy: 1, intermediate: 0, advanced: 0 },
      styles: [],
      rightHandParts: 0,
      intros: 1,
      gaps: 1,
      errors: 0,
      warnings: 0,
    });
  });
});

describe('selectSongs', () => {
  const entries = [
    entry('grace', 'title: Amazing Grace\ncomposer: Traditional'),
    entry('private/night', 'title: Silent Night\nbook: KJ\nnumber: 99'),
    entry('joy', 'title: Joy to the World\nbook: pkj\nnumber: 120', ARRANGEMENTS),
    entry('holy', 'title: Holy, Holy, Holy\nbook: KJ\nnumber: 7'),
  ];
  const view: LibraryView = {
    query: '',
    filter: 'all',
    book: null,
    sort: 'title',
    favourites: [],
    opened: {},
  };
  const ids = (change: Partial<LibraryView>) =>
    selectSongs(entries, { ...view, ...change }).map((song) => song.id);

  it('sorts by title', () => {
    expect(ids({})).toEqual(['grace', 'holy', 'joy', 'private/night']);
  });

  it('sorts by number, with unnumbered songs last', () => {
    expect(ids({ sort: 'number' })).toEqual(['holy', 'private/night', 'joy', 'grace']);
  });

  it('puts recently opened songs first and the rest by title', () => {
    const opened = {
      joy: { openedAt: 100, arrangementId: 'one' },
      'private/night': { openedAt: 200, arrangementId: 'baseline' },
    };
    expect(ids({ sort: 'recent', opened })).toEqual(['private/night', 'joy', 'grace', 'holy']);
  });

  it('searches the title, the number, the credits, and the styles', () => {
    expect(ids({ query: 'HOLY' })).toEqual(['holy']);
    expect(ids({ query: '120' })).toEqual(['joy']);
    expect(ids({ query: 'traditional' })).toEqual(['grace']);
    expect(ids({ query: 'gospel' })).toEqual(['joy']);
    expect(ids({ query: 'night silent' })).toEqual(['private/night']);
    expect(ids({ query: 'nothing' })).toEqual([]);
  });

  it('keeps only the favourites when asked', () => {
    expect(ids({ filter: 'favourites', favourites: ['joy', 'grace'] })).toEqual(['grace', 'joy']);
    expect(ids({ filter: 'favourites' })).toEqual([]);
  });

  it('searches the hymnal by code and by name', () => {
    expect(ids({ query: 'kj 99' })).toEqual(['private/night']);
    expect(ids({ query: 'pelengkap' })).toEqual(['joy']);
    expect(ids({ query: 'kidung jemaat' })).toEqual(['holy', 'joy', 'private/night']);
  });

  it('narrows the list to one hymnal', () => {
    expect(ids({ book: 'KJ' })).toEqual(['holy', 'private/night']);
    expect(ids({ book: 'PKJ' })).toEqual(['joy']);
    expect(ids({ book: 'KK' })).toEqual([]);
    expect(ids({ book: NO_BOOK })).toEqual(['grace']);
    expect(ids({ book: 'KJ', sort: 'number' })).toEqual(['holy', 'private/night']);
  });

  it('groups the songs by hymnal, known hymnals first', () => {
    const groups = groupByHymnal([...entries, entry('psalm', 'title: Psalm\nbook: NKB')]);
    expect(groups.map((group) => [group.code, group.name, group.songs.length])).toEqual([
      ['KK', 'Kidung Keesaan', 0],
      ['PKJ', 'Pelengkap Kidung Jemaat', 1],
      ['KJ', 'Kidung Jemaat', 2],
      ['KPJ', 'Kidung Pasamuwan Jawi', 0],
      ['NKB', 'NKB', 1],
      [NO_BOOK, 'Other songs', 1],
    ]);
    // Without songs that name no hymnal, there is no section for them.
    expect(groupByHymnal(entries.slice(1)).map((group) => group.code)).toEqual([
      'KK',
      'PKJ',
      'KJ',
      'KPJ',
    ]);
  });

  it('finds the song that was opened last', () => {
    expect(lastOpened(entries, {})).toBeNull();
    const opened = {
      joy: { openedAt: 100, arrangementId: 'one' },
      holy: { openedAt: 300, arrangementId: 'baseline' },
      // A song that has been removed since must not be offered.
      gone: { openedAt: 900, arrangementId: 'baseline' },
    };
    expect(lastOpened(entries, opened)?.id).toBe('holy');
  });
});

describe('hymnals', () => {
  it('are read from the header of a song', () => {
    const { meta } = parseSong(
      'title: Song\nbook: pkj\nnumber: 184\nkey: A\ntime: 4/4\n| 1 2 3 4 ||',
    );
    expect(meta.book).toBe('PKJ');
    expect(meta.number).toBe('184');
    expect(parseSong('title: Song\nkey: C\ntime: 4/4\n| 1 2 3 4 ||').meta.book).toBeUndefined();
  });

  it('give a song its reference and the hymnal its name', () => {
    expect(songReference({ book: 'PKJ', number: '184' })).toBe('PKJ 184');
    expect(songReference({ number: '12' })).toBe('12');
    expect(songReference({ book: 'KK' })).toBe('KK');
    expect(songReference({})).toBe('');
    expect(hymnalName('KPJ')).toBe('Kidung Pasamuwan Jawi');
    expect(hymnalName('XYZ')).toBeNull();
    expect(hymnalName(undefined)).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  const minutes = (count: number) => now - count * 60_000;

  it('describes a moment in the largest unit that fits', () => {
    expect(timeAgo(now, now)).toBe('just now');
    expect(timeAgo(minutes(0.5), now)).toBe('just now');
    expect(timeAgo(minutes(5), now)).toBe('5 minutes ago');
    expect(timeAgo(minutes(60 * 3), now)).toBe('3 hours ago');
    expect(timeAgo(minutes(60 * 24), now)).toBe('yesterday');
    expect(timeAgo(minutes(60 * 24 * 6), now)).toBe('6 days ago');
    expect(timeAgo(minutes(60 * 24 * 14), now)).toBe('2 weeks ago');
    expect(timeAgo(minutes(60 * 24 * 400), now)).toBe('last year');
  });

  it('never reports a moment in the future', () => {
    expect(timeAgo(now + 5_000, now)).toBe('just now');
  });
});
