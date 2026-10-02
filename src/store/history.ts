import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** What is remembered about a song the player has opened. */
export interface OpenedSong {
  /** When the song was last on screen, in milliseconds since the epoch. */
  openedAt: number;
  /** The left hand that was selected, restored when the song is opened again. */
  arrangementId: string;
}

interface HistoryState {
  /** Songs the player has opened, by song id. */
  opened: Record<string, OpenedSong>;
  /** Ids of the songs marked as favourites. */
  favourites: string[];

  markOpened: (songId: string, arrangementId: string) => void;
  toggleFavourite: (songId: string) => void;
}

/** Which songs the player opened and marked, remembered between visits. */
export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      opened: {},
      favourites: [],

      markOpened: (songId, arrangementId) =>
        set((state) => ({
          opened: { ...state.opened, [songId]: { openedAt: Date.now(), arrangementId } },
        })),
      toggleFavourite: (songId) =>
        set((state) => ({
          favourites: state.favourites.includes(songId)
            ? state.favourites.filter((id) => id !== songId)
            : [...state.favourites, songId],
        })),
    }),
    { name: 'musical-score-assistant:history', version: 1 },
  ),
);
