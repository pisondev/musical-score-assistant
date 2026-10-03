import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * A place to keep small text files by key, like "users/a@b.c.json". On the
 * public server it is the R2 bucket (`r2-store.ts`); on a development machine,
 * and on a server without R2, it is a folder on disk.
 */

/** A stored object: its key, and a tag that changes whenever its content does. */
export interface StoredObject {
  key: string;
  etag: string;
}

export interface ObjectStore {
  /** The text of an object, or null when there is none. */
  get(key: string): Promise<string | null>;
  put(key: string, body: string, contentType?: string): Promise<void>;
  /** Removes an object; removing one that does not exist is not an error. */
  delete(key: string): Promise<void>;
  /** Every object whose key starts with the prefix. */
  list(prefix: string): Promise<StoredObject[]>;
}

/** Keys are paths of plain names: no "..", no empty parts, no leading slash. */
const SAFE_KEY = /^[A-Za-z0-9_][A-Za-z0-9._@+-]*(\/[A-Za-z0-9_][A-Za-z0-9._@+-]*)*$/;

export function isSafeKey(key: string): boolean {
  return SAFE_KEY.test(key) && !key.split('/').includes('..');
}

function checkKey(key: string): void {
  if (!isSafeKey(key)) throw new Error(`Not a valid key: ${key}`);
}

/** Writes a file through a temporary one, so a reader never sees half of it. */
export function writeFileAtomically(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
}

/** Objects as files below a folder: the key is the path of the file. */
export class FileStore implements ObjectStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    checkKey(key);
    return join(this.root, ...key.split('/'));
  }

  async get(key: string): Promise<string | null> {
    const file = this.path(key);
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  }

  async put(key: string, body: string): Promise<void> {
    writeFileAtomically(this.path(key), body);
  }

  async delete(key: string): Promise<void> {
    rmSync(this.path(key), { force: true });
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    const walk = (folder: string) => {
      if (!existsSync(folder)) return;
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        const key = relative(this.root, path).split(sep).join('/');
        if (!key.startsWith(prefix) || key.endsWith('.tmp')) continue;
        const stats = statSync(path);
        objects.push({ key, etag: `${stats.mtimeMs}-${stats.size}` });
      }
    };
    walk(this.root);
    return objects.sort((a, b) => a.key.localeCompare(b.key));
  }
}

/** The part of a store below a prefix, as if it were a store of its own. */
export function scopedStore(store: ObjectStore, prefix: string): ObjectStore {
  const base = prefix.endsWith('/') ? prefix : `${prefix}/`;
  return {
    get: (key) => store.get(base + key),
    put: (key, body, contentType) => store.put(base + key, body, contentType),
    delete: (key) => store.delete(base + key),
    list: async (within) =>
      (await store.list(base + within)).map((object) => ({
        ...object,
        key: object.key.slice(base.length),
      })),
  };
}
