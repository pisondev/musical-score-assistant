import { API_ROOT } from './account';
import { useHistory, type OpenedSong } from './store/history';
import { useSettings } from './store/settings';

/**
 * Keeps what the app remembers in the browser (favourites, the songs last
 * opened with their left hands, and the display settings) with the account,
 * so that the laptop and the phone agree.
 *
 * When the owner is known, the stored state is fetched and merged with what
 * this browser has: the settings of the account win, favourites are joined,
 * and of two visits to a song the later one counts. From then on every change
 * is sent back, a moment after it is made.
 */

const SAVE_DELAY = 800;

/** The settings that travel with the account; the keys of the settings store. */
const SETTING_KEYS = [
  'intro',
  'ending',
  'lift',
  'rightHand',
  'chords',
  'notation',
  'showLyrics',
  'showDynamics',
  'guideOpen',
] as const;

type SettingKey = (typeof SETTING_KEYS)[number];

interface StateDocument {
  version: 1;
  settings: Partial<Record<SettingKey, unknown>>;
  history: { opened: Record<string, OpenedSong>; favourites: string[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function currentDocument(): StateDocument {
  const settings = useSettings.getState();
  const history = useHistory.getState();
  return {
    version: 1,
    settings: Object.fromEntries(SETTING_KEYS.map((key) => [key, settings[key]])),
    history: { opened: history.opened, favourites: history.favourites },
  };
}

/** Takes over the stored settings that have the type the app expects. */
function applySettings(stored: unknown): void {
  if (!isRecord(stored)) return;
  const current = useSettings.getState();
  const accepted: Partial<Record<SettingKey, unknown>> = {};
  for (const key of SETTING_KEYS) {
    if (key in stored && typeof stored[key] === typeof current[key]) accepted[key] = stored[key];
  }
  useSettings.setState(accepted as Partial<ReturnType<typeof useSettings.getState>>);
}

/** Joins the stored history with this browser's: all favourites, and the later of two visits. */
function mergeHistory(stored: unknown): void {
  if (!isRecord(stored)) return;
  const { opened, favourites } = useHistory.getState();
  const merged = { ...opened };
  if (isRecord(stored.opened)) {
    for (const [songId, visit] of Object.entries(stored.opened)) {
      if (
        !isRecord(visit) ||
        typeof visit.openedAt !== 'number' ||
        typeof visit.arrangementId !== 'string'
      ) {
        continue;
      }
      if (!merged[songId] || merged[songId].openedAt < visit.openedAt) {
        merged[songId] = { openedAt: visit.openedAt, arrangementId: visit.arrangementId };
      }
    }
  }
  const storedFavourites = Array.isArray(stored.favourites)
    ? stored.favourites.filter((id): id is string => typeof id === 'string')
    : [];
  useHistory.setState({
    opened: merged,
    favourites: [...new Set([...favourites, ...storedFavourites])],
  });
}

function save(keepalive = false): void {
  void fetch(`${API_ROOT}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(currentDocument()),
    keepalive,
  })
    // Reading the answer lets the browser close the request.
    .then((response) => response.text())
    .catch(() => undefined);
}

/** Starts keeping the state with the account. Returns a function that stops it. */
export function startAccountSync(): () => void {
  let stopped = false;
  let timer = 0;
  const unsubscribers: (() => void)[] = [];

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      save();
    }, SAVE_DELAY);
  };
  // Leaving the page does not lose the last change.
  const flush = () => {
    if (timer === 0) return;
    window.clearTimeout(timer);
    timer = 0;
    save(true);
  };

  void (async () => {
    try {
      const response = await fetch(`${API_ROOT}/state`, { cache: 'no-store' });
      if (!response.ok || stopped) return;
      const { state } = (await response.json()) as { state: unknown };
      if (stopped) return;
      if (isRecord(state)) {
        applySettings(state.settings);
        mergeHistory(state.history);
      }
      save();
      unsubscribers.push(useSettings.subscribe(schedule), useHistory.subscribe(schedule));
      window.addEventListener('pagehide', flush);
    } catch {
      // Without the server the browser keeps the state on its own, as before.
    }
  })();

  return () => {
    stopped = true;
    flush();
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    window.removeEventListener('pagehide', flush);
  };
}
