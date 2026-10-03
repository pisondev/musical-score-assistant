import type { AppDatabase } from './database.ts';
import type { ObjectStore } from './object-store.ts';

/**
 * What the app remembers for an account besides its notes: the favourites, the songs last
 * opened with their left hands, and the display settings. The browser sends the whole of it as
 * one document, and the server keeps it in the database, one row per account.
 *
 * Before the database, each document was an object of its own (`users/<address>.json`) in the
 * bucket or on disk. Such a document is still read, the first time its account asks for its
 * state, and moved into the database; deleting the account removes it too.
 */

/** A state document is small; anything larger is not one. */
export const MAX_STATE_BYTES = 256_000;

/** The key of an account's document in the earlier store, named after its address. */
export function stateKey(email: string): string {
  const name = email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
  return `users/${name}.json`;
}

function parseState(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** The state of an account, or null when nothing is stored yet. */
export async function loadState(
  database: AppDatabase,
  earlier: ObjectStore | null,
  email: string,
): Promise<Record<string, unknown> | null> {
  const text = database.stateOf(email);
  if (text !== null) return parseState(text);
  const old = earlier ? await earlier.get(stateKey(email)) : null;
  const state = old === null ? null : parseState(old);
  if (state && database.user(email)) database.storeState(email, JSON.stringify(state));
  return state;
}

/**
 * Stores the state of an account, which must have a record in the database. Returns false for
 * anything that is not a small object.
 */
export function storeState(database: AppDatabase, email: string, state: unknown): boolean {
  if (!isRecord(state)) return false;
  const text = JSON.stringify(state);
  if (Buffer.byteLength(text) > MAX_STATE_BYTES) return false;
  database.storeState(email, text);
  return true;
}

/** Removes an account and everything kept for it, the document in the earlier store included. */
export async function deleteAccount(
  database: AppDatabase,
  earlier: ObjectStore | null,
  email: string,
): Promise<void> {
  database.deleteUser(email);
  if (earlier) await earlier.delete(stateKey(email));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
