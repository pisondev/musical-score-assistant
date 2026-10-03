import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

/**
 * Serves the built site. The file names under `assets/` carry a hash of
 * their content, so browsers may keep them for good; the page itself is
 * always asked for again, so that a deploy reaches everybody at once.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

const YEAR = 365 * 24 * 60 * 60;
const MONTH = 30 * 24 * 60 * 60;

/** The file a request path stands for inside the root, or null for anything outside it. */
export function resolveStaticPath(root: string, requestPath: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (path.includes('\0')) return null;
  const base = resolve(root);
  const file = resolve(base, `.${sep}${normalize(path === '/' ? '/index.html' : path)}`);
  return file === base || file.startsWith(base + sep) ? file : null;
}

function cacheControl(file: string, root: string): string {
  const relative = file
    .slice(resolve(root).length + 1)
    .split(sep)
    .join('/');
  if (relative.startsWith('assets/')) return `public, max-age=${YEAR}, immutable`;
  if (relative.startsWith('samples/')) return `public, max-age=${MONTH}`;
  return 'no-cache';
}

/** Answers with the file, or with 404. Only GET and HEAD are served. */
export function serveStatic(root: string, request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    response.end();
    return;
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  const file = resolveStaticPath(root, url.pathname);
  let size = -1;
  if (file) {
    try {
      const stats = statSync(file);
      if (stats.isFile()) size = stats.size;
    } catch {
      size = -1;
    }
  }
  if (!file || size < 0) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end('Not found');
    return;
  }

  response.statusCode = 200;
  response.setHeader(
    'Content-Type',
    TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
  );
  response.setHeader('Content-Length', size);
  response.setHeader('Cache-Control', cacheControl(file, root));
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(join(file)).pipe(response);
}
