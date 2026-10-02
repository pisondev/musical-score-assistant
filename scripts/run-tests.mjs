// Starts Vitest from the canonical path of the working directory.
//
// On Windows a terminal may report the drive letter in lowercase ("c:\..."),
// which is common in editor terminals. Vitest then loads its own modules twice
// under two spellings of the same path and every test file fails with
// "Cannot read properties of undefined (reading 'config')". Resolving the real
// path first gives the drive letter its canonical case.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

const root = realpathSync.native(process.cwd());
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');

const result = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
