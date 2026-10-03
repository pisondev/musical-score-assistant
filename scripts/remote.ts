import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * What the deploy and notes scripts share: where the server is, and running
 * commands there over SSH. The host is an alias of the SSH configuration
 * (`vps-hestia`), so the key and the user come from there. Run the scripts
 * from Git Bash or the MSYS2 terminal, whose `ssh` reads that configuration.
 */

export const DEPLOY_HOST = process.env.DEPLOY_HOST ?? 'vps-hestia';
/** The folder of the app on the server, below the home of the SSH user. */
export const DEPLOY_DIR = process.env.DEPLOY_DIR ?? 'projects/musical-score-assistant';

/** Runs a command here and stops the script when it fails. */
export function run(command: string, args: string[], options: { cwd?: string } = {}): void {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: options.cwd,
    // npm is a batch file on Windows and needs a shell.
    shell: process.platform === 'win32' && command === 'npm',
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed.`);
}

/** Runs a shell script on the server, with `input` on its standard input. Returns its output. */
export function remote(script: string, input?: string | Buffer): string {
  const result = spawnSync('ssh', ['-o', 'BatchMode=yes', DEPLOY_HOST, script], {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  if (result.status !== 0) throw new Error(`The command on ${DEPLOY_HOST} failed.`);
  return result.stdout;
}

/**
 * Streams a tar archive between this computer and the server: `tar` here
 * creates or extracts, the script on the server does the other half.
 * `direction` "up" sends the local archive, "down" receives one.
 */
export function streamTar(
  direction: 'up' | 'down',
  tarArgs: string[],
  script: string,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const tar = spawn('tar', tarArgs, {
      stdio: direction === 'up' ? ['ignore', 'pipe', 'inherit'] : ['pipe', 'ignore', 'inherit'],
    });
    const ssh = spawn('ssh', ['-o', 'BatchMode=yes', DEPLOY_HOST, script], {
      stdio: direction === 'up' ? ['pipe', 'inherit', 'inherit'] : ['ignore', 'pipe', 'inherit'],
    });
    if (direction === 'up') tar.stdout!.pipe(ssh.stdin!);
    else ssh.stdout!.pipe(tar.stdin!);

    let open = 2;
    const finish = (name: string) => (code: number | null) => {
      if (code !== 0) reject(new Error(`${name} ended with code ${code}.`));
      else if (--open === 0) resolvePromise();
    };
    tar.on('close', finish('tar'));
    ssh.on('close', finish('ssh'));
    tar.on('error', reject);
    ssh.on('error', reject);
  });
}

/** The variables of a `.env` file; missing file, missing values. */
export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}
