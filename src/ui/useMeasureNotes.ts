import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '../account';
import { readNotes, sortNotes, type MeasureNote } from '../core';

/** Where the notes of a song are kept: in its folder, or in this browser only. */
export type NotesHome = 'file' | 'browser';

const ENDPOINT = `${import.meta.env.BASE_URL}api/notes`;
const storageKey = (songId: string) => `musical-score-assistant:notes:${songId}`;

function readBrowser(songId: string): MeasureNote[] {
  try {
    return readNotes(JSON.parse(localStorage.getItem(storageKey(songId)) ?? '[]'));
  } catch {
    return [];
  }
}

function writeBrowser(songId: string, notes: MeasureNote[]): void {
  try {
    if (notes.length === 0) localStorage.removeItem(storageKey(songId));
    else localStorage.setItem(storageKey(songId), JSON.stringify({ notes }));
  } catch {
    // A full or disabled storage only means the notes do not outlive the page.
  }
}

/** Asks the server for the notes; null when the app is not running from one that keeps them. */
async function request(songId: string, notes?: MeasureNote[]): Promise<MeasureNote[] | null> {
  try {
    const response = await fetch(`${ENDPOINT}?song=${encodeURIComponent(songId)}`, {
      method: notes ? 'PUT' : 'GET',
      headers: notes ? { 'Content-Type': 'application/json' } : undefined,
      body: notes ? JSON.stringify({ notes }) : undefined,
    });
    const type = response.headers.get('Content-Type') ?? '';
    if (!response.ok || !type.includes('application/json')) return null;
    return readNotes(await response.json());
  } catch {
    return null;
  }
}

/**
 * The player's notes on the measures of one song. For the owner they are kept
 * by the server: in the song folder on a development machine, with the account
 * on the public site. A guest, or a build without a server, keeps them in the
 * browser; they move to the server the next time the owner is there.
 */
export function useMeasureNotes(songId: string) {
  const [notes, setNotes] = useState<MeasureNote[]>([]);
  const [home, setHome] = useState<NotesHome>('browser');
  // The latest list, for saves that follow each other quickly.
  const current = useRef<MeasureNote[]>([]);
  // Only the owner may ask the server; until it is known who that is, nothing is loaded.
  const known = useAccount((state) => state.status === 'ready');
  const owner = useAccount((state) => state.account !== null);

  useEffect(() => {
    if (!known) return;
    let cancelled = false;
    void (async () => {
      const local = readBrowser(songId);
      const stored = owner ? await request(songId) : null;
      if (cancelled) return;
      let list = stored ?? local;
      if (stored && local.length > 0) {
        // Notes written while the server was away join the file now.
        const ids = new Set(stored.map((note) => note.id));
        list = [...stored, ...local.filter((note) => !ids.has(note.id))];
        const merged = await request(songId, list);
        if (cancelled) return;
        if (merged) {
          list = merged;
          writeBrowser(songId, []);
        }
      }
      current.current = sortNotes(list);
      setNotes(current.current);
      setHome(stored ? 'file' : 'browser');
    })();
    return () => {
      cancelled = true;
    };
  }, [songId, known, owner]);

  const replace = useCallback(
    async (next: MeasureNote[]) => {
      current.current = sortNotes(next);
      setNotes(current.current);
      const saved = owner ? await request(songId, current.current) : null;
      if (saved) {
        setHome('file');
      } else {
        writeBrowser(songId, current.current);
        setHome('browser');
      }
    },
    [songId, owner],
  );

  /** Adds a note, or replaces the one with the same id. */
  const save = useCallback(
    (note: MeasureNote) =>
      replace([...current.current.filter((other) => other.id !== note.id), note]),
    [replace],
  );

  const remove = useCallback(
    (id: string) => replace(current.current.filter((note) => note.id !== id)),
    [replace],
  );

  return { notes, home, save, remove };
}
