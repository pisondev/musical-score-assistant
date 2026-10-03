import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Builds the service worker of the installed app into `sw.js`, next to the page. The worker
 * learns from the build which files to fetch when it is installed (the shell), every file the
 * build has, and a version that changes whenever one of them does.
 */

const WORKER_ENTRY = fileURLToPath(new URL('../src/service-worker/worker.ts', import.meta.url));

/**
 * Files larger than this are fetched the first time they are used, not when the app is
 * installed: the staff-notation engraver alone is several megabytes.
 */
export const SHELL_SIZE_LIMIT = 1024 * 1024;

/** The modules of a song: `song.txt` and `arrangements.json` below the songs folder. */
const SONG_MODULE = /[\\/]songs[\\/].+[\\/](song\.txt|arrangements\.json)(\?|$)/;

/** A file of the build: its name relative to the root of the site, and its size in bytes. */
export interface BuiltFile {
  fileName: string;
  size: number;
  /**
   * True for the chunk of one song: there may be hundreds, so each is kept when it is first
   * opened instead of when the app is installed.
   */
  song?: boolean;
}

/**
 * The files to fetch when the worker is installed, and every file under `assets/`. The page
 * itself is fetched as `./`, the address it is opened at.
 */
export function shellFiles(
  built: BuiltFile[],
  publicFiles: string[],
): { shell: string[]; assets: string[] } {
  const files = built.filter((file) => file.fileName !== 'index.html');
  return {
    shell: [
      './',
      ...files
        .filter((file) => !file.song && file.size <= SHELL_SIZE_LIMIT)
        .map((file) => file.fileName),
      ...publicFiles,
    ],
    assets: files.map((file) => file.fileName).filter((name) => name.startsWith('assets/')),
  };
}

/**
 * The files at the top of `public/`: the icon of the page and the manifest. The PNG icons in
 * `icons/` are fetched by the system when the app is installed, and the samples are kept by
 * the worker itself.
 */
function publicShell(publicDir: string): string[] {
  if (!publicDir || !existsSync(publicDir)) return [];
  return readdirSync(publicDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
}

export function serviceWorkerPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    async generateBundle(_options, bundle) {
      const version = createHash('sha256');
      const built: BuiltFile[] = [];
      for (const item of Object.values(bundle).sort((a, b) =>
        a.fileName.localeCompare(b.fileName),
      )) {
        const content = item.type === 'chunk' ? item.code : item.source;
        version.update(item.fileName).update(content);
        built.push({
          fileName: item.fileName,
          size: typeof content === 'string' ? Buffer.byteLength(content) : content.byteLength,
          song: item.type === 'chunk' && SONG_MODULE.test(item.facadeModuleId ?? ''),
        });
      }
      const publicFiles = publicShell(config.publicDir);
      for (const file of publicFiles) {
        version.update(file).update(readFileSync(join(config.publicDir, file)));
      }

      const { shell, assets } = shellFiles(built, publicFiles);
      const result = await build({
        entryPoints: [WORKER_ENTRY],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2022',
        minify: true,
        define: {
          BUILD: JSON.stringify({ version: version.digest('hex').slice(0, 16), shell, assets }),
        },
      });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: result.outputFiles[0].text });
    },
  };
}
