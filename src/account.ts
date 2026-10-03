import { create } from 'zustand';

/**
 * Who is in front of the app. On the public site the owner signs in with
 * Google; on a development machine the computer itself is the owner; a build
 * served by a plain web server has no accounts at all, and everybody is a
 * guest.
 */

export const API_ROOT = `${import.meta.env.BASE_URL}api`;

/** The owner who is signed in. */
export interface AccountInfo {
  email: string;
  name: string;
  picture?: string;
}

/** "google" where one signs in with Google, "local" on a development machine, "none" otherwise. */
export type SignIn = 'google' | 'local' | 'none';

interface AccountState {
  /** "checking" until the server has answered, or until it is clear that there is none. */
  status: 'checking' | 'ready';
  account: AccountInfo | null;
  signIn: SignIn;
  /** Asks the server who is signed in. */
  check: () => Promise<void>;
}

function isAccount(value: unknown): value is AccountInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AccountInfo).email === 'string' &&
    typeof (value as AccountInfo).name === 'string'
  );
}

export const useAccount = create<AccountState>((set) => ({
  status: 'checking',
  account: null,
  signIn: 'none',

  async check() {
    try {
      const response = await fetch(`${API_ROOT}/me`, { cache: 'no-store' });
      const type = response.headers.get('Content-Type') ?? '';
      if (!response.ok || !type.includes('application/json')) throw new Error('No server.');
      const body = (await response.json()) as { account?: unknown; signIn?: unknown };
      const signIn: SignIn =
        body.signIn === 'google' || body.signIn === 'local' ? body.signIn : 'none';
      set({ status: 'ready', account: isAccount(body.account) ? body.account : null, signIn });
    } catch {
      set({ status: 'ready', account: null, signIn: 'none' });
    }
  },
}));

/** The address that starts signing in and comes back to the same place in the app. */
export function signInUrl(returnTo: string = window.location.hash): string {
  return `${API_ROOT}/auth/google/start?return=${encodeURIComponent(returnTo || '/')}`;
}

/** Ends the session and starts the app afresh as a guest. */
export async function signOut(): Promise<void> {
  try {
    await fetch(`${API_ROOT}/auth/logout`, { method: 'POST' });
  } finally {
    window.location.reload();
  }
}
