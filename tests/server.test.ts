import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi, type ApiOptions } from '../server/api';
import { readServerConfig } from '../server/config';
import {
  accountFromClaims,
  decodeJwtClaims,
  finishLogin,
  safeReturnTo,
  startLogin,
  type GoogleClient,
} from '../server/google';
import { readPrivateSongs } from '../server/private-songs';
import {
  parseCookies,
  readSession,
  serializeCookie,
  signValue,
  verifyValue,
} from '../server/session';
import { resolveStaticPath, serveStatic } from '../server/static-files';
import { loadState, stateKey, storeState } from '../server/user-state';
import { FileStore, isSafeKey, scopedStore } from '../server/object-store';
import { folderCatalog } from '../server/song-catalog';

const SECRET = 'a-secret-that-is-long-enough-for-tests-0123456789';
const ORIGIN = 'https://music.example.test';
const OWNER = 'owner@example.test';
const CLIENT: GoogleClient = {
  clientId: 'client-id.apps.googleusercontent.com',
  clientSecret: 'client-secret',
  redirectUri: `${ORIGIN}/api/auth/google/callback`,
};

const SONG = `
title: Private song
key: F
time: 4/4
| [F]1 . 2 3 | [C]5 . 4 2 | [F]1 . . . ||
`;

/** An unsigned JWT with the given claims, as Google's token endpoint would wrap them. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.signature`;
}

const claimsFor = (email: string, nonce: string) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT.clientId,
  exp: Math.floor(Date.now() / 1000) + 3600,
  nonce,
  email,
  email_verified: true,
  name: 'The Owner',
  picture: 'https://example.test/picture.png',
});

/** A stand-in for Google's token endpoint that answers for whoever `next.email` names. */
function fakeGoogle() {
  const next = { email: OWNER, requests: [] as URLSearchParams[] };
  const fetchImplementation = (async (_url: unknown, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body));
    next.requests.push(body);
    const verifier = body.get('code_verifier') ?? '';
    // The nonce travels in the code in these tests, so the fake can echo it.
    const [, nonce] = (body.get('code') ?? '').split(':');
    return new Response(
      JSON.stringify({ id_token: idToken({ ...claimsFor(next.email, nonce), verifier }) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;
  return { next, fetch: fetchImplementation };
}

describe('signed values and cookies', () => {
  it('read back what was signed, and nothing that was changed', () => {
    const token = signValue({ email: OWNER }, SECRET);
    expect(verifyValue(token, SECRET)).toEqual({ email: OWNER });
    expect(verifyValue(token, `${SECRET}x`)).toBeNull();
    const [body, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ email: 'someone@else.test' })).toString(
      'base64url',
    );
    expect(verifyValue(`${forged}.${mac}`, SECRET)).toBeNull();
    expect(verifyValue(`${body}.`, SECRET)).toBeNull();
    expect(verifyValue(undefined, SECRET)).toBeNull();
    expect(verifyValue('no-dot', SECRET)).toBeNull();
  });

  it('end a session when it runs out', () => {
    const token = signValue({ email: OWNER, name: 'O', expires: 2_000 }, SECRET);
    expect(readSession(token, SECRET, 1_000)?.email).toBe(OWNER);
    expect(readSession(token, SECRET, 3_000)).toBeNull();
    expect(readSession(signValue({ name: 'no email' }, SECRET), SECRET)).toBeNull();
  });

  it('are parsed and written with the safe flags', () => {
    expect(parseCookies('a=1; b=two%20words; broken; =x')).toEqual({ a: '1', b: 'two words' });
    expect(parseCookies(undefined)).toEqual({});
    const cookie = serializeCookie('s', 'v w', { maxAge: 60, secure: true });
    expect(cookie).toBe('s=v%20w; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure');
    expect(serializeCookie('s', '', { maxAge: 0, secure: false })).not.toContain('Secure');
  });
});

describe('signing in with Google', () => {
  it('sends the browser to Google with a code challenge for the verifier', () => {
    const { url, attempt } = startLogin(CLIENT, '#song=amazing-grace');
    const parameters = new URL(url).searchParams;
    expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
    expect(parameters.get('client_id')).toBe(CLIENT.clientId);
    expect(parameters.get('redirect_uri')).toBe(CLIENT.redirectUri);
    expect(parameters.get('scope')).toBe('openid email profile');
    expect(parameters.get('state')).toBe(attempt.state);
    expect(parameters.get('nonce')).toBe(attempt.nonce);
    expect(parameters.get('code_challenge_method')).toBe('S256');
    expect(parameters.get('code_challenge')).toBe(
      createHash('sha256').update(attempt.verifier).digest('base64url'),
    );
    expect(attempt.returnTo).toBe('/#song=amazing-grace');
  });

  it('returns only to places on the site itself', () => {
    expect(safeReturnTo('/#song=x')).toBe('/#song=x');
    expect(safeReturnTo('#song=x')).toBe('/#song=x');
    expect(safeReturnTo('https://evil.test/')).toBe('/');
    expect(safeReturnTo('//evil.test/')).toBe('/');
    expect(safeReturnTo('/\\evil.test')).toBe('/');
    expect(safeReturnTo(null)).toBe('/');
  });

  it('accepts a token meant for this app and nothing else', () => {
    const nonce = 'n';
    const valid = claimsFor('Owner@Example.Test', nonce);
    expect(accountFromClaims(valid, CLIENT, nonce)).toEqual({
      email: OWNER,
      name: 'The Owner',
      picture: 'https://example.test/picture.png',
    });
    const reject = (claims: Record<string, unknown>) => () =>
      accountFromClaims(claims, CLIENT, nonce);
    expect(reject({ ...valid, iss: 'https://evil.test' })).toThrow(/not from Google/);
    expect(reject({ ...valid, aud: 'another-app' })).toThrow(/another app/);
    expect(reject({ ...valid, exp: 1 })).toThrow(/expired/);
    expect(reject({ ...valid, nonce: 'other' })).toThrow(/another sign-in/);
    expect(reject({ ...valid, email_verified: false })).toThrow(/not verified/);
    expect(accountFromClaims({ ...valid, name: undefined }, CLIENT, nonce).name).toBe(OWNER);
  });

  it('trades the code for the account, with the verifier', async () => {
    const google = fakeGoogle();
    const { attempt } = startLogin(CLIENT, '/');
    const account = await finishLogin(CLIENT, `code:${attempt.nonce}`, attempt, google.fetch);
    expect(account.email).toBe(OWNER);
    expect(google.next.requests[0].get('code_verifier')).toBe(attempt.verifier);
    expect(google.next.requests[0].get('client_secret')).toBe(CLIENT.clientSecret);
    expect(() => decodeJwtClaims('not-a-token')).toThrow(/malformed/);
  });

  it('reports a refused code', async () => {
    const refusing = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as typeof fetch;
    const { attempt } = startLogin(CLIENT, '/');
    await expect(finishLogin(CLIENT, 'code', attempt, refusing)).rejects.toThrow(/invalid_grant/);
  });
});

/** A running API on a free port, with a songs folder that holds one private song. */
async function startApi(options: Partial<ApiOptions> & { fetch?: typeof fetch }) {
  const root = mkdtempSync(join(tmpdir(), 'api-'));
  const songsDir = join(root, 'songs');
  mkdirSync(join(songsDir, 'private', 'kj-1-song'), { recursive: true });
  writeFileSync(join(songsDir, 'private', 'kj-1-song', 'song.txt'), SONG);
  writeFileSync(join(songsDir, 'private', 'kj-1-song', 'arrangements.json'), '{"arrangements":[]}');
  mkdirSync(join(songsDir, 'public-song'));
  writeFileSync(join(songsDir, 'public-song', 'song.txt'), SONG);
  const api = createApi({
    catalog: folderCatalog(songsDir),
    notes: new FileStore(join(root, 'data', 'notes')),
    state: new FileStore(join(root, 'data')),
    ...options,
  });
  const server: Server = createServer((request, response) =>
    api(request, response, () => {
      response.statusCode = 299;
      response.end('passed on');
    }),
  );
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    root,
    base,
    request: (path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, { redirect: 'manual', ...init }),
    stop: async () => {
      await new Promise((done) => server.close(done));
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const cookieOf = (response: Response, name: string) => {
  const line = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  return line ? line.split(';')[0] : undefined;
};

describe('the API on the public server', () => {
  const google = fakeGoogle();
  let api: Awaited<ReturnType<typeof startApi>>;
  let session = '';

  beforeAll(async () => {
    api = await startApi({
      google: { client: CLIENT, sessionSecret: SECRET, allowedEmails: [OWNER], origin: ORIGIN },
      fetch: google.fetch,
    });
  });
  afterAll(() => api.stop());

  /** Goes through the whole sign-in as the account `email`, returning the last response. */
  async function signIn(email: string) {
    google.next.email = email;
    const start = await api.request('/api/auth/google/start?return=%23song%3Dpublic-song');
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    const nonce = new URL(start.headers.get('location')!).searchParams.get('nonce');
    const login = cookieOf(start, 'msa_login')!;
    return api.request(`/api/auth/google/callback?code=code:${nonce}&state=${state}`, {
      headers: { cookie: login },
    });
  }

  it('treats a visitor as a guest who may sign in', async () => {
    const me = await (await api.request('/api/me')).json();
    expect(me).toEqual({ account: null, signIn: 'google' });
    expect((await api.request('/api/health')).status).toBe(200);
  });

  it('keeps private songs, notes, and state from guests', async () => {
    for (const path of ['/api/private-songs', '/api/notes?song=public-song', '/api/state']) {
      expect((await api.request(path)).status).toBe(401);
    }
  });

  it('passes requests outside the API on', async () => {
    expect((await api.request('/index.html')).status).toBe(299);
  });

  it('refuses a callback that it did not start', async () => {
    const response = await api.request('/api/auth/google/callback?code=x&state=y');
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Signing in did not work');
  });

  it('refuses an account that is not on the list', async () => {
    const response = await signIn('stranger@example.test');
    expect(response.status).toBe(403);
    expect(await response.text()).toContain('stranger@example.test may not sign in');
    expect(cookieOf(response, 'msa_session')).toBeUndefined();
  });

  it('signs the owner in and returns to where they were', async () => {
    const response = await signIn(OWNER);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/#song=public-song`);
    session = cookieOf(response, 'msa_session')!;
    expect(session).toBeDefined();
    const me = await (await api.request('/api/me', { headers: { cookie: session } })).json();
    expect(me.account).toEqual({
      email: OWNER,
      name: 'The Owner',
      picture: 'https://example.test/picture.png',
    });
  });

  it('gives the owner the private songs', async () => {
    const body = await (
      await api.request('/api/private-songs', { headers: { cookie: session } })
    ).json();
    expect(body.songs).toEqual([
      { id: 'private/kj-1-song', song: SONG, arrangements: { arrangements: [] } },
    ]);
  });

  it('keeps the notes of the owner, from the site only', async () => {
    const note = {
      id: 'n1',
      part: 'song',
      measure: 2,
      where: 'Measure 2',
      text: 'Softer here.',
      context: {},
      createdAt: '2026-10-03T08:00:00.000Z',
      updatedAt: '2026-10-03T08:00:00.000Z',
    };
    const put = (origin: string) =>
      api.request('/api/notes?song=private/kj-1-song', {
        method: 'PUT',
        headers: { cookie: session, origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: [note] }),
      });
    expect((await put('https://evil.test')).status).toBe(403);
    expect((await put(ORIGIN)).status).toBe(200);
    const body = await (
      await api.request('/api/notes?song=private/kj-1-song', { headers: { cookie: session } })
    ).json();
    expect(body.notes.map((found: { text: string }) => found.text)).toEqual(['Softer here.']);
    expect(
      (await api.request('/api/notes?song=../escape', { headers: { cookie: session } })).status,
    ).toBe(404);
  });

  it('keeps the state of the owner', async () => {
    const state = { version: 1, history: { favourites: ['public-song'], opened: {} } };
    const put = await api.request('/api/state', {
      method: 'PUT',
      headers: { cookie: session, origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    expect(put.status).toBe(200);
    const body = await (await api.request('/api/state', { headers: { cookie: session } })).json();
    expect(body.state).toEqual(state);
    const refused = await api.request('/api/state', {
      method: 'PUT',
      headers: { cookie: session, origin: ORIGIN, 'Content-Type': 'application/json' },
      body: '[1, 2]',
    });
    expect(refused.status).toBe(400);
  });

  it('signs out by clearing the cookie', async () => {
    const response = await api.request('/api/auth/logout', {
      method: 'POST',
      headers: { cookie: session, origin: ORIGIN },
    });
    expect(response.status).toBe(200);
    expect(cookieOf(response, 'msa_session')).toBe('msa_session=');
  });

  it('shuts out an address once it is taken off the list', async () => {
    const stricter = await startApi({
      google: { client: CLIENT, sessionSecret: SECRET, allowedEmails: [], origin: ORIGIN },
    });
    try {
      const response = await stricter.request('/api/private-songs', {
        headers: { cookie: session },
      });
      expect(response.status).toBe(401);
    } finally {
      await stricter.stop();
    }
  });
});

describe('the API on a development machine', () => {
  it('treats the computer as the owner, without signing in', async () => {
    const api = await startApi({ localOwner: { email: 'owner@localhost', name: 'This computer' } });
    try {
      const me = await (await api.request('/api/me')).json();
      expect(me).toEqual({
        account: { email: 'owner@localhost', name: 'This computer' },
        signIn: 'local',
      });
      expect((await api.request('/api/private-songs')).status).toBe(200);
      expect((await api.request('/api/auth/google/start')).status).toBe(404);
    } finally {
      await api.stop();
    }
  });

  it('lets nobody in without a way to sign in', async () => {
    const api = await startApi({});
    try {
      expect(await (await api.request('/api/me')).json()).toEqual({
        account: null,
        signIn: 'none',
      });
      expect((await api.request('/api/private-songs')).status).toBe(401);
    } finally {
      await api.stop();
    }
  });
});

describe('the files of the server', () => {
  const root = mkdtempSync(join(tmpdir(), 'files-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('finds private songs in nested folders and survives a broken file', () => {
    const songs = join(root, 'songs');
    mkdirSync(join(songs, 'private', 'kk', 'kk-1'), { recursive: true });
    writeFileSync(join(songs, 'private', 'kk', 'kk-1', 'song.txt'), SONG);
    writeFileSync(join(songs, 'private', 'kk', 'kk-1', 'arrangements.json'), '{ broken');
    expect(readPrivateSongs(songs)).toEqual([
      { id: 'private/kk/kk-1', song: SONG, arrangements: null },
    ]);
    expect(readPrivateSongs(join(root, 'missing'))).toEqual([]);
  });

  it('keep the state of an account in an object of its own', async () => {
    const data = new FileStore(join(root, 'data'));
    expect(stateKey('A.B+c@Example.test')).toBe('users/a.b_c@example.test.json');
    expect(await loadState(data, OWNER)).toBeNull();
    expect(await storeState(data, OWNER, { a: 1 })).toBe(true);
    expect(await loadState(data, OWNER)).toEqual({ a: 1 });
    expect(await storeState(data, OWNER, [1])).toBe(false);
    expect(await storeState(data, OWNER, { big: 'x'.repeat(300_000) })).toBe(false);
  });

  it('keep objects as files, and nothing outside their folder', async () => {
    const store = new FileStore(join(root, 'objects'));
    await store.put('notes/a/notes.json', '{}');
    await store.put('users/b.json', '[]');
    expect(await store.get('notes/a/notes.json')).toBe('{}');
    expect(await store.get('missing.json')).toBeNull();
    expect((await store.list('notes/')).map((object) => object.key)).toEqual([
      'notes/a/notes.json',
    ]);
    const notes = scopedStore(store, 'notes');
    expect((await notes.list('')).map((object) => object.key)).toEqual(['a/notes.json']);
    expect(await notes.get('a/notes.json')).toBe('{}');
    await store.delete('users/b.json');
    await store.delete('users/b.json');
    expect(await store.get('users/b.json')).toBeNull();
    for (const unsafe of ['../outside', 'a/../../b', '/etc/passwd', '', 'a//b']) {
      expect(isSafeKey(unsafe)).toBe(false);
      await expect(store.get(unsafe)).rejects.toThrow(/valid key/);
    }
  });

  it('serve the built site and nothing outside it', async () => {
    const site = join(root, 'site');
    mkdirSync(join(site, 'assets'), { recursive: true });
    writeFileSync(join(site, 'index.html'), '<!doctype html><title>App</title>');
    writeFileSync(join(site, 'assets', 'app-1234.js'), 'console.log(1)');
    writeFileSync(join(root, 'secret.txt'), 'secret');

    expect(resolveStaticPath(site, '/../secret.txt')).toBe(join(site, 'secret.txt'));
    expect(resolveStaticPath(site, '/%2e%2e/secret.txt')).toBe(join(site, 'secret.txt'));
    expect(resolveStaticPath(site, '/%00')).toBeNull();

    const server = createServer((request, response) => serveStatic(site, request, response));
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const page = await fetch(`${base}/`);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      expect(page.headers.get('cache-control')).toBe('no-cache');
      const asset = await fetch(`${base}/assets/app-1234.js`);
      expect(asset.headers.get('cache-control')).toContain('immutable');
      expect((await fetch(`${base}/missing.js`)).status).toBe(404);
      expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });
});

describe('the configuration of the server', () => {
  it('is read from the environment', () => {
    const config = readServerConfig({
      PORT: '3020',
      PUBLIC_ORIGIN: 'https://music.example.test/',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      SESSION_SECRET: SECRET,
      ALLOWED_EMAILS: ' Owner@Example.test , second@example.test ',
      R2_ACCOUNT_ID: 'account',
      R2_ACCESS_KEY_ID: 'id',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'music-assistant',
    });
    expect(config.port).toBe(3020);
    expect(config.r2?.bucket).toBe('music-assistant');
    expect(config.google?.origin).toBe('https://music.example.test');
    expect(config.google?.client.redirectUri).toBe(
      'https://music.example.test/api/auth/google/callback',
    );
    expect(config.google?.allowedEmails).toEqual([OWNER, 'second@example.test']);
    expect(config.warnings).toEqual([]);
  });

  it('warns about what is missing and still starts', () => {
    const config = readServerConfig({});
    expect(config.google).toBeNull();
    expect(config.warnings.join(' ')).toMatch(/SESSION_SECRET/);
    expect(config.warnings.join(' ')).toMatch(/signing in is off/);
    expect(config.r2).toBeNull();
    expect(config.warnings.join(' ')).toMatch(/R2 is not configured/);
  });
});
