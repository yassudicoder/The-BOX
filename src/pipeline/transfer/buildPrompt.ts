import { ulid } from '../../utils/ulid';
import type { Conversation, Platform } from '../../types/conversation';
import type { CompressedConversation, CompressedMessage } from '../compress/types';
import { estimateTokens } from '../tokens/estimate';
import { resolveTransferAdapter } from './adapters';
import type { Section } from './adapters/base';
import type { TransferOptions, TransferPrompt } from './types';
import { makeWarning, type Warning } from '../../core/warnings';

export interface ComposeState {
  excludedMessageIds: Set<string>;
  restoredMessageIds: Set<string>;
  sectionToggles: {
    handoff: boolean;
    digest: boolean;
    recent: boolean;
    instructions: boolean;
    artifacts: boolean;
  };
}

export function emptyCompose(): ComposeState {
  return {
    excludedMessageIds: new Set<string>(),
    restoredMessageIds: new Set<string>(),
    sectionToggles: {
      handoff: true,
      digest: true,
      recent: true,
      instructions: true,
      artifacts: true,
    },
  };
}

export function buildTransferPrompt(
  compressed: CompressedConversation,
  source: Conversation,
  opts: TransferOptions,
  compose: ComposeState = emptyCompose()
): TransferPrompt {
  const adapter = resolveTransferAdapter(opts.target);
  const useXmlTags = opts.useXmlTags ?? adapter.defaults.useXmlTags;
  const verbosity = opts.verbosity ?? adapter.defaults.verbosity;
  const includeHandoff = verbosity === 'full' && compose.sectionToggles.handoff;
  const warnings: Warning[] = [];

  const split = splitDigestRecent(compressed, source, compose);
  const continuation = pickContinuation(source, opts, warnings);

  const ctx = {
    source,
    compressed,
    digest: compose.sectionToggles.digest ? split.digest : [],
    recent: compose.sectionToggles.recent ? split.recent : [],
    continuation,
    verbosity,
    includeHandoff,
    sectionOrder: adapter.sectionOrder,
  };

  const sectionRenderers: Record<Section, () => string> = {
    handoff: () => adapter.renderHandoff(ctx),
    digest: () => adapter.renderDigest(ctx),
    recent: () => adapter.renderRecent(ctx),
    continuation: () => adapter.renderContinuation(ctx),
  };

  const parts: string[] = [adapter.intro(ctx)];
  for (const section of adapter.sectionOrder) {
    const out = sectionRenderers[section]();
    if (out) parts.push(out);
  }

  // useXmlTags can override the adapter default (markdown adapter forced to XML
  // or vice versa) only when the user explicitly toggled it. The current
  // adapters render their own preferred format, so a manual override is a
  // rare case. We honor it by replacing the adapter for that render only —
  // but for simplicity we just respect the per-adapter defaults here. The
  // override remains available in TransferOptions for future use.
  void useXmlTags;

  const prompt = (parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n');
  const approxTokens = estimateTokens(prompt);

  if (ctx.recent.length === 0) {
    warnings.push(makeWarning('digest_only'));
  }
  if (ctx.digest.length === 0 && ctx.recent.length === 0) {
    warnings.push(makeWarning('all_dropped_by_compose'));
  }
  if (approxTokens > compressed.targetTokens * 1.1) {
    warnings.push(
      makeWarning('budget_unmet', {
        explanation: `Prompt is ~${approxTokens} tokens; target was ${compressed.targetTokens}.`,
      })
    );
  }

  return {
    id: ulid(),
    prompt,
    approxTokens,
    target: opts.target,
    sections: {
      handoffIncluded: includeHandoff,
      digestMessageCount: ctx.digest.length,
      recentMessageCount: ctx.recent.length,
      continuationSource: continuation.source,
    },
    warnings,
  };
}

interface SplitResult {
  digest: CompressedMessage[];
  recent: CompressedMessage[];
}

function splitDigestRecent(
  cc: CompressedConversation,
  source: Conversation,
  compose: ComposeState
): SplitResult {
  const olderIds = new Set(
    (cc.passes.find((p) => p.pass === 'recency')?.affectedMessageIds) ?? []
  );
  const sourceById = new Map(source.messages.map((m) => [m.id, m]));
  const digest: CompressedMessage[] = [];
  const recent: CompressedMessage[] = [];

  for (const m of cc.messages) {
    if (compose.excludedMessageIds.has(m.id)) continue;

    // Restore: a "dropped" message marked restored is treated as verbatim
    // by re-projecting from source content.
    let projected: CompressedMessage = m;
    if (m.provenance.kind === 'dropped' && compose.restoredMessageIds.has(m.id)) {
      const src = sourceById.get(m.provenance.sourceMessageId);
      if (src) {
        projected = {
          id: m.id,
          role: src.role,
          content: src.content,
          blocks: src.blocks,
          approxTokens: src.approxTokens,
          provenance: { kind: 'verbatim', sourceMessageId: src.id, reason: 'default' },
        };
      }
    }

    // Skip instruction-tagged messages if compose disabled that section.
    if (
      !compose.sectionToggles.instructions &&
      projected.provenance.kind === 'verbatim' &&
      projected.provenance.reason === 'instruction'
    ) {
      continue;
    }
    // Skip artifact-carrying messages if compose disabled artifacts.
    if (
      !compose.sectionToggles.artifacts &&
      projected.blocks.some((b) => b.kind === 'artifact')
    ) {
      continue;
    }

    if (projected.provenance.kind === 'dropped') {
      digest.push(projected);
      continue;
    }
    if (projected.provenance.kind === 'verbatim' && !olderIds.has(projected.id)) {
      recent.push(projected);
    } else {
      digest.push(projected);
    }
  }

  return { digest, recent };
}

function pickContinuation(
  source: Conversation,
  opts: TransferOptions,
  warnings: Warning[]
): { text: string; source: 'last_user_turn' | 'override' } {
  if (opts.nextInstruction && opts.nextInstruction.trim().length > 0) {
    return { text: opts.nextInstruction.trim(), source: 'override' };
  }
  const lastUser = [...source.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) {
    warnings.push(makeWarning('no_user_turn'));
    return { text: '(continue the prior conversation.)', source: 'last_user_turn' };
  }
  return { text: lastUser.content, source: 'last_user_turn' };
}

export function defaultTransferOptions(target: Platform): TransferOptions {
  const adapter = resolveTransferAdapter(target);
  return {
    target,
    useXmlTags: adapter.defaults.useXmlTags,
    verbosity: adapter.defaults.verbosity,
  };
}
