import { create } from 'zustand';

/**
 * The app installed on a phone, tablet, or computer: it opens from the home screen in a window
 * of its own, without the bars of the browser, and works without a connection. This module
 * registers the service worker (`src/service-worker/`) and keeps the browser's offer to
 * install the app.
 */

/** The event of Chrome, Edge, and Samsung Internet that offers to install the app. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** How the app can be installed here. */
export type InstallWay =
  /** The browser offers it, and a button of the app can start it. */
  | 'prompt'
  /** iPhone and iPad install from the Share menu only, so the app explains how. */
  | 'share-menu'
  /** Already installed, or not possible in this browser. */
  | 'none';

interface InstallState {
  way: InstallWay;
  /** Asks the browser to install the app; settles once the player has answered. */
  install: () => Promise<void>;
}

const DISMISSED_KEY = 'musical-score-assistant:install-dismissed';

/** Whether the app runs as an installed app, in a window of its own. */
function runsInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    standalone ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
}

/** iPhone, iPod, and iPad; an iPad presents itself as a Mac with a touch screen. */
function isAppleMobile(): boolean {
  const agent = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(agent) || (agent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

let offer: InstallPromptEvent | null = null;

export const useInstall = create<InstallState>((set) => ({
  way: !runsInstalled() && isAppleMobile() ? 'share-menu' : 'none',

  async install() {
    if (!offer) return;
    const event = offer;
    offer = null;
    await event.prompt();
    // Accepted or not, the browser does not offer it again during this visit.
    await event.userChoice;
    set({ way: 'none' });
  },
}));

/** Whether the player has put the offer to install away; it then stays away on this device. */
export function installDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Storage may be blocked; the offer then returns on the next visit.
  }
}

/**
 * Registers the service worker and listens for the browser's offer to install. Only the built
 * site has a worker: during development it would keep old files in the way.
 */
export function startInstalledApp(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offer = event as InstallPromptEvent;
    useInstall.setState({ way: 'prompt' });
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    useInstall.setState({ way: 'none' });
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    });
  }
}
