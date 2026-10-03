import type { DatabaseSync } from 'node:sqlite';

/**
 * What the server keeps about the people who sign in, in one SQLite file beside the other data
 * of the server (`app.db`): who they are and what the app remembers for them. Songs are not
 * kept here; they are files, written in the editor and checked before they are published.
 *
 * Node has SQLite built in from version 22.13 (`node:sqlite`); 22.5 to 22.12 need the flag
 * `--experimental-sqlite`, which `scripts/node-with-sqlite.mjs` adds.
 */

/**
 * The SQLite module of Node, taken when a database is opened rather than imported: the Vite
 * configuration loads this file, and a build must start on a Node that lacks the module.
 */
function sqlite(): typeof import('node:sqlite') {
  const module = process.getBuiltinModule('node:sqlite') as
    typeof import('node:sqlite') | undefined;
  if (!module) {
    throw new Error(
      'This Node has no node:sqlite. Use Node 22.13 or newer, or start it with --experimental-sqlite (npm run dev and npm start do).',
    );
  }
  return module;
}

/**
 * The schema, one step per version. A database is brought up to date when it is opened, and
 * `PRAGMA user_version` records how far it has come. Steps are only ever added.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE users (
     email TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     picture TEXT,
     created_at INTEGER NOT NULL,
     last_seen_at INTEGER NOT NULL
   );
   CREATE TABLE user_state (
     email TEXT PRIMARY KEY REFERENCES users (email) ON DELETE CASCADE,
     state TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
];

/** Someone who has signed in, as Google reported them. */
export interface UserProfile {
  email: string;
  name: string;
  picture?: string;
}

/** A user as the database keeps them. */
export interface UserRecord extends UserProfile {
  createdAt: number;
  lastSeenAt: number;
}

/** How often the moment a user was last seen is written: at most once an hour. */
const SEEN_INTERVAL = 60 * 60 * 1000;

export class AppDatabase {
  private readonly db: DatabaseSync;

  /** Opens (or creates) the database in `file`; `:memory:` keeps one in memory, for tests. */
  constructor(file: string) {
    this.db = new (sqlite().DatabaseSync)(file);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
    );
    this.migrate();
  }

  private migrate(): void {
    const { user_version: version } = this.db.prepare('PRAGMA user_version').get() as {
      user_version: number;
    };
    for (let step = version; step < MIGRATIONS.length; step += 1) {
      this.db.exec('BEGIN');
      try {
        this.db.exec(MIGRATIONS[step]);
        this.db.exec(`PRAGMA user_version = ${step + 1}`);
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }

  /** The version of the schema, for the tests. */
  get version(): number {
    return (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  }

  /**
   * Records a user who signs in or comes back: a new one is added, a known one gets the name
   * and the picture Google reports now, and the moment they were last seen.
   */
  recordUser(profile: UserProfile, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO users (email, name, picture, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (email) DO UPDATE SET
           name = excluded.name, picture = excluded.picture, last_seen_at = excluded.last_seen_at`,
      )
      .run(profile.email.toLowerCase(), profile.name, profile.picture ?? null, now, now);
  }

  /**
   * Makes sure a signed-in user has a record, and notes that they were seen. Cheap enough for
   * every request: the moment is written at most once an hour.
   */
  seeUser(profile: UserProfile, now = Date.now()): void {
    const known = this.user(profile.email);
    if (!known) this.recordUser(profile, now);
    else if (now - known.lastSeenAt >= SEEN_INTERVAL) {
      this.db
        .prepare('UPDATE users SET last_seen_at = ? WHERE email = ?')
        .run(now, profile.email.toLowerCase());
    }
  }

  user(email: string): UserRecord | null {
    const row = this.db
      .prepare('SELECT email, name, picture, created_at, last_seen_at FROM users WHERE email = ?')
      .get(email.toLowerCase()) as
      | {
          email: string;
          name: string;
          picture: string | null;
          created_at: number;
          last_seen_at: number;
        }
      | undefined;
    if (!row) return null;
    return {
      email: row.email,
      name: row.name,
      ...(row.picture ? { picture: row.picture } : {}),
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  countUsers(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number })
      .count;
  }

  /** The state document of a user as it was stored, or null. */
  stateOf(email: string): string | null {
    const row = this.db
      .prepare('SELECT state FROM user_state WHERE email = ?')
      .get(email.toLowerCase()) as { state: string } | undefined;
    return row ? row.state : null;
  }

  /** Stores the state document of a user, who must have a record. */
  storeState(email: string, state: string, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO user_state (email, state, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (email) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run(email.toLowerCase(), state, now);
  }

  /** Removes a user and everything kept for them. */
  deleteUser(email: string): void {
    this.db.prepare('DELETE FROM users WHERE email = ?').run(email.toLowerCase());
  }

  /** Writes a consistent copy of the whole database to `file`, which must not exist yet. */
  copyTo(file: string): void {
    this.db.prepare('VACUUM INTO ?').run(file);
  }

  close(): void {
    this.db.close();
  }
}
