import type { Block, Message } from '../../../types/conversation';
import type { CompressedMessage, CompressionPass, Provenance } from '../types';
import { totalTokens } from '../types';
import { estimateTokens } from '../../tokens/estimate';

/**
 * For messages older than the recency cutoff, replace verbatim content
 * with a structured precis:
 *   - keep all code/artifact blocks if opts.preserveCodeBlocks
 *   - keep first sentence of text blocks ("topic line")
 *   - record dropped block count in provenance
 */
export const saliencePass: CompressionPass = (cc, src, opts) => {
  const before = totalTokens(cc.messages);
  const cutoff = Math.max(0, cc.messages.length - opts.recentTurnsVerbatim);
  const sourceById = new Map(src.messages.map((m) => [m.id, m]));
  const touched: string[] = [];

  const messages: CompressedMessage[] = cc.messages.map((m, i) => {
    if (i >= cutoff) return m;
    if (m.provenance.kind !== 'verbatim') return m;
    // Standing instructions stay verbatim even outside the recency window.
    if (m.provenance.reason === 'instruction') return m;
    const srcMsg = sourceById.get(m.provenance.sourceMessageId);
    if (!srcMsg) return m;

    const precis = buildPrecis(srcMsg, opts.preserveCodeBlocks);
    if (precis.content === srcMsg.content) return m; // no compression possible

    touched.push(m.id);
    const provenance: Provenance = {
      kind: 'summarized',
      sourceMessageId: srcMsg.id,
      summary: precis.summaryLine,
      preservedBlockKinds: precis.blocks.map((b) => b.kind),
      droppedBlockCount: srcMsg.blocks.length - precis.blocks.length,
    };
    return {
      id: m.id,
      role: m.role,
      content: precis.content,
      blocks: precis.blocks,
      approxTokens: estimateTokens(precis.content),
      provenance,
    };
  });

  return {
    ...cc,
    messages,
    passes: [
      ...cc.passes,
      {
        pass: 'salience',
        inputTokens: before,
        outputTokens: totalTokens(messages),
        affectedMessageIds: touched,
      },
    ],
  };
};

function buildPrecis(
  src: Message,
  preserveCodeBlocks: boolean
): { content: string; blocks: Block[]; summaryLine: string } {
  const summaryLine = firstSentence(src.content) || `(${src.role} turn elided)`;
  const preservedBlocks: Block[] = preserveCodeBlocks
    ? src.blocks.filter((b) => b.kind === 'code' || b.kind === 'artifact')
    : [];
  const role = src.role;
  const lines: string[] = [`> ${role}: ${summaryLine}`];
  for (const b of preservedBlocks) {
    if (b.kind === 'code') {
      const lang = b.language ?? '';
      lines.push('', '```' + lang, b.code, '```');
    } else if (b.kind === 'artifact') {
      const lang = b.language ?? '';
      const title = b.title ?? 'artifact';
      // Informational comment only — deliberately NOT the parseable sentinel
      // form, so this can never round-trip back into an artifact block.
      lines.push('', `<!-- preserved artifact: ${title} -->`, '```' + lang, b.content, '```');
    }
  }
  const content = lines.join('\n');
  const textBlock: Block = { kind: 'text', markdown: `> ${role}: ${summaryLine}` };
  return { content, blocks: [textBlock, ...preservedBlocks], summaryLine };
}

function firstSentence(md: string): string {
  // Strip leading fences from consideration; take first non-empty prose line.
  const lines = md
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const line = lines[0] ?? '';
  const m = line.match(/^(.{1,180}?[.!?])(?:\s|$)/);
  return m && m[1] ? m[1] : line.slice(0, 180);
}

