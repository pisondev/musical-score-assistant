import type { ObjectStore } from './object-store.ts';

/**
 * What the app remembers for an account besides its notes: the favourites,
 * the songs last opened with their left hands, and the display settings. The
 * browser sends the whole of it as one document, and the server keeps it as
 * it came, one object per account (`users/<address>.json`).
 */

/** A state document is small; anything larger is not one. */
export const MAX_STATE_BYTES = 256_000;

/** The key of an account, named after its address with only plain characters. */
export function stateKey(email: string): string {
  const name = email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
  return `users/${name}.json`;
}

/** The state of an account, or null when nothing is stored yet. */
export async function loadState(
  store: ObjectStore,
  email: string,
): Promise<Record<string, unknown> | null> {
  const text = await store.get(stateKey(email));
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** Stores the state of an account. Returns false for anything that is not a small object. */
export async function storeState(
  store: ObjectStore,
  email: string,
  state: unknown,
): Promise<boolean> {
  if (!isRecord(state)) return false;
  const text = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_STATE_BYTES) return false;
  await store.put(stateKey(email), text, 'application/json');
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
