import { encode } from 'gpt-tokenizer';

/**
 * Approximate token count. Real tokenizers differ per model (especially
 * Claude's, which is not public). This is an estimate — surface that in
 * the UI rather than implying accuracy.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  try {
    return encode(text).length;
  } catch {
    // Fallback: ~4 chars per token heuristic.
    return Math.ceil(text.length / 4);
  }
}
