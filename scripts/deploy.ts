/**
 * Puts the app on the server.
 *
 *   npm run deploy               build, upload, and switch to the new version
 *   npm run deploy -- --setup    first set up the server: its .env, compose.yaml, bin/receive
 *   npm run deploy -- --setup-only   set up the server and stop
 *
 * GitHub Actions runs the same command after every push to main. The site and
 * the server are built here, checked for private songs, and sent over SSH as
 * one archive with the public song folders; `bin/receive` on the server puts
 * the new version in place and goes back to the previous one if it does not
 * answer. Private songs, notes, and the state of accounts live in the R2
 * bucket and are never part of a deploy (`npm run songs:push` sends private
 * songs). See docs/deployment.md.
 */
import { randomBytes } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { DEPLOY_DIR, DEPLOY_HOST, readEnvFile, remote, run, streamTar } from './remote';

const STAGE = '.local/deploy';
const ENV_FILE = '.env.production';
const PRIVATE_SONGS = 'songs/private';
/** What never leaves this computer with a deploy. */
const isLeftBehind = (path: string) => {
  const name = basename(path);
  return (
    name === 'notes.json' ||
    name === 'exports' ||
    /^source\./.test(name) ||
    relative('songs', path).split(sep)[0] === 'private'
  );
};

const remoteDir = `"$HOME/${DEPLOY_DIR}"`;

function filesBelow(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

/**
 * Stops the deploy when a private song ended up in the built site, which
 * anybody can download: its title or its folder appears in a built file.
 */
function checkBuildHasNoPrivateSongs(): void {
  const songFiles = filesBelow(PRIVATE_SONGS).filter((file) => basename(file) === 'song.txt');
  const markers = songFiles.flatMap((file) => {
    const title = /^title:\s*(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1]?.trim();
    const folder = basename(join(file, '..'));
    return [title, folder].filter((marker): marker is string => Boolean(marker));
  });
  const textFiles = filesBelow('dist').filter((file) =>
    ['.js', '.html', '.css', '.json', '.map', '.txt'].includes(extname(file)),
  );
  for (const file of textFiles) {
    const text = readFileSync(file, 'utf8');
    const found = markers.find((marker) => text.includes(marker));
    if (found) {
      throw new Error(
        `The build contains a private song ("${found}" in ${file}). Nothing was sent.`,
      );
    }
  }
  console.log(`Checked: none of the ${songFiles.length} private songs is in the built site.`);
}

/** Lays out what goes to the server: app/ (site and server) and the public songs. */
function stage(): void {
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(join(STAGE, 'app'), { recursive: true });
  cpSync('dist', join(STAGE, 'app', 'dist'), { recursive: true });
  cpSync('dist-server', join(STAGE, 'app', 'dist-server'), { recursive: true });
  cpSync('songs', join(STAGE, 'songs'), {
    recursive: true,
    filter: (source) => !isLeftBehind(source),
  });
  const size = filesBelow(STAGE).reduce((total, file) => total + statSync(file).size, 0);
  console.log(`Staged ${(size / 1024 / 1024).toFixed(1)} MB.`);
}

/**
 * Sets the server up, or brings its setup up to date: adds what is missing to
 * its .env (values from .env.production here, and a new session secret),
 * and installs compose.yaml and bin/receive from deploy/. Existing values in
 * the .env are never changed.
 */
function setup(): void {
  const local = readEnvFile(ENV_FILE);
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PUBLIC_ORIGIN', 'ALLOWED_EMAILS'];
  const missing = required.filter((key) => !local[key]);
  if (missing.length > 0) throw new Error(`${ENV_FILE} lacks ${missing.join(', ')}.`);

  const ids = remote('printf "%s:%s" "$(id -u)" "$(id -g)"').trim().split(':');
  const wanted: Record<string, string | undefined> = {
    PUBLIC_ORIGIN: local.PUBLIC_ORIGIN,
    ALLOWED_EMAILS: local.ALLOWED_EMAILS,
    GOOGLE_CLIENT_ID: local.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: local.GOOGLE_CLIENT_SECRET,
    R2_ACCOUNT_ID: local.R2_ACCOUNT_ID,
    R2_BUCKET: local.R2_BUCKET,
    R2_ACCESS_KEY_ID: local.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: local.R2_SECRET_ACCESS_KEY,
    SESSION_SECRET: randomBytes(48).toString('base64url'),
    APP_UID: ids[0],
    APP_GID: ids[1],
  };
  const present = new Set(
    remote(
      `mkdir -p ${remoteDir}; cd ${remoteDir}; [ -f .env ] && grep -oE '^[A-Z0-9_]+=' .env | tr -d = || true`,
    )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const added = Object.entries(wanted).filter(([key, value]) => value && !present.has(key));
  if (added.length > 0) {
    // The secrets travel on standard input, never on a command line.
    remote(
      `set -e; umask 077; cd ${remoteDir}; touch .env; cat >> .env`,
      added.map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
    );
  }
  const skipped = Object.entries(wanted).filter(([key, value]) => !value && !present.has(key));
  console.log(
    added.length > 0
      ? `Added to the .env of the server: ${added.map(([key]) => key).join(', ')}.`
      : 'The .env of the server has everything; kept it.',
  );
  if (skipped.length > 0) {
    console.log(`Not in ${ENV_FILE}, so not set: ${skipped.map(([key]) => key).join(', ')}.`);
  }

  remote(
    `set -e; cd ${remoteDir}; cat > compose.yaml`,
    readFileSync('deploy/compose.yaml', 'utf8'),
  );
  remote(
    `set -e; cd ${remoteDir}; mkdir -p bin data; cat > bin/receive; chmod 700 bin/receive`,
    readFileSync('deploy/receive.sh', 'utf8').replace(/\r\n/g, '\n'),
  );
  console.log('Installed compose.yaml and bin/receive.');
}

/** Sends the archive to bin/receive, which switches to it; GNU tar wants a relative path. */
async function upload(): Promise<void> {
  await streamTar('up', ['-czf', '-', '-C', STAGE, '.'], `${remoteDir}/bin/receive`);
  console.log(`Switched ${DEPLOY_HOST}:~/${DEPLOY_DIR} to the new version.`);
}

async function main(): Promise<void> {
  const local = readEnvFile(ENV_FILE);
  if (process.argv.includes('--setup-only')) {
    setup();
    return;
  }
  run('npm', ['run', 'build']);
  checkBuildHasNoPrivateSongs();
  stage();
  if (process.argv.includes('--setup')) setup();
  await upload();
  rmSync(STAGE, { recursive: true, force: true });
  console.log(`Deployed: ${local.PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN ?? 'the site'}`);
}

main().catch((error: unknown) => {
  console.error(`\nDeploy stopped: ${(error as Error).message}`);
  process.exit(1);
});
