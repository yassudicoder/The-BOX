import type { CompressionPass } from '../types';
import { totalTokens } from '../types';
import { estimateTokens } from '../../tokens/estimate';

/**
 * Strip assistant filler from text blocks: opening pleasantries, repeated
 * disclaimers, "Let me know if you have questions" closers.
 *
 * Conservative on purpose. False positives are worse than false negatives:
 * keep a "Certainly!" the user wants over deleting an actual answer.
 */
const FILLER_PATTERNS: RegExp[] = [
  /^(certainly|sure|absolutely|of course|great question|happy to help)[!.,]?\s*/i,
  /^here'?s? (?:a|the|how|what) /i, // lead-ins; only stripped from the very start
];
const CLOSER_PATTERNS: RegExp[] = [
  /\n*let me know if you have (?:any )?(?:more |further )?questions[.!]?\s*$/i,
  /\n*hope (?:this|that) helps[.!]?\s*$/i,
  /\n*feel free to ask if anything is unclear[.!]?\s*$/i,
];

export const boilerplatePass: CompressionPass = (cc) => {
  const before = totalTokens(cc.messages);
  const touched: string[] = [];

  const messages = cc.messages.map((m) => {
    if (m.role !== 'assistant' || m.provenance.kind !== 'verbatim') return m;
    let content = m.content;
    let changed = false;
    for (const p of FILLER_PATTERNS) {
      const next = content.replace(p, '');
      if (next !== content) {
        content = next;
        changed = true;
      }
    }
    for (const p of CLOSER_PATTERNS) {
      const next = content.replace(p, '');
      if (next !== content) {
        content = next;
        changed = true;
      }
    }
    if (!changed) return m;
    touched.push(m.id);
    const trimmed = content.trim();
    return {
      ...m,
      content: trimmed,
      // Re-derive a single text block plus keep non-text blocks. Cheap
      // approximation: only the first/last text block typically holds filler,
      // so we just refresh the whole markdown view and let downstream passes
      // re-parse if needed.
      blocks: refreshBlocks(m.blocks, trimmed),
      approxTokens: estimateTokens(trimmed),
    };
  });

  const after = totalTokens(messages);
  return {
    ...cc,
    messages,
    passes: [
      ...cc.passes,
      {
        pass: 'boilerplate',
        inputTokens: before,
        outputTokens: after,
        affectedMessageIds: touched,
      },
    ],
  };
};

function refreshBlocks(
  original: import('../../../types/conversation').Block[],
  newMarkdown: string
): import('../../../types/conversation').Block[] {
  // Keep non-text blocks (code, artifact, math, image) untouched; replace
  // text blocks with a single regenerated text block. This avoids re-running
  // the markdown block parser for a pure trim.
  const nonText = original.filter((b) => b.kind !== 'text');
  if (newMarkdown.trim().length === 0) return nonText;
  return [{ kind: 'text', markdown: newMarkdown }, ...nonText];
}
