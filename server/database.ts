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
  // Comments on measures: messages to the author, read later and answered when there is time.
  `CREATE TABLE comments (
     id INTEGER PRIMARY KEY,
     email TEXT NOT NULL REFERENCES users (email) ON DELETE CASCADE,
     song_id TEXT NOT NULL,
     place TEXT NOT NULL,
     text TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     read_at INTEGER,
     reply TEXT,
     replied_at INTEGER,
     reply_seen_at INTEGER
   );
   CREATE INDEX comments_by_user ON comments (email, song_id);
   CREATE INDEX comments_unread ON comments (read_at) WHERE read_at IS NULL;`,
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

/**
 * A comment on a measure. `place` is where it was written and what was on the sheet (the part,
 * the measure, the left hand, the right-hand mode, the key), kept as JSON as the app sent it.
 */
export interface CommentRecord {
  id: number;
  songId: string;
  place: Record<string, unknown>;
  text: string;
  createdAt: number;
  /** When the author fetched it to read. */
  readAt: number | null;
  reply: string | null;
  repliedAt: number | null;
  /** When the person who wrote it saw the reply. */
  replySeenAt: number | null;
}

/** A comment as the author reads it: with who wrote it, but not their address. */
export interface InboxComment extends CommentRecord {
  /** The name Google reported, and a short tag that tells two people of one name apart. */
  author: string;
}

interface CommentRow {
  id: number;
  song_id: string;
  place: string;
  text: string;
  created_at: number;
  read_at: number | null;
  reply: string | null;
  replied_at: number | null;
  reply_seen_at: number | null;
}

function toComment(row: CommentRow): CommentRecord {
  let place: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(row.place);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      place = value as Record<string, unknown>;
    }
  } catch {
    place = {};
  }
  return {
    id: row.id,
    songId: row.song_id,
    place,
    text: row.text,
    createdAt: row.created_at,
    readAt: row.read_at,
    reply: row.reply,
    repliedAt: row.replied_at,
    replySeenAt: row.reply_seen_at,
  };
}

const COMMENT_COLUMNS =
  'id, song_id, place, text, created_at, read_at, reply, replied_at, reply_seen_at';

/** How often the moment a user was last seen is written: at most once an hour. */
const SEEN_INTERVAL = 60 * 60 * 1000;

/** A short tag for an address that does not give the address away. */
function authorTag(email: string): string {
  let hash = 2166136261;
  for (const character of email.toLowerCase()) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6);
}

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

  /** Adds a comment of a user, who must have a record; returns it. */
  addComment(
    email: string,
    songId: string,
    place: Record<string, unknown>,
    text: string,
    now = Date.now(),
  ): CommentRecord {
    const { lastInsertRowid } = this.db
      .prepare(
        'INSERT INTO comments (email, song_id, place, text, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(email.toLowerCase(), songId, JSON.stringify(place), text, now);
    return this.commentsOf(email).find((comment) => comment.id === Number(lastInsertRowid))!;
  }

  /** The comments of a user, on one song or on all of them, oldest first. */
  commentsOf(email: string, songId?: string): CommentRecord[] {
    const rows = (songId === undefined
      ? this.db
          .prepare(`SELECT ${COMMENT_COLUMNS} FROM comments WHERE email = ? ORDER BY id`)
          .all(email.toLowerCase())
      : this.db
          .prepare(
            `SELECT ${COMMENT_COLUMNS} FROM comments WHERE email = ? AND song_id = ? ORDER BY id`,
          )
          .all(email.toLowerCase(), songId)) as unknown as CommentRow[];
    return rows.map(toComment);
  }

  /** How many comments a user has written since a moment, for the daily limit. */
  countCommentsSince(email: string, since: number): number {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS count FROM comments WHERE email = ? AND created_at >= ?')
        .get(email.toLowerCase(), since) as { count: number }
    ).count;
  }

  /** Removes a comment of a user; false when the user has none by that id. */
  deleteComment(email: string, id: number): boolean {
    const { changes } = this.db
      .prepare('DELETE FROM comments WHERE id = ? AND email = ?')
      .run(id, email.toLowerCase());
    return Number(changes) > 0;
  }

  /** Notes that a user has seen the replies to some of their comments. */
  markRepliesSeen(email: string, ids: number[], now = Date.now()): void {
    const statement = this.db.prepare(
      'UPDATE comments SET reply_seen_at = ? WHERE id = ? AND email = ? AND reply IS NOT NULL AND reply_seen_at IS NULL',
    );
    for (const id of ids) statement.run(now, id, email.toLowerCase());
  }

  /**
   * The comments for the author to read: those not fetched before, or with `all` every one.
   * Unless `peek` is set, the ones not fetched before are marked as read, which the people who
   * wrote them see.
   */
  inbox({ all = false, peek = false } = {}, now = Date.now()): InboxComment[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.song_id, c.place, c.text, c.created_at, c.read_at, c.reply, c.replied_at,
                c.reply_seen_at, c.email, u.name
         FROM comments c JOIN users u ON u.email = c.email
         ${all ? '' : 'WHERE c.read_at IS NULL'}
         ORDER BY c.id`,
      )
      .all() as unknown as (CommentRow & { email: string; name: string })[];
    if (!peek) {
      const mark = this.db.prepare(
        'UPDATE comments SET read_at = ? WHERE id = ? AND read_at IS NULL',
      );
      for (const row of rows) if (row.read_at === null) mark.run(now, row.id);
    }
    return rows.map((row) => ({
      ...toComment(row),
      author: `${row.name} (${authorTag(row.email)})`,
    }));
  }

  /** Writes the author's reply to a comment; false when there is no such comment. */
  reply(id: number, reply: string, now = Date.now()): boolean {
    const { changes } = this.db
      .prepare(
        'UPDATE comments SET reply = ?, replied_at = ?, reply_seen_at = NULL, read_at = COALESCE(read_at, ?) WHERE id = ?',
      )
      .run(reply, now, now, id);
    return Number(changes) > 0;
  }

  /** Writes a consistent copy of the whole database to `file`, which must not exist yet. */
  copyTo(file: string): void {
    this.db.prepare('VACUUM INTO ?').run(file);
  }

  close(): void {
    this.db.close();
  }
}
