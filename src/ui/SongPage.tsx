import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { engine, type HandMode } from '../audio/engine';
import { encodeMp3 } from '../audio/mp3';
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
} from '../core';
import type { SongEntry } from '../library';
import { useHistory } from '../store/history';
import { usePlayer, type ScoreReset } from '../store/player';
import { useSettings } from '../store/settings';
import { cx } from './classnames';
import { Guide } from './Guide';
import { introName } from './intro-name';
import { IssueList } from './IssueList';
import { RIGHT_HAND_NAME } from './right-hand-name';
import { Sheet } from './Sheet';
import { SongHeader } from './SongHeader';
import { StaffSheet } from './StaffSheet';
import { MAX_TRANSPOSE, Toolbar } from './Toolbar';
import { TransportBar } from './TransportBar';

const LEVEL_LABEL = { easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

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

interface SongPageProps {
  entry: SongEntry;
}

/**
 * One song: its score, the controls that decide what is on it, and playback.
 * The page is mounted afresh for every song, so its choices start from what
 * was remembered for that song.
 */
export function SongPage({ entry }: SongPageProps) {
  const { bundle } = entry;
  const songId = entry.id;
  const [arrangementId, setArrangementId] = useState(
    () => useHistory.getState().opened[songId]?.arrangementId ?? BASELINE_ID,
  );
  const [semitones, setSemitones] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const introSetting = useSettings((state) => state.intro);
  const rightHand = useSettings((state) => state.rightHand);
  const notation = useSettings((state) => state.notation);
  const showLyrics = useSettings((state) => state.showLyrics);
  const showDynamics = useSettings((state) => state.showDynamics);
  const guideOpen = useSettings((state) => state.guideOpen);

  const arrangement = useMemo(
    () =>
      bundle.arrangements.find((candidate) => candidate.id === arrangementId) ??
      bundle.arrangements[0],
    [bundle, arrangementId],
  );

  // An introduction written for another song falls back to the last phrase of this one.
  const known =
    introSetting === INTRO_OFF ||
    introSetting === INTRO_LAST_PHRASE ||
    bundle.intro.written.some((written) => written.id === introSetting);
  const intro: IntroChoice = known ? introSetting : INTRO_LAST_PHRASE;

  const performance = useMemo(
    () => buildPerformance(bundle, arrangement, intro, semitones, rightHand),
    [bundle, arrangement, intro, semitones, rightHand],
  );

  // Tell the engine what changed, so it keeps the playhead whenever it can.
  const loadScore = usePlayer((state) => state.loadScore);
  const loadedIntro = useRef<IntroChoice | null>(null);
  useEffect(() => {
    let reset: ScoreReset = 'none';
    if (loadedIntro.current === null) reset = 'song';
    else if (loadedIntro.current !== intro) reset = 'position';
    loadedIntro.current = intro;
    loadScore(performance.song, performance.arrangement, reset);
  }, [performance, intro, loadScore]);

  // Leaving the page ends the music.
  useEffect(() => () => usePlayer.getState().stop(), []);

  // Remember the song and its left hand for the home page and the next visit.
  const markOpened = useHistory((state) => state.markOpened);
  useEffect(() => markOpened(songId, arrangement.id), [songId, arrangement.id, markOpened]);

  // The document title becomes the default file name when saving a PDF.
  useEffect(() => {
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
    if (exportStatus !== null) return;
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

  const transposeTo = (value: number) =>
    setSemitones(Math.min(MAX_TRANSPOSE, Math.max(-MAX_TRANSPOSE, value)));

  const introHeading = intro !== INTRO_OFF && (
    <h3 className="sheet__heading">
      Intro <span>{introName(bundle, intro)}</span>
    </h3>
  );

  return (
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
          issues={[...performance.song.issues, ...bundle.issues, ...performance.arrangement.issues]}
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
  );
}
