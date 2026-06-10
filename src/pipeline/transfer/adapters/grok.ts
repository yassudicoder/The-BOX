import type { TransferTargetAdapter } from './base';
import { createMarkdownTarget } from './markdownTarget';

/** Grok (grok.com / x.com) — transfer-only target. Accepts markdown. */
export const grokAdapter: TransferTargetAdapter = createMarkdownTarget({
  id: 'grok',
});
