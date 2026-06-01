/**
 * Provenance is the single source of truth about what happened to a message
 * during compression. Anything the UI displays about a message's status —
 * its badge, its label, its expandability — derives from this module. No
 * React component is allowed to re-infer status from message content.
 */
import type {
  CompressedConversation,
  CompressedMessage,
  CompressionPassId,
  Provenance,
  VerbatimReason,
} from '../../pipeline/compress/types';
import type { Conversation, Message } from '../../types/conversation';

export type ProvenanceStatus =
  | 'verbatim'
  | 'instruction'
  | 'summarized'
  | 'dropped'
  | 'synthetic';

export interface ProvenanceView {
  status: ProvenanceStatus;
  /** Short label shown in the badge. */
  label: string;
  /** Longer one-liner shown in a tooltip / expanded row header. */
  explanation: string;
  /** Which pass produced this provenance, if known. */
  attributedPass: CompressionPassId | null;
  /** Original (uncompressed) message, if we can find it in `source`. */
  source: Message | null;
  /** Source token count if known; otherwise null. */
  originalTokens: number | null;
  /** Delta = compressed - original (negative = saved tokens). */
  tokenDelta: number | null;
  /** Whether the row should be expandable (show diff / restore action). */
  expandable: boolean;
}

export function statusOf(p: Provenance): ProvenanceStatus {
  switch (p.kind) {
    case 'verbatim':
      return p.reason === 'instruction' ? 'instruction' : 'verbatim';
    case 'summarized':
      return 'summarized';
    case 'dropped':
      return 'dropped';
    case 'synthetic':
      return 'synthetic';
  }
}

export function labelOf(status: ProvenanceStatus): string {
  switch (status) {
    case 'verbatim':
      return 'Kept as-is';
    case 'instruction':
      return 'Pinned';
    case 'summarized':
      return 'Shortened';
    case 'dropped':
      return 'Trimmed';
    case 'synthetic':
      return 'Transfer note';
  }
}

export function explanationOf(p: Provenance, reason?: VerbatimReason): string {
  switch (p.kind) {
    case 'verbatim':
      if (p.reason === 'instruction')
        return 'Pinned instruction — kept regardless of position';
      if (p.reason === 'recent') return 'In recent window — kept word-for-word';
      return 'Kept word-for-word';
    case 'summarized':
      return `Shortened; ${p.droppedBlockCount} block(s) removed`;
    case 'dropped':
      return `Set aside — ${p.reason}`;
    case 'synthetic':
      return `Transfer note — ${p.reason}`;
  }
  void reason;
}

export function attributedPassFor(
  m: CompressedMessage,
  cc: CompressedConversation
): CompressionPassId | null {
  // Search passes in reverse — the most recent pass that touched this id wins.
  for (let i = cc.passes.length - 1; i >= 0; i--) {
    const p = cc.passes[i]!;
    if (p.affectedMessageIds.includes(m.id)) return p.pass;
  }
  return null;
}

export function sourceMessageFor(
  m: CompressedMessage,
  source: Conversation
): Message | null {
  if (m.provenance.kind === 'synthetic') return null;
  const id = m.provenance.sourceMessageId;
  return source.messages.find((sm) => sm.id === id) ?? null;
}

export function viewOf(
  m: CompressedMessage,
  source: Conversation,
  cc: CompressedConversation
): ProvenanceView {
  const status = statusOf(m.provenance);
  const src = sourceMessageFor(m, source);
  const originalTokens = src?.approxTokens ?? null;
  const tokenDelta = originalTokens !== null ? m.approxTokens - originalTokens : null;
  const expandable =
    status === 'summarized' || status === 'dropped' || (status === 'verbatim' && !!src);
  return {
    status,
    label: labelOf(status),
    explanation: explanationOf(m.provenance),
    attributedPass: attributedPassFor(m, cc),
    source: src,
    originalTokens,
    tokenDelta,
    expandable,
  };
}

/**
 * Whether a given source message is structurally an artifact-carrier — used
 * by compose UI to render an "artifact" filter that's distinct from "code".
 */
export function carriesArtifact(m: Message | null): boolean {
  return !!m && m.blocks.some((b) => b.kind === 'artifact');
}
