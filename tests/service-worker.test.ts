import { describe, expect, it } from 'vitest';
import { SHELL_SIZE_LIMIT, shellFiles } from '../scripts/service-worker-plugin';
import { SAMPLE_FOLDER, sampleFile } from '../src/audio/samples';
import {
  isServerFailure,
  scopedPath,
  showsSignedOut,
  strategyFor,
} from '../src/service-worker/routes';

const scope = new URL('https://music.example.test/');
const at = (path: string) => new URL(path, scope);

describe('the service worker', () => {
  it('opens the app from the network first, whatever the address', () => {
    expect(strategyFor('GET', at('/'), scope, true)).toBe('page');
    expect(strategyFor('GET', at('/index.html?x=1'), scope, true)).toBe('page');
    // Another page of the site is not the app, and must not replace its copy.
    expect(strategyFor('GET', at('/privacy.html'), scope, true)).toBe('shell');
  });

  it('keeps files with a hash and samples with a version', () => {
    expect(strategyFor('GET', at('/assets/index-abc123.js'), scope, false)).toBe('kept');
    const sample = at(`/${SAMPLE_FOLDER}${sampleFile('C#4')}`);
    expect(sample.pathname).toBe('/samples/piano/Cs4.mp3');
    expect(strategyFor('GET', sample, scope, false)).toBe('kept');
    expect(strategyFor('GET', at('/favicon.svg'), scope, false)).toBe('shell');
  });

  it('keeps what the account holds, and lets signing in and writing pass', () => {
    for (const path of ['/api/me', '/api/private-songs', '/api/notes?song=private%2Fa']) {
      expect(strategyFor('GET', at(path), scope, false)).toBe('account');
    }
    expect(strategyFor('GET', at('/api/auth/google/start?return=%2F'), scope, true)).toBe('pass');
    expect(strategyFor('GET', at('/api/auth/google/callback?code=x'), scope, true)).toBe('pass');
    expect(strategyFor('GET', at('/api/state'), scope, false)).toBe('pass');
    expect(strategyFor('PUT', at('/api/notes?song=a'), scope, false)).toBe('pass');
    expect(strategyFor('POST', at('/api/auth/logout'), scope, false)).toBe('pass');
  });

  it('leaves other sites and other folders alone', () => {
    expect(strategyFor('GET', new URL('https://accounts.google.com/x'), scope, true)).toBe('pass');
    const nested = new URL('https://example.test/app/');
    expect(scopedPath(new URL('https://example.test/app/assets/a.js'), nested)).toBe('assets/a.js');
    expect(scopedPath(new URL('https://example.test/other/a.js'), nested)).toBeNull();
    expect(strategyFor('GET', new URL('https://example.test/other/'), nested, true)).toBe('pass');
  });

  it('forgets the account when nobody is signed in any more', () => {
    expect(showsSignedOut('api/private-songs', 401, null)).toBe(true);
    expect(showsSignedOut('api/me', 200, { account: null, signIn: 'google' })).toBe(true);
    expect(showsSignedOut('api/me', 200, { account: { email: 'a@b.c' } })).toBe(false);
    expect(showsSignedOut('api/notes', 200, null)).toBe(false);
    expect(showsSignedOut('api/me', 503, null)).toBe(false);
  });

  it('lets a kept copy stand in for a server that fails', () => {
    expect(isServerFailure(502)).toBe(true);
    expect(isServerFailure(404)).toBe(false);
    expect(isServerFailure(200)).toBe(false);
  });

  it('is installed with the page and the small files of the build', () => {
    const { shell, assets } = shellFiles(
      [
        { fileName: 'index.html', size: 700 },
        { fileName: 'assets/index-a1.js', size: 400_000 },
        { fileName: 'assets/index-b2.css', size: 55_000 },
        { fileName: 'assets/verovio-module-c3.js', size: SHELL_SIZE_LIMIT * 8 },
        { fileName: 'assets/song-d4.js', size: 3_000, song: true },
      ],
      ['favicon.svg', 'manifest.webmanifest'],
    );
    expect(shell).toEqual([
      './',
      'assets/index-a1.js',
      'assets/index-b2.css',
      'favicon.svg',
      'manifest.webmanifest',
    ]);
    expect(assets).toEqual([
      'assets/index-a1.js',
      'assets/index-b2.css',
      'assets/verovio-module-c3.js',
      'assets/song-d4.js',
    ]);
  });
});
