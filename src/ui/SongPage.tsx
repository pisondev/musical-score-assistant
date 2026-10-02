import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { engine, type HandMode } from '../audio/engine';
import { encodeMp3 } from '../audio/mp3';
import {
  BASELINE_ID,
  buildNoteEvents,
  buildPerformance,
  ENDING_OFF,
  formatNoteName,
  INTRO_LAST_PHRASE,
  INTRO_OFF,
  exportFileName,
  measureNames,
  noteNameToText,
  toMidiFile,
  type EndingChoice,
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
  const endingSetting = useSettings((state) => state.ending);
  const lift = useSettings((state) => state.lift);
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
  // An ending written for another song is simply left out.
  const ending: EndingChoice = bundle.endings.some((written) => written.id === endingSetting)
    ? endingSetting
    : ENDING_OFF;

  const performance = useMemo(
    () => buildPerformance(bundle, arrangement, intro, semitones, rightHand, { ending, lift }),
    [bundle, arrangement, intro, semitones, rightHand, ending, lift],
  );
  const names = useMemo(() => measureNames(performance), [performance]);

  // Tell the engine what changed, so it keeps the playhead whenever it can.
  // A different introduction, ending, or repeat adds or removes measures.
  const loadScore = usePlayer((state) => state.loadScore);
  const form = `${intro}|${ending}|${lift}`;
  const loadedForm = useRef<string | null>(null);
  useEffect(() => {
    let reset: ScoreReset = 'none';
    if (loadedForm.current === null) reset = 'song';
    else if (loadedForm.current !== form) reset = 'position';
    loadedForm.current = form;
    loadScore(performance.song, performance.arrangement, reset);
  }, [performance, form, loadScore]);

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
    const { song, arrangement: played, sections } = performance;
    const bytes = toMidiFile(song, buildNoteEvents(song, played), {
      tempo,
      tracks: tracksOf(performance, handMode, voiceGuide),
      // The repeat in a higher key announces itself with a new key signature.
      keyChanges: sections.map((section) => ({
        tick: song.measures[section.start].startTick,
        key: section.key,
      })),
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
          ending={ending}
          lift={lift}
          semitones={semitones}
          onTranspose={transposeTo}
          soundingKey={performance.song.meta.key}
          onPrint={print}
          onDownloadMidi={downloadMidi}
          onDownloadMp3={() => void downloadMp3()}
          exportStatus={exportStatus}
        />
        <IssueList
          names={names}
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
              />
            ) : (
              <Sheet
                bundle={bundle}
                performance={performance}
                showLyrics={showLyrics}
                showDynamics={showDynamics}
                printing={printing}
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
      <TransportBar song={performance.song} names={names} />
    </>
  );
}
