import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { engine } from '../audio/engine';
import { encodeMp3 } from '../audio/mp3';
import {
  BASELINE_ID,
  buildPerformance,
  ENDING_OFF,
  formatNoteName,
  INTRO_LAST_PHRASE,
  INTRO_OFF,
  measureNames,
  noteContext,
  notesAt,
  noteTarget,
  type EndingChoice,
  type IntroChoice,
  type MeasureNote,
  type NoteTarget,
} from '../core';
import type { SongEntry } from '../library';
import { useHistory } from '../store/history';
import { usePlayer, type ScoreReset } from '../store/player';
import { useSettings } from '../store/settings';
import { cx } from './classnames';
import { DownloadDialog } from './DownloadDialog';
import { Guide } from './Guide';
import { CloseIcon, LoopIcon, MoreIcon, PencilIcon, PlayIcon, PlusIcon } from './icons';
import { FormProgress } from './FormProgress';
import { FullScreenButton } from './FullScreenButton';
import { IssueList } from './IssueList';
import { MeasureOverlay } from './MeasureOverlay';
import { MeasureMenu, type MeasureMenuItem } from './MeasureMenu';
import { NoteDialog } from './NoteDialog';
import { RIGHT_HAND_NAME } from './right-hand-name';
import { Sheet } from './Sheet';
import {
  exportFileNameFor,
  handsLabel,
  midiFileOf,
  tracksOf,
  type ExportKind,
} from './song-export';
import { SongHeader } from './SongHeader';
import { StaffSheet } from './StaffSheet';
import { MAX_TRANSPOSE, Toolbar } from './Toolbar';
import { TransportBar } from './TransportBar';
import { useMeasureMenu } from './useMeasureMenu';
import { useMeasureNotes } from './useMeasureNotes';
import { useWakeLock } from './useWakeLock';
import { zoomIn, zoomOut } from './zoom';
import { ZoomControl } from './ZoomControl';

const LEVEL_LABEL = { easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

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
  /** The place in the top bar for the controls of the song; null until the bar is drawn. */
  tools: HTMLElement | null;
  /** The place under those controls for the progress bar. */
  progress: HTMLElement | null;
}

/**
 * One song: its score, the controls that decide what is on it, and playback.
 * The page is mounted afresh for every song, so its choices start from what
 * was remembered for that song.
 */
export function SongPage({ entry, tools, progress }: SongPageProps) {
  const { bundle } = entry;
  const songId = entry.id;
  const [arrangementId, setArrangementId] = useState(
    () => useHistory.getState().opened[songId]?.arrangementId ?? BASELINE_ID,
  );
  const [semitones, setSemitones] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  // The file the player asked for, while the dialog asks whether its settings are right.
  const [downloadAsked, setDownloadAsked] = useState<ExportKind | null>(null);

  const introSetting = useSettings((state) => state.intro);
  const endingSetting = useSettings((state) => state.ending);
  const lift = useSettings((state) => state.lift);
  const rightHand = useSettings((state) => state.rightHand);
  const chords = useSettings((state) => state.chords);
  const notation = useSettings((state) => state.notation);
  const showLyrics = useSettings((state) => state.showLyrics);
  const showDynamics = useSettings((state) => state.showDynamics);
  const guideOpen = useSettings((state) => state.guideOpen);
  const zoom = useSettings((state) => state.zoom);

  // A score on the music stand keeps the screen on.
  useWakeLock(true);

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
    () =>
      buildPerformance(bundle, arrangement, intro, semitones, rightHand, { ending, lift, chords }),
    [bundle, arrangement, intro, semitones, rightHand, ending, lift, chords],
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
      // While a dialog is open, the keys belong to its buttons.
      if (document.querySelector('.dialog')) return;
      const player = usePlayer.getState();
      if (event.code === 'Space') {
        event.preventDefault();
        void player.toggle();
      } else if (event.key === '1') player.setHandMode('both');
      else if (event.key === '2') player.setHandMode('left');
      else if (event.key === '3') player.setHandMode('right');
      else if (event.key === 'v' || event.key === 'V') player.toggleVoiceGuide();
      else if (event.key === 'Home') player.stop();
      else if (event.key === '+' || event.key === '=') {
        useSettings.getState().setZoom(zoomIn(useSettings.getState().zoom));
      } else if (event.key === '-' || event.key === '_') {
        useSettings.getState().setZoom(zoomOut(useSettings.getState().zoom));
      } else if (event.key === '0') useSettings.getState().setZoom(1);
      else if (event.key === 'Escape') deselectMeasure.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Escape takes the button at the corner of the selected measure away again.
  const deselectMeasure = useRef<() => void>(() => undefined);

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
    const bytes = midiFileOf(performance, tempo, tracksOf(performance, handMode, voiceGuide));
    saveFile(
      new Blob([bytes.slice().buffer], { type: 'audio/midi' }),
      exportFileNameFor(performance, 'midi'),
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
      saveFile(file, exportFileNameFor(performance, 'mp3'));
    } catch (error) {
      console.error(error);
      usePlayer.setState({ error: 'The MP3 could not be created. Please try again.' });
    } finally {
      setExportStatus(null);
    }
  }, [performance, exportStatus]);

  const transposeTo = (value: number) =>
    setSemitones(Math.min(MAX_TRANSPOSE, Math.max(-MAX_TRANSPOSE, value)));

  // The player's notes on measures. A note belongs to a place (measure 12, the second measure
  // of an introduction), which the sheet may show more than once or not at all.
  const playerNotes = useMeasureNotes(songId);
  const [noteTargetOpen, setNoteTargetOpen] = useState<NoteTarget | null>(null);
  const targets = useMemo(
    () =>
      performance.song.measures.map((_, index) =>
        noteTarget(performance, index, { intro, ending }),
      ),
    [performance, intro, ending],
  );
  const noted = useMemo(() => {
    const indexes = new Set<number>();
    targets.forEach((target, index) => {
      if (notesAt(playerNotes.notes, target).length > 0) indexes.add(index);
    });
    return indexes;
  }, [targets, playerNotes.notes]);
  const openNotes = useCallback((index: number) => setNoteTargetOpen(targets[index]), [targets]);
  const openNote = useCallback((note: MeasureNote) => {
    const { part, measure, passage, where } = note;
    setNoteTargetOpen({ part, measure, passage, where });
  }, []);
  const saveNote = (text: string, id?: string) => {
    if (!noteTargetOpen) return;
    const now = new Date().toISOString();
    const existing = playerNotes.notes.find((note) => note.id === id);
    void playerNotes.save(
      existing
        ? { ...existing, text, updatedAt: now }
        : {
            id: globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}`,
            ...noteTargetOpen,
            text,
            context: noteContext(performance, { intro, ending, lift }),
            createdAt: now,
            updatedAt: now,
          },
    );
  };

  // A right click or a long press on a measure opens its menu; a plain click selects the
  // measure, and the button at its corner opens the same menu.
  const measureMenu = useMeasureMenu();
  const selectedMeasure =
    measureMenu.selected !== null && names[measureMenu.selected] ? measureMenu.selected : null;
  useEffect(() => {
    deselectMeasure.current = measureMenu.deselect;
  }, [measureMenu.deselect]);
  const loop = usePlayer((state) => state.loop);
  const loopRest = usePlayer((state) => state.loopRest);
  const tempo = usePlayer((state) => state.tempo);
  // The measures that carry controls at their corner: the end of the loop, with the button
  // that switches it off, and the measure that was clicked, with the button for its menu.
  const loopEnd = loop.enabled && names[loop.to] ? loop.to : null;
  const corners = [...new Set([loopEnd, selectedMeasure])].filter(
    (index): index is number => index !== null,
  );
  const menuTarget = measureMenu.target;
  const menuItems = useMemo((): MeasureMenuItem[] => {
    if (!menuTarget || !names[menuTarget.index]) return [];
    const { index } = menuTarget;
    const player = usePlayer.getState();
    const items: MeasureMenuItem[] = [
      {
        id: 'play',
        label: 'Play from here',
        icon: <PlayIcon width={16} height={16} />,
        onSelect: () => {
          player.seekToMeasure(index);
          if (usePlayer.getState().status !== 'playing') void player.toggle();
        },
      },
    ];
    const alone = loop.enabled && loop.from === index && loop.to === index;
    if (!alone) {
      items.push({
        id: 'loop',
        label: 'Loop this measure',
        hint: 'Repeat this measure, with a short rest to breathe before each round, until the loop is switched off.',
        icon: <LoopIcon width={16} height={16} />,
        onSelect: () => {
          player.setLoop({ enabled: true, from: index, to: index });
          player.seekToMeasure(index);
        },
      });
    }
    if (loop.enabled && (index < loop.from || index > loop.to)) {
      const from = Math.min(loop.from, index);
      const to = Math.max(loop.to, index);
      items.push({
        id: 'extend',
        label: 'Extend the loop to here',
        hint: `Repeat from ${names[from].position} to ${names[to].position}.`,
        icon: <PlusIcon width={16} height={16} />,
        onSelect: () => player.setLoop({ enabled: true, from, to }),
      });
    }
    if (loop.enabled) {
      items.push({
        id: 'unloop',
        label: 'Switch the loop off',
        hint: 'Play straight through again.',
        icon: <LoopIcon width={16} height={16} />,
        onSelect: () => player.setLoop({ enabled: false }),
      });
    }
    const written = notesAt(playerNotes.notes, targets[index]).length;
    items.push({
      id: 'note',
      label: written > 0 ? `Notes (${written})…` : 'Write a note…',
      hint: 'A correction, something you like, something to change. It is saved with the song.',
      icon: <PencilIcon width={16} height={16} />,
      onSelect: () => openNotes(index),
    });
    return items;
  }, [menuTarget, names, loop, playerNotes.notes, targets, openNotes]);

  return (
    <>
      <main className="page">
        <SongHeader song={performance.song} isPrivate={entry.isPrivate} />
        {tools &&
          createPortal(
            <Toolbar
              bundle={bundle}
              arrangement={arrangement}
              onSelectArrangement={setArrangementId}
              rightHand={performance.rightHand}
              chords={performance.chords}
              intro={intro}
              ending={ending}
              lift={lift}
              semitones={semitones}
              onTranspose={transposeTo}
              soundingKey={performance.song.meta.key}
              onPrint={print}
              performance={performance}
              onAskDownload={setDownloadAsked}
              exportStatus={exportStatus}
            />,
            tools,
          )}
        {progress &&
          createPortal(
            <FormProgress performance={performance}>
              <ZoomControl />
              <FullScreenButton />
            </FormProgress>,
            progress,
          )}
        <IssueList
          names={names}
          issues={[...performance.song.issues, ...bundle.issues, ...performance.arrangement.issues]}
        />
        <div className={cx('workspace', guideOpen && 'workspace--guide')}>
          <section className="card card--sheet" {...measureMenu.handlers}>
            <p className="print-summary">
              Left hand: {arrangement.name} ({LEVEL_LABEL[arrangement.level]}
              {arrangement.style && `, ${arrangement.style}`}) · Right hand:{' '}
              {RIGHT_HAND_NAME[performance.rightHand]}
              {performance.chords && ' with chords'}
            </p>
            {notation === 'staff' ? (
              <StaffSheet
                performance={performance}
                showLyrics={showLyrics}
                showDynamics={showDynamics}
                printing={printing}
                noted={noted}
                onOpenNotes={openNotes}
                zoom={zoom}
              />
            ) : (
              <Sheet
                bundle={bundle}
                performance={performance}
                showLyrics={showLyrics}
                showDynamics={showDynamics}
                printing={printing}
                noted={noted}
                onOpenNotes={openNotes}
                zoom={zoom}
              />
            )}
            {!printing &&
              corners.map((index) => (
                <MeasureOverlay
                  key={index}
                  index={index}
                  place="corner"
                  above={notation === 'staff'}
                  layout={performance}
                >
                  {index === loopEnd && (
                    <button
                      type="button"
                      className="loop-off"
                      aria-label="Switch the loop off and play straight through again"
                      title="Switch the loop off"
                      onClick={() => usePlayer.getState().setLoop({ enabled: false })}
                    >
                      <LoopIcon width={13} height={13} />
                      <span>Loop</span>
                      <CloseIcon width={13} height={13} />
                    </button>
                  )}
                  {index === selectedMeasure && (
                    <button
                      type="button"
                      className="measure-more"
                      aria-haspopup="menu"
                      aria-label={`Options for ${names[index].long}`}
                      title="Loop this measure, write a note, and more"
                      onClick={(event) => {
                        const box = event.currentTarget.getBoundingClientRect();
                        measureMenu.open(index, box.left, box.bottom + 6);
                      }}
                    >
                      <MoreIcon width={18} height={18} />
                    </button>
                  )}
                </MeasureOverlay>
              ))}
            {!printing && loopRest && names[loop.from] && (
              <MeasureOverlay index={loop.from} place="center" layout={performance}>
                {/* A new element for every beat, so that each number fades in and out. */}
                <span
                  key={loopRest.beat}
                  className="loop-count"
                  style={{ animationDuration: `${60 / tempo}s` }}
                  aria-hidden="true"
                >
                  {loopRest.beat + 1}
                </span>
              </MeasureOverlay>
            )}
          </section>
          {guideOpen && (
            <section className="card card--guide">
              <Guide
                performance={performance}
                playerNotes={playerNotes.notes}
                onOpenNote={openNote}
              />
            </section>
          )}
        </div>
      </main>
      {menuTarget && menuItems.length > 0 && (
        <MeasureMenu
          title={names[menuTarget.index].long}
          x={menuTarget.x}
          y={menuTarget.y}
          items={menuItems}
          onClose={measureMenu.close}
        />
      )}
      {noteTargetOpen && (
        <NoteDialog
          target={noteTargetOpen}
          notes={notesAt(playerNotes.notes, noteTargetOpen)}
          home={playerNotes.home}
          onSave={saveNote}
          onDelete={(id) => void playerNotes.remove(id)}
          onClose={() => setNoteTargetOpen(null)}
        />
      )}
      {downloadAsked && (
        <DownloadDialog
          kind={downloadAsked}
          bundle={bundle}
          performance={performance}
          intro={intro}
          ending={ending}
          lift={lift}
          semitones={semitones}
          onConfirm={downloadAsked === 'midi' ? downloadMidi : () => void downloadMp3()}
          onClose={() => setDownloadAsked(null)}
        />
      )}
      <TransportBar song={performance.song} names={names} />
    </>
  );
}
