import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  platform: 'browser',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
};

// On-demand extractor (injected when the user captures).
await build({
  ...common,
  entryPoints: [resolve(root, 'src/content/index.ts')],
  outfile: resolve(root, 'dist/content-script.js'),
});

// Opt-in live context meter (registered only while the meter is enabled).
await build({
  ...common,
  entryPoints: [resolve(root, 'src/content/meter.ts')],
  outfile: resolve(root, 'dist/meter-content.js'),
});
