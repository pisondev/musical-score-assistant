import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AppDatabase } from './database.ts';

/**
 * A copy of the database in the bucket once a day, the last two weeks of them kept: the
 * accounts live on one server, and a server can be lost. A copy is made with `VACUUM INTO`, so
 * it is consistent while the server goes on writing.
 */

/** Where the copies go: the R2 bucket. */
export interface BackupTarget {
  putBytes(key: string, body: Uint8Array<ArrayBuffer>, contentType?: string): Promise<void>;
  list(prefix: string): Promise<{ key: string }[]>;
  delete(key: string): Promise<void>;
}

export const BACKUP_PREFIX = 'backups/';
/** How many daily copies are kept. */
export const BACKUPS_KEPT = 14;
/** How often the server looks whether today's copy is there. */
const CHECK_EVERY = 6 * 60 * 60 * 1000;
/** The first look waits a little, so that a deploy that fails at once makes no copy. */
const FIRST_CHECK = 60 * 1000;

const BACKUP_KEY = /^backups\/app-\d{4}-\d{2}-\d{2}\.db$/;

/** The key of the copy of a day (in UTC): `backups/app-2026-10-03.db`. */
export function backupKey(day: Date): string {
  return `${BACKUP_PREFIX}app-${day.toISOString().slice(0, 10)}.db`;
}

/** Whether today's copy is still to be made, and which copies are too old to keep. */
export function planBackups(
  keys: string[],
  todayKey: string,
  kept = BACKUPS_KEPT,
): { make: boolean; remove: string[] } {
  const copies = keys.filter((key) => BACKUP_KEY.test(key)).sort();
  const make = !copies.includes(todayKey);
  const after = make ? [...copies, todayKey].sort() : copies;
  return { make, remove: after.slice(0, Math.max(0, after.length - kept)) };
}

/** Makes today's copy if it is missing and removes the old ones; returns the key it wrote. */
export async function backUp(
  database: AppDatabase,
  target: BackupTarget,
  workDir: string,
  now = new Date(),
): Promise<string | null> {
  const todayKey = backupKey(now);
  const { make, remove } = planBackups(
    (await target.list(BACKUP_PREFIX)).map((object) => object.key),
    todayKey,
  );
  if (make) {
    const file = join(workDir, `backup-${now.getTime()}.db`);
    try {
      database.copyTo(file);
      await target.putBytes(todayKey, readFileSync(file), 'application/vnd.sqlite3');
    } finally {
      rmSync(file, { force: true });
    }
  }
  for (const key of remove) await target.delete(key);
  return make ? todayKey : null;
}

/** Looks after the copies while the server runs; returns a function that stops it. */
export function startBackups(
  database: AppDatabase,
  target: BackupTarget,
  workDir: string,
): () => void {
  const run = () => {
    backUp(database, target, workDir).then(
      (key) => key && console.log(`backup: ${key}`),
      (error: unknown) => console.error(`backup failed: ${(error as Error).message}`),
    );
  };
  const first = setTimeout(run, FIRST_CHECK);
  const every = setInterval(run, CHECK_EVERY);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
