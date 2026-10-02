import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { engine } from './audio/engine';
import { BASELINE_ID, buildPerformance, formatNoteName, type IntroChoice } from './core';
import { library } from './library';
import { usePlayer, type ScoreReset } from './store/player';
import { useSettings } from './store/settings';
import { Guide } from './ui/Guide';
import { NoteIcon } from './ui/icons';
import { IssueList } from './ui/IssueList';
import { Sheet } from './ui/Sheet';
import { SongHeader } from './ui/SongHeader';
import { MAX_TRANSPOSE, Toolbar } from './ui/Toolbar';
import { TransportBar } from './ui/TransportBar';
import { cx } from './ui/classnames';

const SONG_PARAMETER = 'song';
const APP_NAME = 'Musical Score Assistant';

const INTRO_TITLE: Record<Exclude<IntroChoice, 'off'>, string> = {
  'last-phrase': 'Last phrase',
  improvised: 'Improvised',
};

const LEVEL_LABEL = { easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

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
  const [semitones, setSemitones] = useState(0);
  const [printing, setPrinting] = useState(false);

  const introSetting = useSettings((state) => state.intro);
  const showLyrics = useSettings((state) => state.showLyrics);
  const showDynamics = useSettings((state) => state.showDynamics);
  const guideOpen = useSettings((state) => state.guideOpen);

  const entry = library.find((candidate) => candidate.id === songId);
  const bundle = entry?.bundle;
  const arrangement = useMemo(
    () =>
      bundle?.arrangements.find((candidate) => candidate.id === arrangementId) ??
      bundle?.arrangements[0],
    [bundle, arrangementId],
  );

  // A song without a written introduction falls back to its last phrase.
  const intro: IntroChoice =
    introSetting === 'improvised' && !bundle?.intro.improvised ? 'last-phrase' : introSetting;

  const performance = useMemo(
    () => (bundle && arrangement ? buildPerformance(bundle, arrangement, intro, semitones) : null),
    [bundle, arrangement, intro, semitones],
  );

  // Tell the engine what changed, so it keeps the playhead whenever it can.
  const loadScore = usePlayer((state) => state.loadScore);
  const loaded = useRef<{ songId: string; intro: IntroChoice } | null>(null);
  useEffect(() => {
    if (!performance) return;
    let reset: ScoreReset = 'none';
    if (loaded.current?.songId !== songId) reset = 'song';
    else if (loaded.current.intro !== intro) reset = 'position';
    loaded.current = { songId, intro };
    loadScore(performance.song, performance.arrangement, reset);
  }, [performance, songId, intro, loadScore]);

  // The document title becomes the default file name when saving a PDF.
  useEffect(() => {
    if (!performance) {
      document.title = APP_NAME;
      return;
    }
    const { meta } = performance.song;
    document.title = `${meta.title} - ${performance.arrangement.name} (1 = ${formatNoteName(meta.key)})`;
  }, [performance]);

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

  // Lay the score out for paper just before the browser prints, including
  // when the player uses the browser's own print command.
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  const print = useCallback(() => {
    usePlayer.getState().stop();
    window.print();
  }, []);

  const selectSong = (id: string) => {
    setSongId(id);
    setArrangementId(BASELINE_ID);
    setSemitones(0);
    window.history.replaceState(null, '', `#${SONG_PARAMETER}=${encodeURIComponent(id)}`);
    window.scrollTo({ top: 0 });
  };

  const transposeTo = (value: number) =>
    setSemitones(Math.min(MAX_TRANSPOSE, Math.max(-MAX_TRANSPOSE, value)));

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
            {APP_NAME}
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

      {entry && bundle && arrangement && performance ? (
        <>
          <main className="page">
            <SongHeader song={performance.song} isPrivate={entry.isPrivate} />
            <Toolbar
              bundle={bundle}
              arrangement={arrangement}
              onSelectArrangement={setArrangementId}
              intro={intro}
              semitones={semitones}
              onTranspose={transposeTo}
              soundingKey={performance.song.meta.key}
              onPrint={print}
            />
            <IssueList
              song={performance.song}
              issues={[
                ...performance.song.issues,
                ...bundle.issues,
                ...performance.arrangement.issues,
              ]}
            />
            <div className={cx('workspace', guideOpen && 'workspace--guide')}>
              <section className="card card--sheet">
                <p className="print-summary">
                  Left hand: {arrangement.name} ({LEVEL_LABEL[arrangement.level]}
                  {arrangement.style && `, ${arrangement.style}`})
                </p>
                <Sheet
                  bundle={bundle}
                  performance={performance}
                  showLyrics={showLyrics}
                  showDynamics={showDynamics}
                  printing={printing}
                  introHeading={
                    intro !== 'off' && (
                      <h3 className="sheet__heading">
                        Intro <span>{INTRO_TITLE[intro]}</span>
                      </h3>
                    )
                  }
                />
              </section>
              {guideOpen && (
                <section className="card card--guide">
                  <Guide performance={performance} />
                </section>
              )}
            </div>
          </main>
          <TransportBar song={performance.song} />
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
