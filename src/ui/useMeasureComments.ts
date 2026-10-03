import { useCallback, useEffect, useState } from 'react';
import { API_ROOT, useAccount } from '../account';
import { readNotes, sortNotes, type MeasureNote, type NoteContext, type NoteTarget } from '../core';

/**
 * A comment on a measure, as its writer sees it: what they wrote, where, and what became of it.
 * It has the shape of a note, so the sheet marks it and the guide lists it like one.
 */
export interface MeasureComment extends MeasureNote {
  /** When the author fetched it to read; null while it waits. */
  readAt: string | null;
  reply: string | null;
  repliedAt: string | null;
  /** Whether the writer has seen the reply. */
  replySeen: boolean;
}

const ENDPOINT = `${API_ROOT}/comments`;

const text = (value: unknown) => (typeof value === 'string' ? value : null);

/** Reads comments from an answer of the server, keeping what is well formed. */
export function readComments(list: unknown): MeasureComment[] {
  if (!Array.isArray(list)) return [];
  const raw = new Map(
    list
      .filter(
        (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
      )
      .map((entry) => [String(entry.id), entry]),
  );
  return readNotes(list).map((note) => {
    const entry = raw.get(note.id) ?? {};
    return {
      ...note,
      readAt: text(entry.readAt),
      reply: text(entry.reply),
      repliedAt: text(entry.repliedAt),
      replySeen: entry.replySeen === true,
    };
  });
}

/** The message of a refusal of the server, or a general one. */
async function problem(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Not JSON; fall through.
  }
  return 'The comment could not be sent. Check the connection and try again.';
}

/**
 * The comments of a member on the measures of one song. They go to the server, which keeps
 * them for the author; nothing on the sheet changes. Only a member sends comments: the owner
 * keeps notes instead, and a guest is asked to sign in.
 */
export function useMeasureComments(songId: string) {
  const enabled = useAccount((state) => state.account?.role === 'member');
  const [comments, setComments] = useState<MeasureComment[]>([]);

  useEffect(() => {
    if (!enabled) {
      setComments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${ENDPOINT}?song=${encodeURIComponent(songId)}`);
        if (!response.ok) return;
        const body = (await response.json()) as { comments?: unknown };
        if (!cancelled) setComments(sortNotes(readComments(body.comments)));
      } catch {
        // Without a connection the comments of this visit are simply not shown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songId, enabled]);

  /** Sends a comment; resolves to null when it went, or to what went wrong. */
  const send = useCallback(
    async (target: NoteTarget, body: string, context: NoteContext): Promise<string | null> => {
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ song: songId, ...target, text: body, context }),
        });
        if (!response.ok) return problem(response);
        const sent = readComments([((await response.json()) as { comment?: unknown }).comment]);
        setComments((list) => sortNotes([...list, ...sent]));
        return null;
      } catch {
        return 'The comment could not be sent. Check the connection and try again.';
      }
    },
    [songId],
  );

  /** Takes a comment back. */
  const remove = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (response.ok) setComments((list) => list.filter((comment) => comment.id !== id));
    } catch {
      // The comment stays; the next visit shows whether it went.
    }
  }, []);

  /** Notes that the replies to these comments have been seen. */
  const markSeen = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setComments((list) =>
      list.map((comment) => (ids.includes(comment.id) ? { ...comment, replySeen: true } : comment)),
    );
    void fetch(`${ENDPOINT}/seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.map(Number) }),
    }).catch(() => undefined);
  }, []);

  return { enabled, comments, send, remove, markSeen };
}
