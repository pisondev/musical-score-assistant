import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ENDING_OFF,
  INTRO_OFF,
  type EndingChoice,
  type IntroChoice,
  type RightHandMode,
} from '../core';

/** How the score is drawn: numbered notation or a grand staff. */
export type Notation = 'numbers' | 'staff';

interface SettingsState {
  /** Which introduction precedes the song. */
  intro: IntroChoice;
  /** Which ending follows the song. */
  ending: EndingChoice;
  /** Half steps by which the key rises for a repeat of the song; 0 plays the song once. */
  lift: number;
  /** What the right hand plays; falls back to the melody where nothing else is written. */
  rightHand: RightHandMode;
  /** Whether the melody gets the written chords under it at its strong points. */
  chords: boolean;
  notation: Notation;
  showLyrics: boolean;
  showDynamics: boolean;
  /** Whether the panel that explains the arrangement is open. */
  guideOpen: boolean;

  setIntro: (intro: IntroChoice) => void;
  setEnding: (ending: EndingChoice) => void;
  setLift: (lift: number) => void;
  setRightHand: (rightHand: RightHandMode) => void;
  toggleChords: () => void;
  setNotation: (notation: Notation) => void;
  toggleLyrics: () => void;
  toggleDynamics: () => void;
  toggleGuide: () => void;
}

/** Display preferences, remembered between visits. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      intro: INTRO_OFF,
      ending: ENDING_OFF,
      lift: 0,
      rightHand: 'melody',
      chords: true,
      notation: 'numbers',
      showLyrics: true,
      showDynamics: true,
      guideOpen: false,

      setIntro: (intro) => set({ intro }),
      setEnding: (ending) => set({ ending }),
      setLift: (lift) => set({ lift }),
      setRightHand: (rightHand) => set({ rightHand }),
      toggleChords: () => set((state) => ({ chords: !state.chords })),
      setNotation: (notation) => set({ notation }),
      toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
      toggleDynamics: () => set((state) => ({ showDynamics: !state.showDynamics })),
      toggleGuide: () => set((state) => ({ guideOpen: !state.guideOpen })),
    }),
    {
      name: 'musical-score-assistant:settings',
      version: 4,
      // Version 1 stored an intro choice that no longer exists; everything else carries over.
      migrate: (persisted, version) => {
        const state = persisted as Partial<SettingsState>;
        return version < 2 ? { ...state, intro: INTRO_OFF } : state;
      },
    },
  ),
);
