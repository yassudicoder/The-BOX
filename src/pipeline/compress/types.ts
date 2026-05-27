import type { Block, BlockKind, Conversation, Message, Role } from '../../types/conversation';

export type CompressionStrategyId = 'structural' | 'llm-summary';
export type CompressionPassId =
  | 'boilerplate'
  | 'dedup'
  | 'recency'
  | 'instructions'
  | 'assistantRules'
  | 'salience'
  | 'truncate';

/**
 * Provenance: how a message in the compressed output relates to the source.
 * Compression is non-destructive — every output message points back at a
 * source message id and explains what happened to it. The UI uses this for
 * the "what was dropped" preview; the formatter uses it to decide rendering.
 */
export type VerbatimReason = 'default' | 'recent' | 'instruction';

export type Provenance =
  | { kind: 'verbatim'; sourceMessageId: string; reason?: VerbatimReason }
  | {
      kind: 'summarized';
      sourceMessageId: string;
      summary: string;
      preservedBlockKinds: BlockKind[];
      droppedBlockCount: number;
    }
  | { kind: 'dropped'; sourceMessageId: string; reason: string }
  | {
      /** Synthetic message (system marker, redaction notice, etc.). */
      kind: 'synthetic';
      reason: string;
    };

export interface CompressedMessage {
  /** Output id. Distinct from sourceMessageId. */
  id: string;
  role: Role;
  /** Markdown the formatter will emit for this slot. May be empty for 'dropped'. */
  content: string;
  /** Block-level view of `content`. Empty for 'dropped'. */
  blocks: Block[];
  approxTokens: number;
  provenance: Provenance;
}

export interface CompressionPassRecord {
  pass: CompressionPassId;
  inputTokens: number;
  outputTokens: number;
  affectedMessageIds: string[];
  notes?: string;
}

export interface CompressionStats {
  originalMessageCount: number;
  keptVerbatimCount: number;
  summarizedCount: number;
  droppedCount: number;
  syntheticCount: number;
  originalTokens: number;
  compressedTokens: number;
}

export interface CompressedConversation {
  schemaVersion: 1;
  id: string;
  sourceConversationId: string;
  strategyId: CompressionStrategyId;
  createdAt: string;
  targetTokens: number;
  messages: CompressedMessage[];
  stats: CompressionStats;
  passes: CompressionPassRecord[];
}

export interface CompressionOptions {
  targetTokens: number;
  /** How many trailing turns to keep verbatim. */
  recentTurnsVerbatim: number;
  /** When true, preserve all code/artifact blocks even in summarized turns. */
  preserveCodeBlocks: boolean;
}

/**
 * A pass takes an in-flight CompressedConversation and returns a new one.
 * MUST be pure, synchronous, deterministic. No I/O, no LLM calls. Async
 * passes are out of scope for the local-only MVP — keeping the contract
 * synchronous is what makes the "no backend" trust story honest.
 */
export type CompressionPass = (
  cc: CompressedConversation,
  source: Conversation,
  opts: CompressionOptions
) => CompressedConversation;

export interface CompressionStrategy {
  id: CompressionStrategyId;
  compress(conv: Conversation, opts: CompressionOptions): CompressedConversation;
}

export const COMPRESSION_SCHEMA_VERSION = 1 as const;

export function recomputeStats(
  cc: CompressedConversation,
  original: Conversation
): CompressionStats {
  let kept = 0;
  let summarized = 0;
  let dropped = 0;
  let synthetic = 0;
  for (const m of cc.messages) {
    switch (m.provenance.kind) {
      case 'verbatim':
        kept++;
        break;
      case 'summarized':
        summarized++;
        break;
      case 'dropped':
        dropped++;
        break;
      case 'synthetic':
        synthetic++;
        break;
    }
  }
  const compressedTokens = cc.messages.reduce((s, m) => s + m.approxTokens, 0);
  return {
    originalMessageCount: original.stats.messageCount,
    keptVerbatimCount: kept,
    summarizedCount: summarized,
    droppedCount: dropped,
    syntheticCount: synthetic,
    originalTokens: original.stats.approxTokens,
    compressedTokens,
  };
}

export function totalTokens(messages: CompressedMessage[]): number {
  return messages.reduce((s, m) => s + m.approxTokens, 0);
}

export function isVerbatim(m: CompressedMessage): boolean {
  return m.provenance.kind === 'verbatim';
}

export function nonVerbatim(m: CompressedMessage): boolean {
  return m.provenance.kind !== 'verbatim';
}

export function messageFromSource(src: Message, idGen: () => string): CompressedMessage {
  return {
    id: idGen(),
    role: src.role,
    content: src.content,
    blocks: src.blocks,
    approxTokens: src.approxTokens,
    provenance: { kind: 'verbatim', sourceMessageId: src.id },
  };
}
