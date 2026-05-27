import type { RenderContext, Section, TransferTargetAdapter } from './base';
import { deriveTopic, displayName, formatMessage } from './shared';

/**
 * Gemini does not yet have an extraction adapter — only a transfer-target
 * adapter. Empirically Gemini handles markdown headers well; XML tags are
 * tolerated but not preferred. Section order leads with the continuation
 * statement, since that's the framing Gemini seems to anchor to most
 * reliably; rationale, not religion — happy to swap if real-world testing
 * disagrees.
 */
const SECTION_ORDER: Section[] = ['continuation', 'handoff', 'digest', 'recent'];

export const geminiAdapter: TransferTargetAdapter = {
  id: 'gemini',
  displayName: 'Gemini',
  defaults: { useXmlTags: false, verbosity: 'full' },
  sectionOrder: SECTION_ORDER,

  intro(ctx) {
    return `You are continuing a conversation that began on ${displayName(ctx.source.source.platform)}. The next thing to do is described below; supporting context follows.`;
  },

  renderHandoff(ctx) {
    if (!ctx.includeHandoff) return '';
    const s = ctx.source.source;
    const stats = ctx.compressed.stats;
    return [
      `## Context metadata`,
      `Origin: ${s.platform}${s.model ? ` (${s.model})` : ''}`,
      `Captured: ${s.capturedAt}`,
      `Topic: ${deriveTopic(ctx.source)}`,
      `Compression: ${stats.keptVerbatimCount}/${stats.originalMessageCount} verbatim, ${stats.summarizedCount} summarized, ${stats.droppedCount} dropped`,
    ].join('\n');
  },

  renderDigest(ctx) {
    if (ctx.digest.length === 0) return '';
    return [
      `## Earlier conversation (compressed — these are summaries, NOT the user's exact words)`,
      ...ctx.digest.map(formatMessage),
    ].join('\n\n');
  },

  renderRecent(ctx) {
    if (ctx.recent.length === 0) return '';
    return [`## Most recent exchange (verbatim)`, ...ctx.recent.map(formatMessage)].join('\n\n');
  },

  renderContinuation(ctx) {
    const heading =
      ctx.continuation.source === 'last_user_turn'
        ? `## Your task (continuing the user's last message)`
        : `## Your task`;
    return [heading, '', ctx.continuation.text].join('\n');
  },
};
