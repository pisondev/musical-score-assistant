/// <reference lib="webworker" />
/**
 * The service worker of the installed app. It keeps the app, its samples, and what the owner's
 * account holds, so that the scores open and play without a connection, and it lets a new
 * deploy through as soon as the network answers. `scripts/service-worker-plugin.ts` bundles it
 * into `sw.js` and fills in `BUILD`.
 */
import { SAMPLE_FOLDER, SAMPLE_NOTES, sampleFile } from '../audio/samples';
import {
  ACCOUNT_CACHE,
  KEPT_CACHE,
  SHELL_CACHE_PREFIX,
  isServerFailure,
  scopedPath,
  showsSignedOut,
  strategyFor,
} from './routes';

declare const self: ServiceWorkerGlobalScope;

/** What the build tells the worker; see `scripts/service-worker-plugin.ts`. */
declare const BUILD: {
  /** Changes whenever a file of the build changes. */
  version: string;
  /** The files fetched when the worker is installed, relative to the root of the site. */
  shell: string[];
  /** Every file of the build under `assets/`, to tell the files of earlier builds apart. */
  assets: string[];
};

/** How long the network may take before the kept copy stands in, in milliseconds. */
const NETWORK_TIMEOUT = 4000;

const scope = new URL(self.registration.scope);
const shellCache = `${SHELL_CACHE_PREFIX}${BUILD.version}`;
const at = (path: string) => new URL(path, scope).href;
const samples = SAMPLE_NOTES.map((note) => at(`${SAMPLE_FOLDER}${sampleFile(note)}`));

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(shellCache);
      await shell.addAll(BUILD.shell.map(at));
      // The samples change only with their version, not with each build, so they are kept
      // apart. A sample that cannot be fetched now is fetched when it is first played.
      const kept = await caches.open(KEPT_CACHE);
      await Promise.all(
        samples.map(async (url) => {
          if (!(await kept.match(url))) await kept.add(url).catch(() => undefined);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(SHELL_CACHE_PREFIX) && name !== shellCache) await caches.delete(name);
      }
      // Files of earlier builds, and samples of an earlier version.
      const current = new Set([...BUILD.assets.map(at), ...samples]);
      const kept = await caches.open(KEPT_CACHE);
      for (const request of await kept.keys()) {
        if (!current.has(request.url)) await kept.delete(request);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const strategy = strategyFor(request.method, url, scope, request.mode === 'navigate');
  if (strategy === 'page') event.respondWith(page(event));
  else if (strategy === 'kept') event.respondWith(kept(event));
  else if (strategy === 'shell') event.respondWith(shell(request));
  else if (strategy === 'account') event.respondWith(account(event, scopedPath(url, scope) ?? ''));
});

/** Settles with the promise, or fails once `milliseconds` have passed. */
function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The network is too slow.')), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * The network's answer, handed to `keep` on the way, or the kept copy when the network fails,
 * answers with a server error, or takes too long. Without a kept copy the network's answer is
 * awaited after all. `keep` goes on after a slow answer has been replaced by the copy.
 */
async function networkFirst(
  event: FetchEvent,
  keep: (response: Response) => Promise<void>,
  copy: () => Promise<Response | undefined>,
): Promise<Response> {
  const network = fetch(event.request).then(async (response) => {
    await keep(response.clone());
    return response;
  });
  event.waitUntil(
    network.then(
      () => undefined,
      () => undefined,
    ),
  );
  try {
    const response = await withTimeout(network, NETWORK_TIMEOUT);
    if (!isServerFailure(response.status)) return response;
    return (await copy()) ?? response;
  } catch {
    return (await copy()) ?? network;
  }
}

/** The app: every page of the site is the same page, so one copy serves them all. */
function page(event: FetchEvent): Promise<Response> {
  const key = scope.href;
  return networkFirst(
    event,
    async (response) => {
      if (response.ok) await (await caches.open(shellCache)).put(key, response);
    },
    () => caches.match(key, { cacheName: shellCache }),
  );
}

async function kept(event: FetchEvent): Promise<Response> {
  const copy = await caches.match(event.request);
  if (copy) return copy;
  const response = await fetch(event.request);
  if (response.ok) {
    const stored = response.clone();
    event.waitUntil(caches.open(KEPT_CACHE).then((cache) => cache.put(event.request, stored)));
  }
  return response;
}

async function shell(request: Request): Promise<Response> {
  return (await caches.match(request, { cacheName: shellCache })) ?? fetch(request);
}

function account(event: FetchEvent, path: string): Promise<Response> {
  const key = event.request.url;
  return networkFirst(
    event,
    async (response) => {
      const body: unknown =
        path === 'api/me' && response.ok
          ? await response
              .clone()
              .json()
              .catch(() => null)
          : null;
      if (showsSignedOut(path, response.status, body)) await caches.delete(ACCOUNT_CACHE);
      else if (response.ok) await (await caches.open(ACCOUNT_CACHE)).put(key, response);
    },
    () => caches.match(key, { cacheName: ACCOUNT_CACHE }),
  );
}
