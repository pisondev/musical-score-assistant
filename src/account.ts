import { create } from 'zustand';

/**
 * Who is in front of the app. On the public site anybody signs in with Google:
 * the owner, who also sees the licensed songs and keeps notes, or a member,
 * who chooses from the public songs. On a development machine the computer
 * itself is the owner; a build served by a plain web server has no accounts at
 * all, and everybody is a guest.
 */

export const API_ROOT = `${import.meta.env.BASE_URL}api`;

/** An owner sees the licensed songs and keeps notes; a member chooses from the public songs. */
export type Role = 'owner' | 'member';

/** Whoever is signed in. */
export interface AccountInfo {
  email: string;
  name: string;
  picture?: string;
  role: Role;
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

/** The account in an answer of the server; anything but an owner counts as a member. */
function readAccount(value: unknown): AccountInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const { email, name, picture, role } = value as Partial<Record<keyof AccountInfo, unknown>>;
  if (typeof email !== 'string' || typeof name !== 'string') return null;
  return {
    email,
    name,
    ...(typeof picture === 'string' ? { picture } : {}),
    role: role === 'owner' ? 'owner' : 'member',
  };
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
      set({ status: 'ready', account: readAccount(body.account), signIn });
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

/**
 * Removes the account and everything the server keeps for it, ends the session, and starts
 * the app afresh as a guest. Throws when the server refuses, so the dialog can say so.
 */
export async function deleteAccount(): Promise<void> {
  const response = await fetch(`${API_ROOT}/account`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  window.location.reload();
}

/** The page that says what the site keeps about the people who sign in. */
export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy.html`;

/** The terms of use of the site. */
export const TERMS_URL = `${import.meta.env.BASE_URL}terms.html`;
