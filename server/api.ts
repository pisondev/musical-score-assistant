import type { IncomingMessage, ServerResponse } from 'node:http';
import { COMMENTS_PER_DAY, DAY, readNewComment, viewComment } from './comments.ts';
import type { AppDatabase } from './database.ts';
import { finishLogin, startLogin, type GoogleClient, type LoginAttempt } from './google.ts';
import { isWellFormedSongId, loadNotes, storeNotes } from './notes-store.ts';
import type { ObjectStore } from './object-store.ts';
import { requestUrl } from './request-url.ts';
import {
  parseCookies,
  readSession,
  serializeCookie,
  signValue,
  verifyValue,
  type Account,
} from './session.ts';
import type { SongCatalog } from './song-catalog.ts';
import { deleteAccount, loadState, storeState } from './user-state.ts';

/**
 * The API of the app, under `/api`. The same handler runs inside the
 * development server, where this computer is the owner and nobody signs in,
 * and in the production server, where anybody signs in with Google.
 *
 *   GET    /api/health                  is the server up
 *   GET    /api/me                      who is signed in, and how one signs in
 *   GET    /api/auth/google/start       sends the browser to Google
 *   GET    /api/auth/google/callback    where Google sends it back
 *   POST   /api/auth/logout             ends the session
 *   GET    /api/state                   favourites, history, and settings of the account
 *   PUT    /api/state                   replaces them
 *   DELETE /api/account                 removes the account and everything kept for it
 *   GET    /api/comments[?song=<id>]    the user's comments on measures, with the replies
 *   POST   /api/comments                sends a comment on a measure to the author
 *   DELETE /api/comments?id=<id>        takes one back
 *   POST   /api/comments/seen           notes that the replies to some comments were seen
 *   GET    /api/private-songs           the index of the licensed songs under songs/private
 *   GET    /api/private-songs?id=<id>   one of them, whole
 *   GET    /api/notes?song=<id>         the owner's notes on one song
 *   PUT    /api/notes?song=<id>         replaces them
 *
 * The first five are open to everybody; the state, the account, and the comments need someone
 * signed in; the licensed songs and the notes need an owner.
 */

/** Signing in with Google, on the public server. */
export interface GoogleSignIn {
  client: GoogleClient;
  /** Signs the cookies; at least 32 characters. */
  sessionSecret: string;
  /**
   * The addresses of the owners, in lower case: they see the licensed songs and keep notes.
   * Anybody else with a verified Google address signs in as a member.
   */
  ownerEmails: string[];
  /** The address of the site, e.g. "https://music-assistant.tierratie.com". */
  origin: string;
}

export interface ApiOptions {
  /** Which songs exist, and the private ones. */
  catalog: SongCatalog;
  /** Where notes are kept, under `<song id>/notes.json`. */
  notes: ObjectStore;
  /** The users and the state of each account. */
  database: AppDatabase;
  /** Where the state of accounts was kept before the database, to move it over; optional. */
  earlierState?: ObjectStore;
  /** How people sign in. Without it nobody can, unless `localOwner` is set. */
  google?: GoogleSignIn;
  /** The owner on a development machine, who never signs in. */
  localOwner?: Account;
  /** For tests: the function that talks to Google. */
  fetch?: typeof fetch;
}

/** An owner sees the licensed songs and keeps notes; a member chooses from the public songs. */
export type Role = 'owner' | 'member';

/** Someone signed in, with their role. */
export interface SignedIn extends Account {
  role: Role;
}

/** What the browser learns about the person in front of it. */
export interface MeResponse {
  /** Whoever is signed in, or null for a guest. */
  account: SignedIn | null;
  /** "google" where one signs in with Google, "local" on a development machine, "none" otherwise. */
  signIn: 'google' | 'local' | 'none';
}

type Next = (error?: unknown) => void;
export type ApiHandler = (request: IncomingMessage, response: ServerResponse, next: Next) => void;

const SESSION_COOKIE = 'msa_session';
const LOGIN_COOKIE = 'msa_login';
const SESSION_DAYS = 30;
const LOGIN_MINUTES = 10;
/** Requests carry notes or a state document; anything larger is refused. */
const MAX_BODY = 1_000_000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function redirect(response: ServerResponse, location: string, cookies: string[] = []): void {
  response.statusCode = 302;
  if (cookies.length > 0) response.setHeader('Set-Cookie', cookies);
  response.setHeader('Location', location);
  response.setHeader('Cache-Control', 'no-store');
  response.end();
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

/** A small page that explains why signing in did not work, with a way back. */
function sendProblemPage(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign-in · Musical Score Assistant</title>
<body style="font-family: system-ui, sans-serif; max-width: 34rem; margin: 15vh auto; padding: 0 1rem; color: #0c2233">
<h1 style="font-size: 1.4rem">Signing in did not work</h1>
<p>${escapeHtml(message)}</p>
<p><a href="/">Back to the songs</a></p>
</body>
</html>`);
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(new HttpError(413, 'The request is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolveBody(JSON.parse(body || 'null'));
      } catch {
        reject(new HttpError(400, 'The request is not JSON.'));
      }
    });
    request.on('error', reject);
  });
}

/** Creates the handler. Requests outside `/api/` are passed on to `next`. */
export function createApi(options: ApiOptions): ApiHandler {
  const { catalog, database, google, localOwner } = options;
  const earlierState = options.earlierState ?? null;
  const owners = new Set(google?.ownerEmails.map((email) => email.toLowerCase()) ?? []);
  const secure = google ? google.origin.startsWith('https://') : false;

  /** Whoever is signed in behind a request, or null for a guest. */
  function userOf(request: IncomingMessage): SignedIn | null {
    if (localOwner) return { ...localOwner, role: 'owner' };
    if (!google) return null;
    const session = readSession(
      parseCookies(request.headers.cookie)[SESSION_COOKIE],
      google.sessionSecret,
    );
    if (!session) return null;
    // The role is read from the list on every request, so a change to it applies at once.
    const role: Role = owners.has(session.email.toLowerCase()) ? 'owner' : 'member';
    return { email: session.email, name: session.name, picture: session.picture, role };
  }

  function requireUser(request: IncomingMessage): SignedIn {
    const user = userOf(request);
    if (!user) throw new HttpError(401, 'Sign in to do this.');
    database.seeUser(user);
    return user;
  }

  function requireOwner(request: IncomingMessage): SignedIn {
    const user = requireUser(request);
    if (user.role !== 'owner') throw new HttpError(403, 'Only the owner may do this.');
    return user;
  }

  /** Changes come from the site itself, never from a page on another site. */
  function requireSameOrigin(request: IncomingMessage): void {
    if (!google) return;
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== google.origin) {
      throw new HttpError(403, 'The request comes from another site.');
    }
  }

  async function signInStart(url: URL, response: ServerResponse): Promise<void> {
    if (!google) throw new HttpError(404, 'Signing in is not available here.');
    const { url: target, attempt } = startLogin(
      google.client,
      url.searchParams.get('return') ?? '/',
    );
    const cookie = serializeCookie(LOGIN_COOKIE, signValue(attempt, google.sessionSecret), {
      maxAge: LOGIN_MINUTES * 60,
      secure,
    });
    redirect(response, target, [cookie]);
  }

  async function signInCallback(
    url: URL,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (!google) throw new HttpError(404, 'Signing in is not available here.');
    const clearLogin = serializeCookie(LOGIN_COOKIE, '', { maxAge: 0, secure });
    const attempt = verifyValue<LoginAttempt>(
      parseCookies(request.headers.cookie)[LOGIN_COOKIE],
      google.sessionSecret,
    );
    const code = url.searchParams.get('code');
    response.setHeader('Set-Cookie', [clearLogin]);
    if (url.searchParams.get('error')) {
      sendProblemPage(response, 400, 'The sign-in was cancelled at Google.');
      return;
    }
    if (!attempt || !code || url.searchParams.get('state') !== attempt.state) {
      sendProblemPage(
        response,
        400,
        'The sign-in took too long or was started elsewhere. Try again.',
      );
      return;
    }

    let account: Account;
    try {
      account = await finishLogin(google.client, code, attempt, options.fetch);
    } catch (error) {
      sendProblemPage(response, 502, (error as Error).message);
      return;
    }
    database.recordUser(account);

    const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    const session = serializeCookie(
      SESSION_COOKIE,
      signValue({ ...account, expires }, google.sessionSecret),
      { maxAge: SESSION_DAYS * 24 * 60 * 60, secure },
    );
    redirect(response, `${google.origin}${attempt.returnTo}`, [clearLogin, session]);
  }

  async function route(request: IncomingMessage, response: ServerResponse, url: URL) {
    const method = request.method ?? 'GET';
    const path = url.pathname;

    if (path === '/api/health' && method === 'GET') {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (path === '/api/me' && method === 'GET') {
      const account = userOf(request);
      if (account) database.seeUser(account);
      const body: MeResponse = {
        account,
        signIn: localOwner ? 'local' : google ? 'google' : 'none',
      };
      sendJson(response, 200, body);
      return;
    }
    if (path === '/api/auth/google/start' && method === 'GET') return signInStart(url, response);
    if (path === '/api/auth/google/callback' && method === 'GET') {
      return signInCallback(url, request, response);
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      requireSameOrigin(request);
      response.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure }));
      sendJson(response, 200, { ok: true });
      return;
    }

    // The index of the private songs for the library, or one of them, whole, for its page.
    if (path === '/api/private-songs' && method === 'GET') {
      requireOwner(request);
      const songId = url.searchParams.get('id');
      if (songId === null) {
        sendJson(response, 200, { songs: await catalog.privateIndex() });
        return;
      }
      const song = await catalog.privateSong(songId);
      if (!song) throw new HttpError(404, 'There is no such song.');
      sendJson(response, 200, { song });
      return;
    }

    if (path === '/api/notes') {
      requireOwner(request);
      const songId = url.searchParams.get('song') ?? '';
      if (method === 'GET') {
        const notes = await loadNotes(options.notes, catalog, songId);
        if (!notes) throw new HttpError(404, 'There is no such song.');
        sendJson(response, 200, { notes });
        return;
      }
      if (method === 'PUT') {
        requireSameOrigin(request);
        const body = await readBody(request);
        if (!(await storeNotes(options.notes, catalog, songId, body))) {
          throw new HttpError(404, 'There is no such song.');
        }
        sendJson(response, 200, { notes: (await loadNotes(options.notes, catalog, songId)) ?? [] });
        return;
      }
    }

    if (path === '/api/state') {
      const user = requireUser(request);
      if (method === 'GET') {
        sendJson(response, 200, { state: await loadState(database, earlierState, user.email) });
        return;
      }
      if (method === 'PUT') {
        requireSameOrigin(request);
        const body = await readBody(request);
        if (!storeState(database, user.email, body)) {
          throw new HttpError(400, 'The state must be a small JSON object.');
        }
        sendJson(response, 200, { ok: true });
        return;
      }
    }

    if (path === '/api/comments' && method === 'GET') {
      const user = requireUser(request);
      const songId = url.searchParams.get('song') ?? undefined;
      sendJson(response, 200, {
        comments: database.commentsOf(user.email, songId).map(viewComment),
      });
      return;
    }
    if (path === '/api/comments' && method === 'POST') {
      const user = requireUser(request);
      requireSameOrigin(request);
      const comment = readNewComment(await readBody(request));
      if (typeof comment === 'string') throw new HttpError(400, comment);
      // Only a song the user may open: a member does not know the licensed ones.
      const allowed =
        isWellFormedSongId(comment.songId) &&
        (user.role === 'owner' || !comment.songId.startsWith('private/')) &&
        (await catalog.has(comment.songId));
      if (!allowed) throw new HttpError(404, 'There is no such song.');
      if (database.countCommentsSince(user.email, Date.now() - DAY) >= COMMENTS_PER_DAY) {
        throw new HttpError(429, `At most ${COMMENTS_PER_DAY} comments a day; try again tomorrow.`);
      }
      const stored = database.addComment(user.email, comment.songId, comment.place, comment.text);
      sendJson(response, 201, { comment: viewComment(stored) });
      return;
    }
    if (path === '/api/comments' && method === 'DELETE') {
      const user = requireUser(request);
      requireSameOrigin(request);
      const id = Number(url.searchParams.get('id'));
      if (!Number.isInteger(id) || !database.deleteComment(user.email, id)) {
        throw new HttpError(404, 'There is no such comment.');
      }
      sendJson(response, 200, { ok: true });
      return;
    }
    if (path === '/api/comments/seen' && method === 'POST') {
      const user = requireUser(request);
      requireSameOrigin(request);
      const body = await readBody(request);
      const ids = (body as { ids?: unknown } | null)?.ids;
      if (!Array.isArray(ids) || ids.length > 1000) throw new HttpError(400, 'Send a list of ids.');
      database.markRepliesSeen(
        user.email,
        ids.map(Number).filter((id) => Number.isInteger(id)),
      );
      sendJson(response, 200, { ok: true });
      return;
    }

    // Everything kept for the account goes, and the session with it.
    if (path === '/api/account' && method === 'DELETE') {
      const user = requireUser(request);
      requireSameOrigin(request);
      await deleteAccount(database, earlierState, user.email);
      response.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure }));
      sendJson(response, 200, { ok: true });
      return;
    }

    throw new HttpError(404, 'There is no such endpoint.');
  }

  return (request, response, next) => {
    const url = requestUrl(request.url);
    if (!url) {
      sendJson(response, 400, { error: 'The address of the request is not a path.' });
      return;
    }
    if (!url.pathname.startsWith('/api/')) {
      next();
      return;
    }
    route(request, response, url).catch((error: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      console.error(error);
      sendJson(response, 500, { error: 'Something went wrong on the server.' });
    });
  };
}
