/**
 * Brings the player's notes from the R2 bucket into the song folders here.
 *
 *   npm run notes:pull
 *
 * The notes the player writes on the public site are kept in the bucket
 * (`notes/<song id>/notes.json`). This copies them next to `song.txt` of each
 * song, where they are read before the song is revised. The bucket's list
 * wins; a note that exists only here is kept and reported.
 */
import { readNotes } from '../src/core/notes-file.ts';
import { loadNotes, NOTES_FILE, storeNotes } from '../server/notes-store.ts';
import { FileStore, scopedStore } from '../server/object-store.ts';
import { folderCatalog } from '../server/song-catalog.ts';
import { openBucket } from './r2';

const SONGS = 'songs';

async function main(): Promise<void> {
  const remote = scopedStore(openBucket(), 'notes');
  const local = new FileStore(SONGS);
  const catalog = folderCatalog(SONGS);

  let songs = 0;
  let total = 0;
  for (const object of await remote.list('')) {
    if (!object.key.endsWith(`/${NOTES_FILE}`)) continue;
    const songId = object.key.slice(0, -`/${NOTES_FILE}`.length);
    const fromServer = readNotes(JSON.parse((await remote.get(object.key)) ?? '[]'));
    const here = await loadNotes(local, catalog, songId);
    if (here === null) {
      console.log(`  ${songId}: ${fromServer.length} notes, but the song is not on this computer`);
      continue;
    }
    const onServer = new Set(fromServer.map((note) => note.id));
    const onlyHere = here.filter((note) => !onServer.has(note.id));
    await storeNotes(local, catalog, songId, { notes: [...fromServer, ...onlyHere] });
    songs += 1;
    total += fromServer.length;
    const extra = onlyHere.length > 0 ? `, and ${onlyHere.length} that exist only here` : '';
    console.log(`  ${songId}: ${fromServer.length} notes${extra}`);
  }
  console.log(
    songs === 0
      ? 'No notes in the bucket yet.'
      : `Pulled ${total} notes for ${songs} songs into songs/<song>/notes.json.`,
  );
}

main().catch((error: unknown) => {
  console.error(`Pulling the notes stopped: ${(error as Error).message}`);
  process.exit(1);
});
