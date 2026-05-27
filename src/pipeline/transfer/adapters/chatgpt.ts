import type { RenderContext, Section, TransferTargetAdapter } from './base';
import { deriveTopic, displayName, formatMessage } from './shared';

const SECTION_ORDER: Section[] = ['handoff', 'digest', 'recent', 'continuation'];

export const chatgptAdapter: TransferTargetAdapter = {
  id: 'chatgpt',
  displayName: 'ChatGPT',
  defaults: { useXmlTags: false, verbosity: 'full' },
  sectionOrder: SECTION_ORDER,

  intro(ctx) {
    return `You are continuing a conversation that began on ${displayName(ctx.source.source.platform)}.`;
  },

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
