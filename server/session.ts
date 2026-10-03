import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed cookies. The server keeps no table of sessions: a cookie carries
 * what it stands for, and an HMAC with the server's secret shows that the
 * server wrote it. Changing the secret signs everybody out.
 */

/** The person behind a session, as Google reported them. */
export interface Account {
  email: string;
  name: string;
  /** Address of the profile picture, when Google gives one. */
  picture?: string;
}

/** A signed-in account and when its session ends, in milliseconds since the epoch. */
export interface Session extends Account {
  expires: number;
}

function mac(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

/** Encodes a value as `<base64url JSON>.<base64url HMAC>`. */
export function signValue(value: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

/** The value of a signed token, or null when it was not signed with this secret. */
export function verifyValue<T>(token: string | undefined, secret: string): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** The session in a signed token, or null when it is forged, malformed, or over. */
export function readSession(token: string | undefined, secret: string, now = Date.now()) {
  const session = verifyValue<Session>(token, secret);
  if (!session || typeof session.email !== 'string' || typeof session.expires !== 'number') {
    return null;
  }
  return session.expires > now ? session : null;
}

/** The cookies of a request header, by name. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const piece of (header ?? '').split(';')) {
    const part = piece.trim();
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const raw = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

export interface CookieOptions {
  /** Seconds until the cookie expires; 0 removes it. */
  maxAge: number;
  /** Sends the cookie over HTTPS only. Off for http://localhost. */
  secure: boolean;
  path?: string;
}

/**
 * A `Set-Cookie` value. Cookies are never readable by scripts, and are sent
 * along when the player follows a link to the site but not with requests that
 * other sites make in the background.
 */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? '/'}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
}
