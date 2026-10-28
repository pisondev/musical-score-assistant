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

  it('opens every later refrain phrase on a downbeat, as the composer corrected', () => {
    const onDownbeat = (index: number) => {
      const { midi, tick, duration } = events[index];
      return { midi, beat: tick / PPQ, duration: duration / PPQ };
    };
    // F4 opens measure 12, G4 measure 13, A4 measure 14, E5 measure 15, C5 measures 16 and 17.
    expect([56, 64, 68, 75, 81, 88].map(onDownbeat)).toEqual([
      { midi: 65, beat: 44, duration: 0.5 },
      { midi: 67, beat: 48, duration: 2.5 },
      { midi: 69, beat: 52, duration: 0.5 },
      { midi: 76, beat: 56, duration: 0.5 },
      { midi: 72, beat: 60, duration: 0.5 },
      { midi: 72, beat: 64, duration: 4 },
    ]);
    // Measure 13 repeats the refrain's pickup rhythm with G4-A4-G4 instead of C4-E4-G4.
    expect(events.slice(65, 68).map(({ midi, tick }) => ({ midi, beat: tick / PPQ }))).toEqual([
      { midi: 67, beat: 50.5 },
      { midi: 69, beat: 51 },
      { midi: 67, beat: 51.5 },
    ]);
    // Measure 14 opens like measure 10, and measure 15 like measure 11.
    const shape = (from: number, to: number) =>
      events.slice(from, to).map(({ tick, duration }) => [(tick / PPQ) % 4, duration / PPQ]);
    expect(shape(68, 72)).toEqual(shape(46, 50));
    expect(shape(75, 79)).toEqual(shape(51, 55));
  });
});
