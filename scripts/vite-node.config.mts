import { defineConfig } from 'vite';

/**
 * Minimal Vite config for running standalone scripts with vite-node.
 *
 * The project's main vite.config.ts pulls in @crxjs/vite-plugin, which only
 * works inside a real extension build and throws when vite-node loads it. This
 * plugin-free config lets scripts/*.mts import the TypeScript source directly.
 */
export default defineConfig({});
