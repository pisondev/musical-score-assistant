import { useEffect, useState } from 'react';
import { API_ROOT, useAccount } from '../account';
import type { SongEntry } from '../library';
import { songHref } from './navigation';

/**
 * Tells a member on the home page that the author has answered some of their comments, with a
 * link to each song. An answer stops counting as new once it has been seen on its measure.
 */
export function RepliesCard({ library }: { library: readonly SongEntry[] }) {
  const member = useAccount((state) => state.account?.role === 'member');
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_ROOT}/comments`);
        if (!response.ok) return;
        const { comments } = (await response.json()) as { comments?: unknown };
        const next = new Map<string, number>();
        for (const comment of Array.isArray(comments) ? comments : []) {
          const { songId, reply, replySeen } = (comment ?? {}) as Record<string, unknown>;
          if (typeof songId === 'string' && typeof reply === 'string' && replySeen !== true) {
            next.set(songId, (next.get(songId) ?? 0) + 1);
          }
        }
        if (!cancelled) setCounts(next);
      } catch {
        // Without a connection there is nothing new to tell.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member]);

  const songs = library.filter((entry) => counts.has(entry.id));
  if (!member || songs.length === 0) return null;

  return (
    <section className="card replies" aria-label="New answers to your comments">
      <h2>New answers to your comments</h2>
      <ul>
        {songs.map((entry) => {
          const count = counts.get(entry.id) ?? 0;
          return (
            <li key={entry.id}>
              <a href={songHref(entry.id)}>{entry.meta.title}</a>
              <span>
                {count} {count === 1 ? 'answer' : 'answers'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
