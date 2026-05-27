import { ulid } from '../../utils/ulid';
import type { Conversation } from '../../types/conversation';
import {
  COMPRESSION_SCHEMA_VERSION,
  messageFromSource,
  recomputeStats,
  type CompressedConversation,
  type CompressionOptions,
  type CompressionStrategy,
} from './types';
import { assistantRulesPass } from './passes/assistantRules';
import { boilerplatePass } from './passes/boilerplate';
import { instructionPass } from './passes/instructions';
import { recencyPass } from './passes/recency';
import { saliencePass } from './passes/salience';
import { truncatePass } from './passes/truncate';

/**
 * Deterministic, synchronous, local-only compression.
 *
 * Pass order matters:
 *   1. boilerplate — cheap removal of filler before anyone budgets
 *   2. recency    — mark the verbatim window
 *   3. salience   — précis everything outside the window
 *   4. truncate   — last-resort drops to hit token budget
 *
 * Each pass returns a new CompressedConversation; nothing mutates. The
 * passes[] history is the audit trail the side-panel debug view renders.
 */
export const structuralStrategy: CompressionStrategy = {
  id: 'structural',
  compress(conv: Conversation, opts: CompressionOptions): CompressedConversation {
    const initial: CompressedConversation = {
      schemaVersion: COMPRESSION_SCHEMA_VERSION,
      id: ulid(),
      sourceConversationId: conv.id,
      strategyId: 'structural',
      createdAt: new Date().toISOString(),
      targetTokens: opts.targetTokens,
      messages: conv.messages.map((m) => messageFromSource(m, ulid)),
      passes: [],
      stats: {
        originalMessageCount: conv.stats.messageCount,
        keptVerbatimCount: conv.stats.messageCount,
        summarizedCount: 0,
        droppedCount: 0,
        syntheticCount: 0,
        originalTokens: conv.stats.approxTokens,
        compressedTokens: conv.stats.approxTokens,
      },
    };

    // Order: cheap removals → mark recency → flag user instructions →
    // preserve assistant rules that were user-confirmed → précis older →
    // enforce budget. Both instruction passes run before salience so they
    // can veto compression.
    const passes = [
      boilerplatePass,
      recencyPass,
      instructionPass,
      assistantRulesPass,
      saliencePass,
      truncatePass,
    ];
    let cc = initial;
    for (const pass of passes) {
      cc = pass(cc, conv, opts);
    }
    return { ...cc, stats: recomputeStats(cc, conv) };
  },
};
