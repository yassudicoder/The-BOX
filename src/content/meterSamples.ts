import type { RawMessage } from '../types/raw';
import type { SourcePlatform } from '../types/conversation';
import { parseTurnIndex, type MountedMessage } from '../core/context/usage';

/**
 * Pure helpers for the live context-meter content script.
 *
 * Kept side-effect-free (no observer, no chrome.*) so they can be unit-tested in
 * happy-dom. The meter deliberately uses a cheap character-based token estimate
 * here rather than the full gpt-tokenizer — it must stay light enough to run in
 * an injected content script, and the meter is an explicit "~ estimate" anyway.
 * The precise tokenizer is reserved for capture/export.
 */

/** Strip tags from an HTML fragment to recover plain text for counting. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fast character-based token estimate (~4 chars/token), no tokenizer. */
export function approxTokens(text: string): number {
  const t = text.trim();
  return t.length === 0 ? 0 : Math.ceil(t.length / 4);
}

/**
 * Turn the adapter's mounted RawMessages into counted samples for the usage
 * accumulator. Reuses each platform's stable sourceId (so a message keeps
 * counting after it scrolls out) and derives a turn index from it where one
 * exists (Claude), enabling the unmounted-history estimate without scrolling.
 */
export function samplesFromRaw(raw: RawMessage[]): MountedMessage[] {
  return raw.map((m) => {
    const text = stripHtml(m.html);
    const id = m.sourceId ?? `${m.role}:${text.slice(0, 64)}`;
    return { id, tokens: approxTokens(text), turnIndex: parseTurnIndex(m.sourceId) };
  });
}

/**
 * Best-effort detection of a platform's OWN "conversation is too long" warning.
 * Currently only Claude surfaces a hard wall; finding its banner forces the
 * meter to 100% red. The selector/text heuristics are intentionally broad and
 * are validated in the gated real-browser pass (Claude's markup is not stable).
 */
export function detectHardWall(doc: Document, platform: SourcePlatform): boolean {
  if (platform !== 'claude') return false;
  const text = doc.body?.textContent ?? '';
  return /long\s+conversation|reached the maximum length|conversation is too long|hit the maximum length/i.test(
    text
  );
}
