import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the gated L2 (tail-recovery) browser tests.
 *
 * These live in e2e/ — deliberately OUTSIDE tests/ and the main tsconfig
 * `include`, so the uninstalled @playwright/test import never breaks
 * `tsc --noEmit` / the production build. They are NOT part of `npm test`
 * (vitest); run them explicitly with `npm run test:e2e` after installing
 * Playwright browsers.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
