import type { CompressedConversation, CompressedMessage } from '../compress/types';
import type { Platform } from '../../types/conversation';
import type { ComposeState } from '../transfer/buildPrompt';
import { resolveTransferAdapter } from '../transfer/adapters';
import { estimateTokens } from './estimate';

export interface SectionTotals {
  handoff: number;
  digest: number;
  recent: number;
  continuation: number;
  total: number;
}

export interface TokenBudgetView {
  totals: SectionTotals;
  targetTokens: number;
  /** Negative when under budget, positive when over. */
  overflow: number;
  /** 0..1+ — > 1 means over budget. */
  utilization: number;
}

/**
 * Approximate token totals per section so the UI can render a breakdown
 * before the user pastes. Source of truth for the "what costs tokens?"
 * question.
 */
export function computeSectionTotals(
  cc: CompressedConversation,
  compose: ComposeState,
  options: { target: Platform; continuation: string }
): SectionTotals {
  const adapter = resolveTransferAdapter(options.target);
  const olderIds = new Set(
    (cc.passes.find((p) => p.pass === 'recency')?.affectedMessageIds) ?? []
  );

  const digest: CompressedMessage[] = [];
  const recent: CompressedMessage[] = [];
  for (const m of cc.messages) {
    if (compose.excludedMessageIds.has(m.id)) continue;
    if (
      !compose.sectionToggles.instructions &&
      m.provenance.kind === 'verbatim' &&
      m.provenance.reason === 'instruction'
    ) {
      continue;
    }
    if (
      !compose.sectionToggles.artifacts &&
      m.blocks.some((b) => b.kind === 'artifact')
    ) {
      continue;
    }
    if (m.provenance.kind === 'dropped') {
      digest.push(m);
      continue;
    }
    if (m.provenance.kind === 'verbatim' && !olderIds.has(m.id)) {
      recent.push(m);
    } else {
      digest.push(m);
    }
  }

  const handoffTokens = compose.sectionToggles.handoff
    ? estimateTokens(adapter.renderHandoff(stubCtx(cc, [], [], options.continuation, true)))
    : 0;
  const digestTokens = compose.sectionToggles.digest
    ? digest.reduce((s, m) => s + m.approxTokens, 0)
    : 0;
  const recentTokens = compose.sectionToggles.recent
    ? recent.reduce((s, m) => s + m.approxTokens, 0)
    : 0;
  const continuationTokens = estimateTokens(options.continuation);

  const totals: SectionTotals = {
    handoff: handoffTokens,
    digest: digestTokens,
    recent: recentTokens,
    continuation: continuationTokens,
    total: handoffTokens + digestTokens + recentTokens + continuationTokens,
  };
  return totals;
}

export function viewBudget(cc: CompressedConversation, totals: SectionTotals): TokenBudgetView {
  const overflow = totals.total - cc.targetTokens;
  return {
    totals,
    targetTokens: cc.targetTokens,
    overflow,
    utilization: totals.total / Math.max(1, cc.targetTokens),
  };
}

/**
 * Just enough of a RenderContext to let the adapter's renderHandoff produce
 * a representative size estimate. We deliberately keep this private — the
 * full RenderContext is only assembled by buildTransferPrompt.
 */
function stubCtx(
  cc: CompressedConversation,
  digest: CompressedMessage[],
  recent: CompressedMessage[],
  continuationText: string,
  includeHandoff: boolean
) {
  return {
    source: {
      schemaVersion: 1 as const,
      id: cc.sourceConversationId,
      source: {
        platform: 'chatgpt' as const,
        url: '',
        capturedAt: new Date().toISOString(),
      },
      messages: [],
      stats: { messageCount: 0, approxTokens: 0, truncated: false },
    },
    compressed: cc,
    digest,
    recent,
    continuation: { text: continuationText, source: 'last_user_turn' as const },
    verbosity: 'full' as const,
    includeHandoff,
    sectionOrder: undefined,
  };
}
