import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { INTRO_OFF, type IntroChoice, type RightHandMode } from '../core';

/** How the score is drawn: numbered notation or a grand staff. */
export type Notation = 'numbers' | 'staff';

interface SettingsState {
  /** Which introduction precedes the song. */
  intro: IntroChoice;
  /** What the right hand plays; falls back to the melody where nothing else is written. */
  rightHand: RightHandMode;
  notation: Notation;
  showLyrics: boolean;
  showDynamics: boolean;
  /** Whether the panel that explains the arrangement is open. */
  guideOpen: boolean;

  setIntro: (intro: IntroChoice) => void;
  setRightHand: (rightHand: RightHandMode) => void;
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
      rightHand: 'melody',
      notation: 'numbers',
      showLyrics: true,
      showDynamics: true,
      guideOpen: false,

      setIntro: (intro) => set({ intro }),
      setRightHand: (rightHand) => set({ rightHand }),
      setNotation: (notation) => set({ notation }),
      toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
      toggleDynamics: () => set((state) => ({ showDynamics: !state.showDynamics })),
      toggleGuide: () => set((state) => ({ guideOpen: !state.guideOpen })),
    }),
    {
      name: 'musical-score-assistant:settings',
      version: 3,
      // Version 1 stored an intro choice that no longer exists; everything else carries over.
      migrate: (persisted, version) => {
        const state = persisted as Partial<SettingsState>;
        return version < 2 ? { ...state, intro: INTRO_OFF } : state;
      },
    },
  ),
);
