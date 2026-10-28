import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';
import { toMidiFile } from '../src/core/midi';
import { buildNoteEvents } from '../src/core/playback';
import { PPQ } from '../src/core/time';

/** Every song committed to the repository must load without errors or warnings. */
const SONGS_ROOT = 'songs';
const folders = readdirSync(SONGS_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'private')
  .map((entry) => join(SONGS_ROOT, entry.name))
  .filter((folder) => existsSync(join(folder, 'song.txt')));

describe('bundled songs', () => {
  it('include at least one song', () => {
    expect(folders.length).toBeGreaterThan(0);
  });

  it.each(folders)('%s is clean', (folder) => {
    const songText = readFileSync(join(folder, 'song.txt'), 'utf8');
    const arrangementPath = join(folder, 'arrangements.json');
    const data = existsSync(arrangementPath)
      ? JSON.parse(readFileSync(arrangementPath, 'utf8'))
      : undefined;

    const bundle = createSongBundle(songText, data);
    const problems = [
      ...bundle.song.issues,
      ...bundle.issues,
      ...bundle.arrangements.flatMap((arrangement) => arrangement.issues),
      ...bundle.arrangements.flatMap((arrangement) =>
        Object.values(arrangement.rightHand).flatMap((part) => part.issues),
      ),
      ...bundle.intro.written.flatMap((written) => written.issues),
    ].filter((issue) => issue.severity !== 'info');

    expect(problems).toEqual([]);
    // A melody-only song still has its baseline; written alternatives are optional.
    expect(bundle.arrangements).toHaveLength(1 + (data?.arrangements?.length ?? 0));
  });
});

describe('Saksi Kasih-Mu melody transcription', () => {
  const folder = join(SONGS_ROOT, 'saksi-kasih-mu');
  const bundle = createSongBundle(
    readFileSync(join(folder, 'song.txt'), 'utf8'),
    JSON.parse(readFileSync(join(folder, 'arrangements.json'), 'utf8')),
  );
  const events = buildNoteEvents(bundle.song, bundle.arrangements[0]);

  it('preserves the 89 audited source attacks, including low octaves and sixteenths', () => {
    const rows = readFileSync(join(folder, 'transcription.csv'), 'utf8')
      .trim()
      .split('\n')
      .slice(1);
    const expected = rows.map((line) => {
      const [, , measure, beat, , midi, duration] = line.split(',');
      return {
        midi: Number(midi),
        tick: ((Number(measure) - 1) * 4 + Number(beat) - 1) * PPQ,
        duration: Number(duration) * PPQ,
      };
    });

    expect(rows.filter((line) => line.startsWith('Verse,'))).toHaveLength(43);
    expect(rows.filter((line) => line.startsWith('Refrain,'))).toHaveLength(46);
    expect(events.every((event) => event.track === 'right')).toBe(true);
    expect(events.map(({ midi, tick, duration }) => ({ midi, tick, duration }))).toEqual(expected);
    expect(Math.min(...events.map((event) => event.midi))).toBe(55);
    expect(Math.max(...events.map((event) => event.midi))).toBe(77);
    expect(bundle.song.totalTicks).toBe(68 * PPQ);
  });

  it('ships a MIDI identical to the melody exported by the production core', () => {
    const expected = toMidiFile(bundle.song, events, {
      tempo: bundle.song.meta.tempo,
      tracks: ['right'],
    });
    const saved = readFileSync(join(folder, 'saksi-kasih-mu-melody.mid'));
    expect(saved).toEqual(Buffer.from(expected));
  });

  it('separates the verse close from a dedicated refrain pickup bar and puts A4 on beat one', () => {
    expect(
      events.slice(42, 49).map(({ midi, tick, duration }) => ({
        midi,
        beat: tick / PPQ,
        duration: duration / PPQ,
      })),
    ).toEqual([
      { midi: 60, beat: 30, duration: 0.5 },
      { midi: 60, beat: 34.5, duration: 0.5 },
      { midi: 64, beat: 35, duration: 0.5 },
      { midi: 67, beat: 35.5, duration: 0.5 },
      { midi: 69, beat: 36, duration: 0.5 },
      { midi: 67, beat: 36.5, duration: 0.25 },
      { midi: 69, beat: 36.75, duration: 0.75 },
    ]);
    const refrain = bundle.song.measures.find((measure) => measure.section === 'Refrain');
    expect(refrain?.number).toBe(9);
    expect(refrain?.startTick).toBe(32 * PPQ);
    expect(refrain?.slots[0].kind).toBe('rest');
    expect(
      refrain?.slots.filter((slot) => slot.kind === 'note').map((slot) => slot.pitches[0].midi),
    ).toEqual([60, 64, 67]);
    expect(bundle.song.measures[7].slots.at(-1)?.kind).toBe('rest');
    expect(events[43].tick - (events[42].tick + events[42].duration)).toBe(4 * PPQ);
    const firstFullRefrainBar = bundle.song.measures[9];
    expect(firstFullRefrainBar.startTick).toBe(36 * PPQ);
    expect(firstFullRefrainBar.slots[0].pitches[0].midi).toBe(69);
  });

  it('holds the preceding D5 through the barline and starts the next phrase on G4', () => {
    expect(
      events.slice(50, 54).map(({ midi, tick, duration }) => ({
        midi,
        beat: tick / PPQ,
        duration: duration / PPQ,
      })),
    ).toEqual([
      { midi: 74, beat: 38, duration: 2 },
      { midi: 67, beat: 40, duration: 0.5 },
      { midi: 64, beat: 40.5, duration: 0.25 },
      { midi: 67, beat: 40.75, duration: 0.75 },
    ]);
    expect(bundle.song.measures[10].startTick).toBe(40 * PPQ);
    expect(bundle.song.measures[10].slots[0].pitches[0].midi).toBe(67);
  });
});
