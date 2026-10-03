// Runs a Node script with the built-in SQLite module (`node:sqlite`) available, which the
// server keeps its users in.
//
//   node scripts/node-with-sqlite.mjs <script> [arguments…]
//
// Node 22.13 and newer have the module without a flag; Node 22.5 to 22.12 need
// --experimental-sqlite. Either way the warning that the module is experimental is left out.
import { spawnSync } from 'node:child_process';
import { isBuiltin } from 'node:module';
import { pathToFileURL } from 'node:url';

/** The flags that make `node:sqlite` available in a child process, quietly. */
export const SQLITE_FLAGS = [
  ...(isBuiltin('node:sqlite') ? [] : ['--experimental-sqlite']),
  '--disable-warning=ExperimentalWarning',
];

// Run directly, it starts the script; imported, it only lends its flags.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [script, ...args] = process.argv.slice(2);
  if (!script) {
    console.error('Usage: node scripts/node-with-sqlite.mjs <script> [arguments…]');
    process.exit(2);
  }
  const result = spawnSync(process.execPath, [...SQLITE_FLAGS, script, ...args], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}
