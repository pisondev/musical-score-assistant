import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from './audio/engine';
import { BASELINE_ID, type Song } from './core';
import { library } from './library';
import { usePlayer } from './store/player';
import { ArrangementPicker } from './ui/ArrangementPicker';
import { NoteIcon } from './ui/icons';
import { Insights } from './ui/Insights';
import { IssueList } from './ui/IssueList';
import { Sheet } from './ui/Sheet';
import { SongHeader } from './ui/SongHeader';
import { TransportBar } from './ui/TransportBar';

const SONG_PARAMETER = 'song';

function songIdFromLocation(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get(SONG_PARAMETER);
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
}

export function App() {
  const [songId, setSongId] = useState(() => {
    const requested = songIdFromLocation();
    return library.some((entry) => entry.id === requested) ? requested! : (library[0]?.id ?? '');
  });
  const [arrangementId, setArrangementId] = useState(BASELINE_ID);

  const entry = library.find((candidate) => candidate.id === songId);
  const arrangement = useMemo(
    () =>
      entry?.bundle.arrangements.find((candidate) => candidate.id === arrangementId) ??
      entry?.bundle.arrangements[0],
    [entry, arrangementId],
  );

  const loadScore = usePlayer((state) => state.loadScore);
  const loadedSong = useRef<Song | null>(null);
  useEffect(() => {
    if (!entry || !arrangement) return;
    const songChanged = loadedSong.current !== entry.bundle.song;
    loadedSong.current = entry.bundle.song;
    loadScore(entry.bundle.song, arrangement, songChanged);
  }, [entry, arrangement, loadScore]);

  useEffect(() => {
    document.title = entry
      ? `${entry.bundle.song.meta.title} · Musical Score Assistant`
      : 'Musical Score Assistant';
  }, [entry]);

  // Fetch the piano samples as soon as the player touches the page, so the
  // first press of Play starts without a delay.
  useEffect(() => {
    const preload = () => void engine.preload().catch(() => undefined);
    window.addEventListener('pointerdown', preload, { once: true });
    window.addEventListener('keydown', preload, { once: true });
    return () => {
      window.removeEventListener('pointerdown', preload);
      window.removeEventListener('keydown', preload);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const player = usePlayer.getState();
      if (event.code === 'Space') {
        event.preventDefault();
        void player.toggle();
      } else if (event.key === '1') player.setHandMode('both');
      else if (event.key === '2') player.setHandMode('right');
      else if (event.key === '3') player.setHandMode('left');
      else if (event.key === 'Home') player.stop();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectSong = (id: string) => {
    setSongId(id);
    setArrangementId(BASELINE_ID);
    window.history.replaceState(null, '', `#${SONG_PARAMETER}=${encodeURIComponent(id)}`);
    window.scrollTo({ top: 0 });
  };

  const publicSongs = library.filter((candidate) => !candidate.isPrivate);
  const privateSongs = library.filter((candidate) => candidate.isPrivate);

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <span className="brand">
            <span className="brand__mark">
              <NoteIcon width={18} height={18} />
            </span>
            Musical Score Assistant
          </span>
          {library.length > 0 && (
            <label className="song-select">
              <span>Song</span>
              <select value={songId} onChange={(event) => selectSong(event.target.value)}>
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
          )}
        </div>
      </header>

      {entry && arrangement ? (
        <>
          <main className="page">
            <SongHeader song={entry.bundle.song} isPrivate={entry.isPrivate} />
            <section className="arrangements" aria-label="Left-hand arrangements">
              <h2 className="section-title">Left hand</h2>
              <ArrangementPicker
                arrangements={entry.bundle.arrangements}
                selectedId={arrangement.id}
                onSelect={setArrangementId}
              />
            </section>
            <IssueList
              song={entry.bundle.song}
              issues={[...entry.bundle.song.issues, ...entry.bundle.issues, ...arrangement.issues]}
            />
            <div className="workspace">
              <section className="card card--sheet">
                <Sheet
                  song={entry.bundle.song}
                  arrangement={arrangement}
                  arrangements={entry.bundle.arrangements}
                />
              </section>
              <section className="card card--insights">
                <Insights song={entry.bundle.song} arrangement={arrangement} />
              </section>
            </div>
          </main>
          <TransportBar song={entry.bundle.song} />
        </>
      ) : (
        <main className="page page--empty">
          <h1>No songs yet</h1>
          <p>
            Add a folder with a <code>song.txt</code> under <code>songs/</code>. The format is
            described in <code>docs/song-format.md</code>.
          </p>
        </main>
      )}
    </>
  );
}
