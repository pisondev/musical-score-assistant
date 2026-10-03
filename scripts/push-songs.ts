/**
 * Puts the private songs into the R2 bucket, from which the public site hands
 * them to the signed-in owner.
 *
 *   npm run songs:push              upload what changed, remove what is gone
 *   npm run songs:push -- --dry-run say what would happen, change nothing
 *
 * Private songs never pass through GitHub, so they are not part of a deploy:
 * a song pushed here appears on the site at once. Only `song.txt` and
 * `arrangements.json` are sent; scans, readings, exports, and notes stay here.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { scopedStore } from '../server/object-store.ts';
import { PRIVATE_FOLDER } from '../server/private-songs.ts';
import { openBucket } from './r2';

const SONGS = 'songs';
const SENT = new Map([
  ['song.txt', 'text/plain; charset=utf-8'],
  ['arrangements.json', 'application/json'],
]);

/** The files to send, by their key below the songs folder ("private/kk-1/song.txt"). */
function localFiles(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (folder: string) => {
    if (!existsSync(folder)) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (SENT.has(entry.name)) files.set(relative(SONGS, path).split(sep).join('/'), path);
    }
  };
  walk(join(SONGS, PRIVATE_FOLDER));
  return files;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const remote = scopedStore(openBucket(), 'songs');
  const here = localFiles();
  const there = new Map(
    (await remote.list(`${PRIVATE_FOLDER}/`)).map((object) => [object.key, object.etag]),
  );

  let sent = 0;
  let unchanged = 0;
  for (const [key, path] of here) {
    const body = readFileSync(path, 'utf8');
    // R2 tags an object uploaded in one piece with the MD5 of its content.
    if (there.get(key) === createHash('md5').update(body).digest('hex')) {
      unchanged += 1;
      continue;
    }
    console.log(`  ${dryRun ? 'would send' : 'send'}   ${key}`);
    if (!dryRun) await remote.put(key, body, SENT.get(key.split('/').pop()!));
    sent += 1;
  }

  let removed = 0;
  for (const key of there.keys()) {
    if (here.has(key)) continue;
    console.log(`  ${dryRun ? 'would remove' : 'remove'} ${key}`);
    if (!dryRun) await remote.delete(key);
    removed += 1;
  }

  const songs = [...here.keys()].filter((key) => key.endsWith('/song.txt')).length;
  console.log(
    `${dryRun ? 'Dry run: ' : ''}${songs} private songs; ${sent} files sent, ${removed} removed, ${unchanged} unchanged.`,
  );
}

main().catch((error: unknown) => {
  console.error(`Pushing the songs stopped: ${(error as Error).message}`);
  process.exit(1);
});
