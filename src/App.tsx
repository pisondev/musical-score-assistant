import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { engine, type HandMode } from './audio/engine';
import { encodeMp3 } from './audio/mp3';
import {
  BASELINE_ID,
  buildNoteEvents,
  buildPerformance,
  formatNoteName,
  INTRO_LAST_PHRASE,
  INTRO_OFF,
  exportFileName,
  noteNameToText,
  toMidiFile,
  type IntroChoice,
  type Performance,
  type Track,
} from './core';
import { library } from './library';
import { usePlayer, type ScoreReset } from './store/player';
import { useSettings } from './store/settings';
import { Guide } from './ui/Guide';
import { NoteIcon } from './ui/icons';
import { IssueList } from './ui/IssueList';
import { Sheet } from './ui/Sheet';
import { SongHeader } from './ui/SongHeader';
import { StaffSheet } from './ui/StaffSheet';
import { introName } from './ui/intro-name';
import { RIGHT_HAND_NAME } from './ui/right-hand-name';
import { MAX_TRANSPOSE, Toolbar } from './ui/Toolbar';
import { TransportBar } from './ui/TransportBar';
import { cx } from './ui/classnames';

const SONG_PARAMETER = 'song';
const APP_NAME = 'Musical Score Assistant';

const LEVEL_LABEL = { easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

function songIdFromLocation(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get(SONG_PARAMETER);
}

/** What a download contains: the hands that are switched on, and the voice guide when it plays. */
function tracksOf(performance: Performance, mode: HandMode, voiceGuide: boolean): Track[] {
  const hands: Track[] = mode === 'both' ? ['right', 'left'] : [mode];
  const hasVoice = performance.song.measures.some((measure) => measure.voice !== undefined);
  return hasVoice && voiceGuide ? [...hands, 'voice'] : hands;
}

/** Names the two hands of a performance, e.g. "Alberti bass, accompaniment". */
function handsLabel(performance: Performance): string {
  const { arrangement, rightHand } = performance;
  return rightHand === 'melody'
    ? arrangement.name
    : `${arrangement.name}, ${RIGHT_HAND_NAME[rightHand].toLowerCase()}`;
}

function fileNameFor(performance: Performance, extension: string): string {
  const { meta } = performance.song;
  return exportFileName(
    meta.title,
    handsLabel(performance).replace(' + ', ' with '),
    noteNameToText(meta.key),
    extension,
  );
}

/** Hands a generated file to the browser as a download. */
function saveFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
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
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const introSetting = useSettings((state) => state.intro);
  const rightHand = useSettings((state) => state.rightHand);
  const notation = useSettings((state) => state.notation);
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

  // An introduction written for another song falls back to the last phrase of this one.
  const known =
    introSetting === INTRO_OFF ||
    introSetting === INTRO_LAST_PHRASE ||
    bundle?.intro.written.some((written) => written.id === introSetting);
  const intro: IntroChoice = known ? introSetting : INTRO_LAST_PHRASE;

  const performance = useMemo(
    () =>
      bundle && arrangement
        ? buildPerformance(bundle, arrangement, intro, semitones, rightHand)
        : null,
    [bundle, arrangement, intro, semitones, rightHand],
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
    document.title = `${meta.title} - ${handsLabel(performance)} (1 = ${formatNoteName(meta.key)})`;
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
      else if (event.key === 'v' || event.key === 'V') player.toggleVoiceGuide();
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

  // A download holds what is on the sheet: the introduction, both hands as
  // chosen, the key, the tempo, and only what is switched on in the transport bar.
  const downloadMidi = useCallback(() => {
    if (!performance) return;
    const { tempo, handMode, voiceGuide } = usePlayer.getState();
    const { song, arrangement: played } = performance;
    const bytes = toMidiFile(song, buildNoteEvents(song, played), {
      tempo,
      tracks: tracksOf(performance, handMode, voiceGuide),
    });
    saveFile(
      new Blob([bytes.slice().buffer], { type: 'audio/midi' }),
      fileNameFor(performance, 'mid'),
    );
  }, [performance]);

  const downloadMp3 = useCallback(async () => {
    if (!performance || exportStatus !== null) return;
    const player = usePlayer.getState();
    // Rendering borrows the audio engine, so live playback has to stop first.
    player.stop();
    try {
      setExportStatus('Recording…');
      const audio = await engine.render(tracksOf(performance, player.handMode, player.voiceGuide));
      const file = await encodeMp3(audio, (fraction) =>
        setExportStatus(`Encoding ${Math.round(fraction * 100)}%`),
      );
      saveFile(file, fileNameFor(performance, 'mp3'));
    } catch (error) {
      console.error(error);
      usePlayer.setState({ error: 'The MP3 could not be created. Please try again.' });
    } finally {
      setExportStatus(null);
    }
  }, [performance, exportStatus]);

  const selectSong = (id: string) => {
    setSongId(id);
    setArrangementId(BASELINE_ID);
    setSemitones(0);
    window.history.replaceState(null, '', `#${SONG_PARAMETER}=${encodeURIComponent(id)}`);
    window.scrollTo({ top: 0 });
  };

  const transposeTo = (value: number) =>
    setSemitones(Math.min(MAX_TRANSPOSE, Math.max(-MAX_TRANSPOSE, value)));

  const introHeading = bundle && intro !== INTRO_OFF && (
    <h3 className="sheet__heading">
      Intro <span>{introName(bundle, intro)}</span>
    </h3>
  );

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
              rightHand={performance.rightHand}
              intro={intro}
              semitones={semitones}
              onTranspose={transposeTo}
              soundingKey={performance.song.meta.key}
              onPrint={print}
              onDownloadMidi={downloadMidi}
              onDownloadMp3={() => void downloadMp3()}
              exportStatus={exportStatus}
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
                  {arrangement.style && `, ${arrangement.style}`}) · Right hand:{' '}
                  {RIGHT_HAND_NAME[performance.rightHand]}
                </p>
                {notation === 'staff' ? (
                  <StaffSheet
                    performance={performance}
                    showLyrics={showLyrics}
                    showDynamics={showDynamics}
                    printing={printing}
                    introHeading={introHeading}
                  />
                ) : (
                  <Sheet
                    bundle={bundle}
                    performance={performance}
                    showLyrics={showLyrics}
                    showDynamics={showDynamics}
                    printing={printing}
                    introHeading={introHeading}
                  />
                )}
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
