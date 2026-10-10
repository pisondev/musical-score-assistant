/**
 * Publishes the answers written into the `notes.json` files here to the R2 bucket, where the
 * public site shows each under its note.
 *
 *   npm run notes:reply              publish
 *   npm run notes:reply -- --dry-run say what would happen, change nothing
 *
 * An answer is the `reply` of a note, with `repliedAt` and, when the note has been dealt
 * with, `resolved`. The bucket decides which notes there are and what they say: an answer
 * goes to a note that is still there and still says what was answered. A note the player
 * changed or deleted meanwhile keeps no answer, and notes written meanwhile are left alone.
 */
import { readNotes, sortNotes, takeReplies, type MeasureNote } from '../src/core/notes-file.ts';
import { NOTES_FILE, notesKey } from '../server/notes-store.ts';
import { FileStore, scopedStore } from '../server/object-store.ts';
import { openBucket } from './r2';

const SONGS = 'songs';

function parse(text: string | null): MeasureNote[] {
  if (text === null) return [];
  try {
    return readNotes(JSON.parse(text));
  } catch {
    return [];
  }
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const remote = scopedStore(openBucket(), 'notes');
  const local = new FileStore(SONGS);

  let published = 0;
  for (const object of await local.list('')) {
    if (!object.key.endsWith(`/${NOTES_FILE}`)) continue;
    const songId = object.key.slice(0, -`/${NOTES_FILE}`.length);
    const here = parse(await local.get(object.key));
    if (!here.some((note) => note.reply !== undefined)) continue;

    const onSite = parse(await remote.get(notesKey(songId)));
    const { notes, taken, changed, missing } = takeReplies(onSite, here);
    const remarks = [
      changed > 0 && `${plural(changed, 'note')} changed by the player since, left unanswered`,
      missing > 0 && `${plural(missing, 'answered note')} not on the site`,
    ].filter(Boolean);
    console.log(
      `  ${songId}: ${plural(taken, 'answer')}${dryRun ? ' to publish' : ' published'}` +
        (remarks.length > 0 ? ` (${remarks.join('; ')})` : ''),
    );
    if (taken === 0) continue;
    published += taken;
    if (!dryRun) {
      await remote.put(
        notesKey(songId),
        `${JSON.stringify({ notes: sortNotes(notes) }, null, 2)}\n`,
        'application/json',
      );
    }
  }
  console.log(
    published === 0
      ? 'No answers to publish.'
      : dryRun
        ? `Dry run: ${plural(published, 'answer')} would be published.`
        : `${plural(published, 'answer')} published.`,
  );
}

main().catch((error: unknown) => {
  console.error(`Publishing the answers stopped: ${(error as Error).message}`);
  process.exit(1);
});
