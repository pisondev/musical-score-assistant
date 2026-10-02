import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { library } from './library';
import { Home } from './ui/Home';
import { GridIcon, NoteIcon } from './ui/icons';
import { songHref, songIdFromLocation } from './ui/navigation';
import { SongPage } from './ui/SongPage';

const APP_NAME = 'Musical Score Assistant';

/** The song the address names, or null for the home page and for songs that do not exist. */
function routeSongId(): string | null {
  const requested = songIdFromLocation();
  return library.some((entry) => entry.id === requested) ? requested : null;
}

/** The shell of the app: the top bar, and below it the home page or one song. */
export function App() {
  const [songId, setSongId] = useState(routeSongId);
  const entry = library.find((candidate) => candidate.id === songId);

  // Links and the browser's Back button change the address; follow it.
  useEffect(() => {
    const sync = () => {
      setSongId(routeSongId());
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

  const goHome = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    // Modified clicks (new tab, new window) are left to the browser.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    // Drop the hash entirely instead of leaving a bare "#" in the address.
    window.history.pushState(null, '', window.location.pathname + window.location.search);
    setSongId(null);
    window.scrollTo({ top: 0 });
  }, []);

  const publicSongs = library.filter((candidate) => !candidate.isPrivate);
  const privateSongs = library.filter((candidate) => candidate.isPrivate);

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <a className="brand" href="./" onClick={goHome} title="All songs">
            <span className="brand__mark">
              <NoteIcon width={18} height={18} />
            </span>
            {APP_NAME}
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
                  {publicSongs.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.bundle.song.meta.title}
                    </option>
                  ))}
                  {privateSongs.length > 0 && (
                    <optgroup label="Private (this computer only)">
                      {privateSongs.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.bundle.song.meta.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
            </nav>
          )}
        </div>
      </header>

      {entry ? <SongPage key={entry.id} entry={entry} /> : <Home />}
    </>
  );
}
