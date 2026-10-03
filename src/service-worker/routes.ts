/**
 * How the service worker answers each request. Kept apart from the worker, free of its types,
 * so that the tests can run it in Node.
 */

/**
 * - `pass`: not handled; the browser goes to the network as if there were no worker.
 * - `page`: the app itself. The network first, so that a deploy reaches everybody at once; the
 *   kept copy when there is no connection or it is too slow.
 * - `kept`: a file whose name carries its hash, or a sample with its version. Such a file
 *   never changes, so the kept copy comes first, and a file seen for the first time is kept.
 * - `shell`: another file of the site (the icon, the manifest): the copy kept with the build,
 *   or the network for a file that is not part of it.
 * - `account`: what the account of the owner holds (who is signed in, the private songs, the
 *   notes). The network first, the kept copy without a connection.
 */
export type Strategy = 'pass' | 'page' | 'kept' | 'shell' | 'account';

/** The answers of the API that are kept for use without a connection, by path. */
export const ACCOUNT_PATHS = ['api/me', 'api/private-songs', 'api/notes'];

/** The caches of the app; the build's own cache carries its version after this prefix. */
export const CACHE_PREFIX = 'msa-';
export const SHELL_CACHE_PREFIX = `${CACHE_PREFIX}shell-`;
export const KEPT_CACHE = `${CACHE_PREFIX}kept`;
export const ACCOUNT_CACHE = `${CACHE_PREFIX}account`;

/** The path of a URL below the scope of the worker, or null for anything outside it. */
export function scopedPath(url: URL, scope: URL): string | null {
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  return url.pathname.slice(scope.pathname.length);
}

export function strategyFor(method: string, url: URL, scope: URL, navigation: boolean): Strategy {
  const path = scopedPath(url, scope);
  if (method !== 'GET' || path === null) return 'pass';
  // Signing in and out are journeys to Google and back: always the network, never a copy.
  if (path === 'api' || path.startsWith('api/')) {
    return ACCOUNT_PATHS.includes(path) ? 'account' : 'pass';
  }
  if (navigation) return 'page';
  if (path.startsWith('assets/') || path.startsWith('samples/')) return 'kept';
  return 'shell';
}

/**
 * Whether an answer of the API shows that nobody is signed in any more, so that what is kept of
 * the account has to go: a refusal, or `/api/me` without an account.
 */
export function showsSignedOut(path: string, status: number, body: unknown): boolean {
  if (status === 401) return true;
  if (path !== 'api/me' || status !== 200) return false;
  return typeof body !== 'object' || body === null || !(body as { account?: unknown }).account;
}

/** Whether an answer of the network is a failure that a kept copy may stand in for. */
export function isServerFailure(status: number): boolean {
  return status >= 500;
}
