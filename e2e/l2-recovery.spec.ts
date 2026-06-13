import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * L2 tail-recovery, end-to-end in a real (layout-capable) browser.
 *
 * happy-dom can't simulate windowed virtualization (no layout, no mount/unmount
 * on scroll), so this is the gate for L2: it loads the synthetic virtualized
 * fixture, runs the REAL extractFromDocument against it, and asserts the whole
 * 120-turn conversation is recovered even though only a slice is ever mounted.
 *
 * Run:  npm run test:e2e   (after: npm install && npx playwright install chromium)
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(resolve(here, 'fixtures', 'virtualized-chatgpt.html'), 'utf8');

// Bundle the real pipeline once for all tests in this file.
async function bundleEntry(): Promise<string> {
  const out = await build({
    entryPoints: [resolve(here, 'entry.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0]!.text;
}

test.describe('L2 windowed-tail recovery', () => {
  test('recovers every turn of a 120-message virtualized conversation', async ({ page }) => {
    const bundle = await bundleEntry();

    // Serve the fixture as if it were ChatGPT so the real adapter resolves
    // (ChatGPTAdapter.matches requires hostname === 'chatgpt.com').
    await page.route('https://chatgpt.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: fixtureHtml })
    );
    await page.goto('https://chatgpt.com/c/e2e-virtualized');

    // Sanity: the fixture really virtualizes — only a slice is mounted at the top.
    const mountedAtTop = await page.locator('[data-message-author-role]').count();
    expect(mountedAtTop).toBeLessThan(120);

    await page.addScriptTag({ content: bundle });

    const result = await page.evaluate(async () => {
      const conv = await window.__continueAI.extractFromDocument({
        maxScrollPasses: 8,
        maxTailRecoverySteps: 40,
        maxTailRecoveryMs: 20_000,
      });
      const last = conv.messages[conv.messages.length - 1];
      return {
        count: conv.stats.messageCount,
        truncated: conv.stats.truncated,
        firstRole: conv.messages[0]?.role,
        lastContent: last?.content ?? '',
        expectedLast: window.__transcript[window.__transcript.length - 1]!.text,
      };
    });

    // Whole conversation recovered, in order, and not flagged incomplete.
    expect(result.count).toBe(120);
    expect(result.firstRole).toBe('user');
    expect(result.lastContent).toContain('Assistant answer number 119');
    expect(result.lastContent).toContain(result.expectedLast.replace(/\.$/, ''));
    expect(result.truncated).toBe(false);
  });
});
