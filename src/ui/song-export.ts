import { useMemo } from 'react';
import type { HandMode } from '../audio/engine';
import { estimateMp3Bytes, RECORDING_TAIL } from '../audio/mp3';
import {
  buildNoteEvents,
  exportFileName,
  noteNameToText,
  ticksToSeconds,
  toMidiFile,
  type Performance,
  type Track,
} from '../core';
import { usePlayer } from '../store/player';
import { RIGHT_HAND_NAME } from './right-hand-name';

/** The files a performance can be saved as. */
export type ExportKind = 'midi' | 'mp3';

export const EXPORT_NAME: Record<ExportKind, string> = { midi: 'MIDI', mp3: 'MP3' };
export const EXPORT_EXTENSION: Record<ExportKind, string> = { midi: 'mid', mp3: 'mp3' };

/** What a download contains: the hands that are switched on, and the voice guide when it plays. */
export function tracksOf(performance: Performance, mode: HandMode, voiceGuide: boolean): Track[] {
  const hands: Track[] = mode === 'both' ? ['right', 'left'] : [mode];
  const hasVoice = performance.song.measures.some((measure) => measure.voice !== undefined);
  return hasVoice && voiceGuide ? [...hands, 'voice'] : hands;
}

/** Names the two hands of a performance, e.g. "Alberti bass, accompaniment". */
export function handsLabel(performance: Performance): string {
  const { arrangement, rightHand } = performance;
  return rightHand === 'melody'
    ? arrangement.name
    : `${arrangement.name}, ${RIGHT_HAND_NAME[rightHand].toLowerCase()}`;
}

export function exportFileNameFor(performance: Performance, kind: ExportKind): string {
  const { meta } = performance.song;
  return exportFileName(
    meta.title,
    handsLabel(performance).replace(' + ', ' with '),
    noteNameToText(meta.key),
    EXPORT_EXTENSION[kind],
  );
}

/** The MIDI file of a performance: the given tracks at the given tempo. */
export function midiFileOf(performance: Performance, tempo: number, tracks: Track[]): Uint8Array {
  const { song, arrangement, sections } = performance;
  return toMidiFile(song, buildNoteEvents(song, arrangement), {
    tempo,
    tracks,
    // The repeat in a higher key announces itself with a new key signature.
    keyChanges: sections.map((section) => ({
      tick: song.measures[section.start].startTick,
      key: section.key,
    })),
  });
}

/** What a download of the performance would hold right now. */
export interface ExportFacts {
  tempo: number;
  handMode: HandMode;
  tracks: Track[];
  /** Whether the right hand accompanies, so that the voice guide is a choice at all. */
  hasVoice: boolean;
  voiceGuide: boolean;
  /** Length of the music, in seconds. */
  seconds: number;
  /** Size of each file in bytes: exact for MIDI, a close estimate for MP3. */
  bytes: Record<ExportKind, number>;
}

/**
 * Follows the playback bar and says what a download holds: both files take
 * the tempo of the slider and only the hands that are switched on.
 */
export function useExportFacts(performance: Performance): ExportFacts {
  const tempo = usePlayer((state) => state.tempo);
  const handMode = usePlayer((state) => state.handMode);
  const voiceGuide = usePlayer((state) => state.voiceGuide);

  return useMemo(() => {
    const { song } = performance;
    const tracks = tracksOf(performance, handMode, voiceGuide);
    const seconds = ticksToSeconds(song.totalTicks, tempo, song.meta.time);
    return {
      tempo,
      handMode,
      tracks,
      hasVoice: song.measures.some((measure) => measure.voice !== undefined),
      voiceGuide,
      seconds,
      bytes: {
        midi: midiFileOf(performance, tempo, tracks).length,
        mp3: estimateMp3Bytes(seconds + RECORDING_TAIL),
      },
    };
  }, [performance, tempo, handMode, voiceGuide]);
}
