import type { Platform } from '../../../types/conversation';
import type { RenderContext, Section, TransferTargetAdapter } from './base';
import type { Verbosity } from '../types';
import { deriveTopic, displayName, formatMessage } from './shared';

/**
 * Factory for markdown-rendered transfer targets.
 *
 * ChatGPT and Gemini are hand-written because they have target-specific
 * quirks (Gemini leads with the continuation). The newer transfer-only
 * targets — DeepSeek, Perplexity, Copilot, Grok, AI Studio — all accept
 * plain markdown headers and share one rendering shape, so they are built
 * from this factory rather than copy-pasted. Each platform file stays an
 * explicit config object; the only thing factored out is the identical
 * markdown body, which keeps us DRY without hiding per-target intent.
 *
 * If real-world testing shows a target wants different phrasing or section
 * order, give it its own hand-written adapter (as Gemini has) — the factory
 * is a convenience, not a constraint.
 */
export interface MarkdownTargetConfig {
  id: Platform;
  /** Optional intro override. Defaults to the standard continuation phrasing. */
  intro?: (ctx: RenderContext) => string;
  defaults?: { useXmlTags: boolean; verbosity: Verbosity };
  sectionOrder?: Section[];
}

const DEFAULT_SECTION_ORDER: Section[] = ['handoff', 'digest', 'recent', 'continuation'];

export function createMarkdownTarget(config: MarkdownTargetConfig): TransferTargetAdapter {
  const name = displayName(config.id);
  return {
    id: config.id,
    displayName: name,
    defaults: config.defaults ?? { useXmlTags: false, verbosity: 'full' },
    sectionOrder: config.sectionOrder ?? DEFAULT_SECTION_ORDER,

    intro:
      config.intro ??
      ((ctx) =>
        `You are continuing a conversation that began on ${displayName(
          ctx.source.source.platform
        )}.`),

    renderHandoff(ctx) {
      if (!ctx.includeHandoff) return '';
      const s = ctx.source.source;
      const stats = ctx.compressed.stats;
      return [
        `## Handoff`,
        `- Platform: ${s.platform}`,
        `- Model: ${s.model ?? 'unknown'}`,
        `- Captured: ${s.capturedAt}`,
        `- Topic: ${deriveTopic(ctx.source)}`,
        `- Compression: ${ctx.compressed.strategyId} — original ${stats.originalMessageCount} msgs, ${stats.keptVerbatimCount} verbatim, ${stats.summarizedCount} summarized, ${stats.droppedCount} dropped`,
      ].join('\n');
    },

    renderDigest(ctx) {
      if (ctx.digest.length === 0) return '';
      const note = 'compressed summary of earlier turns — NOT original wording';
      return [`## Digest (${note})`, ...ctx.digest.map(formatMessage)].join('\n\n');
    },

    renderRecent(ctx) {
      if (ctx.recent.length === 0) return '';
      const note = 'verbatim from prior conversation';
      return [`## Recent exchange (${note})`, ...ctx.recent.map(formatMessage)].join('\n\n');
    },

    renderContinuation(ctx) {
      const note =
        ctx.continuation.source === 'last_user_turn'
          ? 'last user message from the prior conversation, verbatim'
          : 'user-provided continuation instruction';
      return [`## Continuation (${note})`, '', ctx.continuation.text].join('\n');
    },
  };
}
