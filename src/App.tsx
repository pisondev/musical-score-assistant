import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { signInUrl, useAccount } from './account';
import { startAccountSync } from './account-sync';
import { useLibrary, useSongBundle, type SongEntry } from './library';
import { AccountButton } from './ui/AccountButton';
import { Home } from './ui/Home';
import { GoogleIcon, GridIcon, LockIcon, NoteIcon } from './ui/icons';
import { groupByCategory, selectSongs } from './ui/library-view';
import { songHref, songIdFromLocation } from './ui/navigation';
import { SongPage } from './ui/SongPage';

const APP_NAME = 'Musical Score Assistant';

/**
 * Finds out who is in front of the app once, at the start. The owner gets the
 * licensed songs, and for anybody signed in what the app remembers travels
 * with the account from then on.
 */
function useAccountSetup(): void {
  useEffect(() => {
    let stopSync: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      await useAccount.getState().check();
      const account = useAccount.getState().account;
      if (cancelled || !account) return;
      if (account.role === 'owner') void useLibrary.getState().loadPrivateSongs();
      stopSync = startAccountSync();
    })();
    return () => {
      cancelled = true;
      stopSync?.();
    };
  }, []);
}

/** What the page shows for an address whose song is not (yet) in the library. */
function MissingSong({ songId, onHome }: { songId: string; onHome: () => void }) {
  const status = useAccount((state) => state.status);
  const account = useAccount((state) => state.account);
  const signIn = useAccount((state) => state.signIn);
  const privateSongs = useLibrary((state) => state.privateSongs);
  const waiting =
    status === 'checking' ||
    (account?.role === 'owner' && privateSongs !== 'loaded' && privateSongs !== 'unavailable');

  if (waiting) return <main className="page page--empty">Loading the song…</main>;
  if (songId.startsWith('private/') && !account && signIn === 'google') {
    return (
      <main className="page page--empty notice">
        <LockIcon width={28} height={28} />
        <h1>This song is private</h1>
        <p>It is licensed and shown to the owner only. The owner can sign in to open it.</p>
        <a className="button button--solid" href={signInUrl()}>
          <GoogleIcon width={17} height={17} />
          Sign in with Google
        </a>
      </main>
    );
  }
  return (
    <main className="page page--empty notice">
      <h1>This song is not in the library</h1>
      <p>It may have been renamed or removed.</p>
      <a
        className="button"
        href="./"
        onClick={(event) => {
          event.preventDefault();
          onHome();
        }}
      >
        <GridIcon width={16} height={16} />
        All songs
      </a>
    </main>
  );
}

/** One song: loaded from its own file or from the server, then shown. */
function SongView(props: {
  entry: SongEntry;
  tools: HTMLElement | null;
  progress: HTMLElement | null;
}) {
  const load = useSongBundle(props.entry);
  if (load.status === 'loading') {
    return <main className="page page--empty">Loading the song…</main>;
  }
  if (load.status === 'failed') {
    return (
      <main className="page page--empty notice">
        <h1>The song could not be loaded</h1>
        <p>Check the connection and try again. Songs opened before also open without one.</p>
        <button type="button" className="button" onClick={load.retry}>
          Try again
        </button>
      </main>
    );
  }
  return <SongPage {...props} bundle={load.bundle} />;
}

/** The shell of the app: the top bar, and below it the home page or one song. */
export function App() {
  useAccountSetup();
  const library = useLibrary((state) => state.entries);
  const [songId, setSongId] = useState(songIdFromLocation);
  const entry = songId ? library.find((candidate) => candidate.id === songId) : undefined;
  // The places in the top bar where a song page puts its controls and its progress bar.
  const [tools, setTools] = useState<HTMLElement | null>(null);
  const [progress, setProgress] = useState<HTMLElement | null>(null);

  // Links and the browser's Back button change the address; follow it.
  useEffect(() => {
    const sync = () => {
      setSongId(songIdFromLocation());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    if (!entry) document.title = APP_NAME;
  }, [entry]);

  // The bar grows to two rows when the controls of a song do not fit beside its name.
  // The style sheet needs its height to keep the guide below it.
  const [bar, setBar] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!bar) return;
    const update = () =>
      document.documentElement.style.setProperty('--topbar-height', `${bar.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    update();
    return () => observer.disconnect();
  }, [bar]);

  const showHome = useCallback(() => {
    // Drop the hash entirely instead of leaving a bare "#" in the address.
    window.history.pushState(null, '', window.location.pathname + window.location.search);
    setSongId(null);
    window.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      // Modified clicks (new tab, new window) are left to the browser.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      showHome();
    },
    [showHome],
  );

  // The song menu lists every subcategory that has songs, each in the order of its numbers.
  const byNumber = selectSongs(library, {
    query: '',
    filter: 'all',
    category: null,
    subcategory: null,
    sort: 'number',
    favourites: [],
    opened: {},
  });
  const menu = groupByCategory(byNumber).flatMap((group) =>
    group.subcategories.map((sub) => ({
      key: `${group.id}/${sub.id}`,
      label: sub.name === sub.id ? `${group.name} · ${sub.name}` : `${sub.id} · ${sub.name}`,
      songs: sub.songs,
    })),
  );

  return (
    <>
      <header ref={setBar} className="topbar">
        <div className="topbar__inner">
          <div className="topbar__main">
            <a className="brand" href="./" onClick={goHome} title="All songs">
              <span className="brand__mark">
                <NoteIcon width={18} height={18} />
              </span>
              <span className="brand__name">{APP_NAME}</span>
            </a>
            {entry && (
              <nav className="topbar__nav" aria-label="Songs">
                <a className="button button--quiet" href="./" onClick={goHome}>
                  <GridIcon width={16} height={16} />
                  <span>All songs</span>
                </a>
                <label className="song-select">
                  <span>Song</span>
                  <select
                    value={entry.id}
                    onChange={(event) => {
                      window.location.hash = songHref(event.target.value);
                    }}
                  >
                    {menu.map((group) => (
                      <optgroup key={group.key} label={group.label}>
                        {group.songs.map((candidate) => {
                          const { number, title } = candidate.meta;
                          return (
                            <option key={candidate.id} value={candidate.id}>
                              {number ? `${number} · ${title}` : title}
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </nav>
            )}
            <div className="topbar__account">
              <AccountButton />
            </div>
          </div>
          {entry && <div ref={setTools} className="topbar__tools" />}
        </div>
        {entry && <div ref={setProgress} className="topbar__progress" />}
      </header>

      {entry ? (
        <SongView key={entry.id} entry={entry} tools={tools} progress={progress} />
      ) : songId ? (
        <MissingSong songId={songId} onHome={showHome} />
      ) : (
        <Home />
      )}
    </>
  );
}
