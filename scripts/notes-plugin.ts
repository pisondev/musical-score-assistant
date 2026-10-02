import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { readNotes, sortNotes, type MeasureNote } from '../src/core/notes-file.ts';

/**
 * Saves the player's notes on measures into the song folders.
 *
 * The app is a static page and cannot write files. While it runs from the
 * development server (`npm run dev`) or the preview server, this plugin gives
 * it a small endpoint that reads and writes `notes.json` next to `song.txt`:
 *
 *   GET /api/notes?song=<id>     the notes of one song
 *   PUT /api/notes?song=<id>     replaces them with the list in the body
 *
 * Without the endpoint (a build served by a plain web server) the app keeps
 * the notes in the browser instead.
 */

export const NOTES_FILE = 'notes.json';
const SONG_FILE = 'song.txt';
/** Notes are short; anything larger than this is not a list of notes. */
const MAX_BODY = 1_000_000;

/** A song id is the path of its folder below the songs folder, with plain names only. */
const SONG_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** The notes file of a song, or null when the id does not name a song folder. */
export function notesPath(songsRoot: string, songId: string): string | null {
  if (!SONG_ID.test(songId)) return null;
  const folder = join(resolve(songsRoot), ...songId.split('/'));
  return existsSync(join(folder, SONG_FILE)) ? join(folder, NOTES_FILE) : null;
}

/** The notes of a song; an empty list when none are written, null for an unknown song. */
export function loadNotes(songsRoot: string, songId: string): MeasureNote[] | null {
  const file = notesPath(songsRoot, songId);
  if (!file) return null;
  if (!existsSync(file)) return [];
  try {
    return readNotes(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    // A file that was damaged by hand is treated as empty rather than breaking the app.
    return [];
  }
}

/**
 * Writes the notes of a song, in the order of the piece. Without notes the
 * file is removed. Returns false for an unknown song.
 */
export function storeNotes(songsRoot: string, songId: string, notes: unknown): boolean {
  const file = notesPath(songsRoot, songId);
  if (!file) return false;
  const list = sortNotes(readNotes(notes));
  if (list.length === 0) {
    rmSync(file, { force: true });
    return true;
  }
  writeFileSync(file, `${JSON.stringify({ notes: list }, null, 2)}\n`);
  return true;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new Error('The request is too large.'));
    });
    request.on('end', () => resolveBody(body));
    request.on('error', reject);
  });
}

function handler(songsRoot: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const songId = new URL(request.url ?? '', 'http://localhost').searchParams.get('song') ?? '';
    if (!notesPath(songsRoot, songId)) {
      send(response, 404, { error: 'There is no such song.' });
      return;
    }
    if (request.method === 'GET') {
      send(response, 200, { notes: loadNotes(songsRoot, songId) ?? [] });
      return;
    }
    if (request.method === 'PUT') {
      try {
        const body: unknown = JSON.parse(await readBody(request));
        storeNotes(songsRoot, songId, body);
        send(response, 200, { notes: loadNotes(songsRoot, songId) ?? [] });
      } catch (error) {
        send(response, 400, { error: (error as Error).message });
      }
      return;
    }
    send(response, 405, { error: 'Use GET or PUT.' });
  };
}

/** The Vite plugin that serves the notes endpoint in development and in preview. */
export function notesPlugin(songsRoot = 'songs'): Plugin {
  return {
    name: 'measure-notes',
    configureServer(server) {
      server.middlewares.use('/api/notes', handler(songsRoot));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/notes', handler(songsRoot));
    },
  };
}
