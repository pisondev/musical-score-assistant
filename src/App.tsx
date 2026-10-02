import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { library } from './library';
import { Home } from './ui/Home';
import { GridIcon, NoteIcon } from './ui/icons';
import { groupByHymnal, NO_BOOK, selectSongs } from './ui/library-view';
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

  // The song menu lists every hymnal that has songs, each in the order of its numbers.
  const byNumber = selectSongs(library, {
    query: '',
    filter: 'all',
    book: null,
    sort: 'number',
    favourites: [],
    opened: {},
  });
  const hymnals = groupByHymnal(byNumber).filter((group) => group.songs.length > 0);

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
                  {hymnals.map((group) => (
                    <optgroup
                      key={group.code}
                      label={group.code === NO_BOOK ? group.name : `${group.code} · ${group.name}`}
                    >
                      {group.songs.map((candidate) => {
                        const { number, title } = candidate.bundle.song.meta;
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
        </div>
      </header>

      {entry ? <SongPage key={entry.id} entry={entry} /> : <Home />}
    </>
  );
}
