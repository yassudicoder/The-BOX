/**
 * Pure helpers for Timeline section rendering.
 *
 * Split out from Timeline.tsx so they're testable as plain functions without
 * pulling React + happy-dom rendering into the test boundary. They produce
 * user-facing strings only — no business logic, no DOM access.
 */
import type { CompressionPassId } from '../../pipeline/compress/types';

export interface DigestSummary {
  count: number;
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
}

export function digestHeaderText(s: DigestSummary): string {
  if (s.count === 0) return '';
  if (s.savedTokens > 0) {
    return `Earlier turns — shortened to ~${s.compressedTokens} tokens (saved ~${s.savedTokens})`;
  }
  return `Earlier turns — ~${s.compressedTokens} tokens`;
}

export function recentHeaderText(count: number): string {
  return count === 0 ? '' : 'Sent in full';
}

/**
 * Whether to render the raw pass-id chip on a message row. Pass IDs are
 * internal vocabulary; default UI hides them and surfaces them only when the
 * debug toggle is on.
 */
export function shouldShowPass(
  pass: CompressionPassId | null,
  debug: boolean
): boolean {
  return debug && pass !== null;
}
