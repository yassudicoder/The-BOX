import type { RenderContext, Section, TransferTargetAdapter } from './base';
import { attr, deriveTopic, displayName, escapeXml, formatMessage } from './shared';

const SECTION_ORDER: Section[] = ['handoff', 'digest', 'recent', 'continuation'];

export const claudeAdapter: TransferTargetAdapter = {
  id: 'claude',
  displayName: 'Claude',
  defaults: { useXmlTags: true, verbosity: 'full' },
  sectionOrder: SECTION_ORDER,

  intro(ctx) {
    return `You are continuing a conversation that began on ${displayName(ctx.source.source.platform)}.`;
  },

  renderHandoff(ctx) {
    if (!ctx.includeHandoff) return '';
    const s = ctx.source.source;
    const stats = ctx.compressed.stats;
    const topic = deriveTopic(ctx.source);
    return [
      `<handoff platform="${s.platform}" model="${attr(s.model)}" captured_at="${s.capturedAt}">`,
      `  <topic>${escapeXml(topic)}</topic>`,
      `  <compression strategy="${ctx.compressed.strategyId}" original_messages="${stats.originalMessageCount}" kept_verbatim="${stats.keptVerbatimCount}" summarized="${stats.summarizedCount}" dropped="${stats.droppedCount}" />`,
      `</handoff>`,
    ].join('\n');
  },

  renderDigest(ctx) {
    if (ctx.digest.length === 0) return '';
    const note = 'compressed summary of earlier turns — NOT original wording';
    return [`<digest note="${note}">`, ...ctx.digest.map(formatMessage), `</digest>`].join(
      '\n'
    );
  },

  renderRecent(ctx) {
    if (ctx.recent.length === 0) return '';
    const note = 'verbatim from prior conversation';
    return [
      `<recent_exchange note="${note}">`,
      ...ctx.recent.map(formatMessage),
      `</recent_exchange>`,
    ].join('\n');
  },

  renderContinuation(ctx) {
    const note =
      ctx.continuation.source === 'last_user_turn'
        ? 'last user message from the prior conversation, verbatim'
        : 'user-provided continuation instruction';
    return [`<continuation note="${note}">`, ctx.continuation.text, `</continuation>`].join('\n');
  },
};
