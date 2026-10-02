import { create } from 'zustand';
import { engine, type HandMode } from '../audio/engine';
import {
  beatTicks,
  buildNoteEvents,
  quarterNotesPerMinute,
  type Arrangement,
  type Song,
} from '../core';

export type PlayerStatus = 'stopped' | 'loading' | 'playing' | 'paused';

export type ScoreReset = 'none' | 'position' | 'song';

export const MIN_TEMPO = 40;
export const MAX_TEMPO = 160;

interface LoopSetting {
  enabled: boolean;
  /** First and last measure of the loop, as zero-based measure indexes. */
  from: number;
  to: number;
}

interface PlayerState {
  status: PlayerStatus;
  error: string | null;
  handMode: HandMode;
  /** Beats per minute, counted in beats of the song's time signature. */
  tempo: number;
  metronome: boolean;
  loop: LoopSetting;
  /** Zero-based index of the measure under the playhead. */
  currentMeasure: number;

  /**
   * Hands the music to the engine. `reset` says how much changed: "none" keeps
   * the playhead (new left hand or key), "position" rewinds (measures were
   * added or removed), and "song" also restores the printed tempo.
   */
  loadScore: (song: Song, arrangement: Arrangement, reset: ScoreReset) => void;
  toggle: () => Promise<void>;
  stop: () => void;
  seekToMeasure: (index: number) => void;
  setHandMode: (mode: HandMode) => void;
  setTempo: (tempo: number) => void;
  toggleMetronome: () => void;
  setLoop: (loop: Partial<LoopSetting>) => void;
  setCurrentMeasure: (index: number) => void;
}

/** The song currently loaded into the engine; needed to convert measures to ticks. */
let activeSong: Song | null = null;

function applyLoop(loop: LoopSetting): void {
  if (!activeSong || !loop.enabled) {
    engine.setLoop(null);
    return;
  }
  const first = activeSong.measures[loop.from];
  const last = activeSong.measures[loop.to];
  if (!first || !last) {
    engine.setLoop(null);
    return;
  }
  engine.setLoop({ start: first.startTick, end: last.startTick + last.length });
}

export const usePlayer = create<PlayerState>((set, get) => ({
  status: 'stopped',
  error: null,
  handMode: 'both',
  tempo: 80,
  metronome: false,
  loop: { enabled: false, from: 0, to: 0 },
  currentMeasure: 0,

  loadScore(song, arrangement, reset) {
    activeSong = song;
    engine.setScore({
      events: buildNoteEvents(song, arrangement),
      totalTicks: song.totalTicks,
      measures: song.measures.map(({ startTick, length }) => ({ startTick, length })),
      beatTicks: beatTicks(song.meta.time),
      beatsPerMeasure: song.meta.time.beats,
    });

    if (reset === 'none') return;

    // The measures changed, so the playhead and the loop no longer point anywhere meaningful.
    const loop = { enabled: false, from: 0, to: song.measures.length - 1 };
    engine.stop();
    engine.seek(0);
    applyLoop(loop);
    set({ status: 'stopped', loop, currentMeasure: 0, error: null });

    if (reset === 'song') {
      engine.setTempo(quarterNotesPerMinute(song.meta.tempo, song.meta.time));
      set({ tempo: song.meta.tempo });
    }
  },

  async toggle() {
    const { status } = get();
    if (status === 'loading') return;
    if (status === 'playing') {
      engine.pause();
      set({ status: 'paused' });
      return;
    }
    try {
      set({ status: 'loading', error: null });
      await engine.play();
      set({ status: 'playing' });
    } catch (error) {
      console.error(error);
      set({
        status: 'stopped',
        error: 'The piano sound could not be loaded. Check the connection and try again.',
      });
    }
  },

  stop() {
    engine.stop();
    const { loop } = get();
    set({ status: 'stopped', currentMeasure: loop.enabled ? loop.from : 0 });
  },

  seekToMeasure(index) {
    const measure = activeSong?.measures[index];
    if (!measure) return;
    engine.seek(measure.startTick);
    set({ currentMeasure: index });
  },

  setHandMode(mode) {
    engine.setHandMode(mode);
    set({ handMode: mode });
  },

  setTempo(tempo) {
    const clamped = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(tempo)));
    if (activeSong) engine.setTempo(quarterNotesPerMinute(clamped, activeSong.meta.time));
    set({ tempo: clamped });
  },

  toggleMetronome() {
    const metronome = !get().metronome;
    engine.setMetronome(metronome);
    set({ metronome });
  },

  setLoop(change) {
    const count = activeSong?.measures.length ?? 1;
    const clamp = (value: number) => Math.min(count - 1, Math.max(0, value));
    const next = { ...get().loop, ...change };
    next.from = clamp(next.from);
    next.to = Math.max(next.from, clamp(next.to));
    applyLoop(next);
    set({ loop: next });
  },

  setCurrentMeasure(index) {
    if (get().currentMeasure !== index) set({ currentMeasure: index });
  },
}));

engine.onEnded = () => {
  const { loop } = usePlayer.getState();
  usePlayer.setState({ status: 'stopped', currentMeasure: loop.enabled ? loop.from : 0 });
};
