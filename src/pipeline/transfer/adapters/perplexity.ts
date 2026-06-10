import type { TransferTargetAdapter } from './base';
import { createMarkdownTarget } from './markdownTarget';
import { displayName } from './shared';

/**
 * Perplexity (perplexity.ai) — transfer-only target. Perplexity is
 * answer/research oriented, so the intro frames the continuation as the
 * question to pursue rather than an open-ended chat handoff.
 */
export const perplexityAdapter: TransferTargetAdapter = createMarkdownTarget({
  id: 'perplexity',
  intro: (ctx) =>
    `This continues a conversation that began on ${displayName(
      ctx.source.source.platform
    )}. Use the context below to answer the continuation at the end.`,
});
