import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IntroChoice } from '../core';

interface SettingsState {
  /** Which introduction precedes the song. */
  intro: IntroChoice;
  showLyrics: boolean;
  showDynamics: boolean;
  /** Whether the panel that explains the arrangement is open. */
  guideOpen: boolean;

  setIntro: (intro: IntroChoice) => void;
  toggleLyrics: () => void;
  toggleDynamics: () => void;
  toggleGuide: () => void;
}

/** Display preferences, remembered between visits. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      intro: 'off',
      showLyrics: true,
      showDynamics: true,
      guideOpen: false,

      setIntro: (intro) => set({ intro }),
      toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
      toggleDynamics: () => set((state) => ({ showDynamics: !state.showDynamics })),
      toggleGuide: () => set((state) => ({ guideOpen: !state.guideOpen })),
    }),
    { name: 'musical-score-assistant:settings', version: 1 },
  ),
);
