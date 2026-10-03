import { createHash, randomBytes } from 'node:crypto';
import type { Account } from './session.ts';

/**
 * Sign-in with Google, by the authorization code flow with PKCE.
 *
 * The browser is sent to Google with a random `state`, a `nonce`, and the
 * hash of a secret `verifier`; all three are kept in a short-lived signed
 * cookie. Google sends the browser back with a code, which the server trades,
 * together with its client secret and the verifier, for an ID token. That
 * token comes straight from Google over HTTPS, so its claims are checked but
 * its signature need not be (OpenID Connect Core, section 3.1.3.7).
 */

export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
  /** The address Google sends the browser back to; registered with the client. */
  redirectUri: string;
}

/** What has to be remembered between sending the browser to Google and its return. */
export interface LoginAttempt {
  state: string;
  nonce: string;
  verifier: string;
  /** Where in the app to go afterwards: a path or a hash on the site itself. */
  returnTo: string;
}

const random = () => randomBytes(32).toString('base64url');
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/** Keeps a return address on the site itself: "/", "/#song=…", never another host. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return '/';
  if (value.startsWith('#')) return `/${value}`;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

/** The address to send the browser to, and what to keep until it comes back. */
export function startLogin(
  client: GoogleClient,
  returnTo: string,
): { url: string; attempt: LoginAttempt } {
  const attempt: LoginAttempt = {
    state: random(),
    nonce: random(),
    verifier: random(),
    returnTo: safeReturnTo(returnTo),
  };
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: challengeOf(attempt.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { url: url.toString(), attempt };
}

/** The claims of a JSON Web Token, without checking its signature. */
export function decodeJwtClaims(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('The ID token is malformed.');
  const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (typeof claims !== 'object' || claims === null) throw new Error('The ID token is empty.');
  return claims as Record<string, unknown>;
}

/** The account in the claims of an ID token, after checking that the token is meant for us. */
export function accountFromClaims(
  claims: Record<string, unknown>,
  client: Pick<GoogleClient, 'clientId'>,
  nonce: string,
  now = Date.now(),
): Account {
  if (!GOOGLE_ISSUERS.includes(String(claims.iss)))
    throw new Error('The token is not from Google.');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(client.clientId)) throw new Error('The token is meant for another app.');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) {
    throw new Error('The token has expired.');
  }
  if (claims.nonce !== nonce) throw new Error('The token belongs to another sign-in.');
  if (typeof claims.email !== 'string' || claims.email_verified !== true) {
    throw new Error('Google has not verified the email address of this account.');
  }
  const email = claims.email.toLowerCase();
  return {
    email,
    name: typeof claims.name === 'string' && claims.name ? claims.name : email,
    ...(typeof claims.picture === 'string' ? { picture: claims.picture } : {}),
  };
}

/** Trades the code from Google's redirect for the account that signed in. */
export async function finishLogin(
  client: GoogleClient,
  code: string,
  attempt: LoginAttempt,
  fetchImplementation: typeof fetch = fetch,
): Promise<Account> {
  const response = await fetchImplementation(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: client.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: attempt.verifier,
    }).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.id_token !== 'string') {
    const reason = typeof body.error === 'string' ? body.error : `status ${response.status}`;
    throw new Error(`Google did not accept the sign-in (${reason}).`);
  }
  return accountFromClaims(decodeJwtClaims(body.id_token), client, attempt.nonce);
}
