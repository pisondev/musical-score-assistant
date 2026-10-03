import { R2Store, r2ConfigFrom } from '../server/r2-store.ts';
import { readEnvFile } from './remote';

/**
 * The R2 bucket of the app, for the scripts on this computer. The token comes
 * from `.env.production` (git-ignored): R2_ACCOUNT_ID, R2_BUCKET,
 * R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.
 */
export function openBucket(envFile = '.env.production'): R2Store {
  const config = r2ConfigFrom(readEnvFile(envFile));
  if (!config) {
    throw new Error(
      `${envFile} lacks the R2 settings (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).`,
    );
  }
  return new R2Store(config);
}
