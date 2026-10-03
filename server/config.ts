import { randomBytes } from 'node:crypto';
import type { GoogleSignIn } from './api.ts';
import { r2ConfigFrom, type R2Config } from './r2-store.ts';

/**
 * The settings of the production server, read from its environment. On the
 * server they come from the `.env` file next to `compose.yaml`; see
 * docs/deployment.md.
 */
export interface ServerConfig {
  host: string;
  port: number;
  /** The built site. */
  staticDir: string;
  songsDir: string;
  dataDir: string;
  /** Signing in with Google; null when the client is not configured. */
  google: GoogleSignIn | null;
  /** The bucket for private songs, notes, and account state; null keeps them on disk. */
  r2: R2Config | null;
  /** Problems a person should know about; the server still starts. */
  warnings: string[];
}

const MIN_SECRET_LENGTH = 32;

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const warnings: string[] = [];
  const port = Number(env.PORT ?? 3020);
  const origin = (env.PUBLIC_ORIGIN ?? `http://localhost:${port}`).replace(/\/+$/, '');
  const allowedEmails = (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  let sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length < MIN_SECRET_LENGTH) {
    warnings.push(
      `SESSION_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters; a random one is used, so every restart signs everybody out.`,
    );
    sessionSecret = randomBytes(32).toString('base64url');
  }

  let google: GoogleSignIn | null = null;
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    google = {
      client: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: `${origin}/api/auth/google/callback`,
      },
      sessionSecret,
      allowedEmails,
      origin,
    };
    if (allowedEmails.length === 0) warnings.push('ALLOWED_EMAILS is empty; nobody can sign in.');
  } else {
    warnings.push('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing; signing in is off.');
  }

  const r2 = r2ConfigFrom(env);
  if (!r2) {
    warnings.push(
      'R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET); private songs, notes, and account state are kept on disk.',
    );
  }

  return {
    host: env.HOST ?? '127.0.0.1',
    port,
    staticDir: env.STATIC_DIR ?? 'dist',
    songsDir: env.SONGS_DIR ?? 'songs',
    dataDir: env.DATA_DIR ?? '.local/data',
    google,
    r2,
    warnings,
  };
}
