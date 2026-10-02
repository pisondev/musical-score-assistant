import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSongBundle } from '../src/core/bundle';

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
    expect(bundle.arrangements.length).toBeGreaterThan(1);
  });
});
