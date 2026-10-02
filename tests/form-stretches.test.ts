import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { formStretches, stretchAt } from '../src/core/form-stretches';
import { buildPerformance } from '../src/core/performance';

const PASSAGES = {
  intro: {
    written: [
      { id: 'short', name: 'Short lead-in', measures: [{ right: '5 . . .', left: '[C7]1 . . .' }] },
    ],
  },
  modulation: { measures: [{ right: '5 . . .', left: '[C7]1 . . .' }] },
  endings: [
    { id: 'amen', name: 'Amen', measures: [{ right: '<4 6> . <3 5> .', left: '[Bb]1 . [F]1 .' }] },
  ],
  arrangements: [],
};

const SECTIONED = createSongBundle(
  `
title: Sections
key: F
time: 4/4
section: Verse
| [F]1 . 2 3 | [Bb]4 . 2 . |
section: Refrain
| [C]5 . 4 2 | [F]1 . . . |
section: Verse
| [F]3 . 2 1 | [F]1 . . . ||
`,
  PASSAGES,
);

const PLAIN = createSongBundle(
  `
title: Plain
key: F
time: 4/4
| [F]1 . 2 3 | [C]5 . 4 2 | [F]1 . . . ||
`,
  PASSAGES,
);

const describeStretches = (
  bundle: typeof SECTIONED,
  intro: string,
  form: { ending?: string; lift?: number },
) =>
  formStretches(buildPerformance(bundle, bundle.arrangements[0], intro, 0, 'melody', form)).map(
    (stretch) => `${stretch.label} ${stretch.start}+${stretch.count}`,
  );

describe('the stretches of a performance', () => {
  it('are the sections of the song when nothing surrounds it', () => {
    expect(describeStretches(SECTIONED, 'off', {})).toEqual([
      'Song (verse) 0+2',
      'Song (refrain) 2+2',
      'Song (verse) 4+2',
    ]);
  });

  it('name the introduction, the interlude, the repeat, and the ending', () => {
    expect(describeStretches(SECTIONED, 'short', { ending: 'amen', lift: 1 })).toEqual([
      'Intro 0+1',
      'Song (verse) 1+2',
      'Song (refrain) 3+2',
      'Song (verse) 5+2',
      'Interlude 7+2',
      'Repeat (verse) 9+2',
      'Repeat (refrain) 11+2',
      'Repeat (verse) 13+2',
      'Ending 15+1',
    ]);
  });

  it('keep a song without sections in one piece', () => {
    expect(describeStretches(PLAIN, 'off', {})).toEqual(['Song 0+3']);
    expect(describeStretches(PLAIN, 'short', { ending: 'amen' })).toEqual([
      'Intro 0+1',
      'Song 1+3',
      'Ending 4+1',
    ]);
  });

  it('cover every measure once, in order', () => {
    const performance = buildPerformance(
      SECTIONED,
      SECTIONED.arrangements[0],
      'short',
      0,
      'melody',
      {
        ending: 'amen',
        lift: 2,
      },
    );
    const stretches = formStretches(performance);
    let next = 0;
    for (const stretch of stretches) {
      expect(stretch.start).toBe(next);
      expect(stretch.count).toBeGreaterThan(0);
      next += stretch.count;
    }
    expect(next).toBe(performance.song.measures.length);
  });

  it('give the measures before the first section name to that section', () => {
    const bundle = createSongBundle(
      `
title: Late name
key: F
time: 4/4
| (0 5,) (1 1) |
section: Verse
| [F]3 . 2 1 | [C]5 . 4 2 | [F]1 . ||
`,
      { arrangements: [] },
    );
    expect(describeStretches(bundle, 'off', {})).toEqual(['Song (verse) 0+4']);
  });
});

describe('the stretch of a measure', () => {
  const stretches = formStretches(
    buildPerformance(SECTIONED, SECTIONED.arrangements[0], 'short', 0, 'melody', {
      ending: 'amen',
    }),
  );

  it('is found by the index of the measure', () => {
    expect(stretches.map((stretch) => stretch.label)).toEqual([
      'Intro',
      'Song (verse)',
      'Song (refrain)',
      'Song (verse)',
      'Ending',
    ]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((measure) => stretchAt(stretches, measure))).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4,
    ]);
  });

  it('is the first or the last one outside the piece', () => {
    expect(stretchAt(stretches, -1)).toBe(0);
    expect(stretchAt(stretches, 99)).toBe(4);
    expect(stretchAt([], 3)).toBe(0);
  });
});
