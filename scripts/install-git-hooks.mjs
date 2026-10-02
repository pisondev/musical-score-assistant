// Points git at the versioned hooks in .githooks so every clone enforces them.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('.git')) {
  process.exit(0);
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
  console.warn(
    'Could not configure git hooks; run "git config core.hooksPath .githooks" manually.',
  );
}
