import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scopedStore } from '../server/object-store';
import { parseListing, R2Store, r2ConfigFrom } from '../server/r2-store';
import { storeCatalog } from '../server/song-catalog';

const SONG = `
title: Private song
key: F
time: 4/4
| [F]1 . 2 3 | [C]5 . 4 2 | [F]1 . . . ||
`;

const R2_CONFIG = {
  accountId: 'account',
  accessKeyId: 'key-id',
  secretAccessKey: 'key-secret',
  bucket: 'music-assistant',
};

const md5 = (text: string) => createHash('md5').update(text).digest('hex');
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A stand-in for R2's S3 API that keeps objects in memory and records what it was asked. */
function fakeR2() {
  const objects = new Map<string, string>();
  const requests: Request[] = [];

  function listing(url: URL): Response {
    const prefix = url.searchParams.get('prefix') ?? '';
    const keys = [...objects.keys()].filter((name) => name.startsWith(prefix)).sort();
    // Two objects per page, so that continuation is exercised.
    const start = Number(url.searchParams.get('continuation-token') ?? 0);
    const page = keys.slice(start, start + 2);
    const more = start + 2 < keys.length;
    const contents = page
      .map(
        (name) =>
          `<Contents><Key>${escapeXml(name)}</Key><ETag>&quot;${md5(objects.get(name)!)}&quot;</ETag></Contents>`,
      )
      .join('');
    const next = more ? `<NextContinuationToken>${start + 2}</NextContinuationToken>` : '';
    return new Response(
      `<?xml version="1.0"?><ListBucketResult>${contents}<IsTruncated>${more}</IsTruncated>${next}</ListBucketResult>`,
    );
  }

  const fetchImplementation = (async (input: Request | string) => {
    const request = input instanceof Request ? input : new Request(input);
    requests.push(request);
    const url = new URL(request.url);
    const key = url.pathname.split('/').slice(2).map(decodeURIComponent).join('/');
    if (request.method === 'GET' && url.searchParams.get('list-type') === '2') return listing(url);
    if (request.method === 'GET') {
      return objects.has(key)
        ? new Response(objects.get(key))
        : new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
    }
    if (request.method === 'PUT') {
      objects.set(key, await request.text());
      return new Response(null, { status: 200 });
    }
    if (request.method === 'DELETE') {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  }) as typeof fetch;

  const reads = () =>
    requests.filter((request) => request.method === 'GET' && !request.url.includes('list-type'))
      .length;
  return { objects, requests, reads, fetch: fetchImplementation };
}

describe('the R2 bucket', () => {
  it('is configured from the environment only when everything is there', () => {
    const env = {
      R2_ACCOUNT_ID: 'account',
      R2_ACCESS_KEY_ID: 'id',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'music-assistant',
    };
    expect(r2ConfigFrom(env)).toEqual({
      accountId: 'account',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      bucket: 'music-assistant',
      endpoint: undefined,
    });
    expect(r2ConfigFrom({ ...env, R2_SECRET_ACCESS_KEY: '' })).toBeNull();
  });

  it('signs every request and keeps objects by key', async () => {
    const r2 = fakeR2();
    const store = new R2Store(R2_CONFIG, r2.fetch);
    await store.put('users/a@b.c.json', '{"a":1}', 'application/json');
    expect(await store.get('users/a@b.c.json')).toBe('{"a":1}');
    expect(await store.get('users/missing.json')).toBeNull();
    await store.delete('users/a@b.c.json');
    expect(await store.get('users/a@b.c.json')).toBeNull();

    const [first] = r2.requests;
    expect(first.url).toBe(
      'https://account.r2.cloudflarestorage.com/music-assistant/users/a%40b.c.json',
    );
    expect(first.headers.get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=key-id\/\d{8}\/auto\/s3\/aws4_request/,
    );
    await expect(store.get('../escape')).rejects.toThrow(/valid key/);
  });

  it('lists every page of a prefix', async () => {
    const r2 = fakeR2();
    const store = new R2Store(R2_CONFIG, r2.fetch);
    for (const name of ['a', 'b', 'c', 'd', 'e']) await store.put(`notes/${name}/notes.json`, name);
    await store.put('users/x.json', 'x');
    const listed = await store.list('notes/');
    expect(listed.map((object) => object.key)).toEqual([
      'notes/a/notes.json',
      'notes/b/notes.json',
      'notes/c/notes.json',
      'notes/d/notes.json',
      'notes/e/notes.json',
    ]);
    expect(listed[0].etag).toBe(md5('a'));
    expect(
      parseListing('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'),
    ).toEqual({ objects: [], next: null });
  });

  it('reports what R2 refused', async () => {
    const refusing = (async () =>
      new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })) as typeof fetch;
    await expect(new R2Store(R2_CONFIG, refusing).get('a.json')).rejects.toThrow(
      /403 AccessDenied/,
    );
  });
});

describe('the catalog of songs with private songs in the bucket', () => {
  const root = mkdtempSync(join(tmpdir(), 'catalog-'));
  mkdirSync(join(root, 'public-song'), { recursive: true });
  writeFileSync(join(root, 'public-song', 'song.txt'), SONG);
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  async function setUp() {
    const r2 = fakeR2();
    const store = scopedStore(new R2Store(R2_CONFIG, r2.fetch), 'songs');
    await store.put('private/kj-1/song.txt', SONG);
    await store.put('private/kj-1/arrangements.json', '{"arrangements":[]}');
    await store.put('private/kk-2/song.txt', SONG);
    await store.put('private/kk-2/left-behind.txt', 'ignored');
    return { r2, catalog: storeCatalog(root, store) };
  }

  it('reads private songs from the bucket and public ones from the folder', async () => {
    const { catalog } = await setUp();
    expect(await catalog.privateSongs()).toEqual([
      { id: 'private/kj-1', song: SONG, arrangements: { arrangements: [] } },
      { id: 'private/kk-2', song: SONG, arrangements: null },
    ]);
    expect(await catalog.has('public-song')).toBe(true);
    expect(await catalog.has('private/kj-1')).toBe(true);
    expect(await catalog.has('private/kj')).toBe(false);
    expect(await catalog.has('missing')).toBe(false);
  });

  it('fetches a file again only when it has changed', async () => {
    const { r2, catalog } = await setUp();
    await catalog.privateSongs();
    const before = r2.reads();
    await catalog.privateSongs();
    expect(r2.reads()).toBe(before);
    r2.objects.set('songs/private/kj-1/song.txt', `${SONG}\n`);
    await catalog.privateSongs();
    expect(r2.reads()).toBe(before + 1);
  });
});
