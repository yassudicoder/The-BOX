/**
 * Pure helpers for TrimNotice. Tier ladder, budget formatting, and trim
 * counting live here so they're testable without rendering and re-usable
 * if other surfaces need the same ladder or count later.
 */
import type { CompressedConversation } from '../../pipeline/compress/types';
import type { Conversation } from '../../types/conversation';

export const BUDGET_TIERS = [8_000, 16_000, 32_000, 64_000, 128_000] as const;
/**
 * Largest tier on the ladder. Declared as a literal (not derived from
 * BUDGET_TIERS' last element) so the type is `number`, not `number |
 * undefined` under noUncheckedIndexedAccess.
 */
export const BUDGET_CEILING = 128_000;

/**
 * Smallest tier strictly larger than `current`. Returns null when `current`
 * is at or above the ceiling, signaling "no suggestion."
 */
export function nextBudgetTier(current: number): number | null {
  return BUDGET_TIERS.find((t) => t > current) ?? null;
}

/**
 * "32K" for 32_000, "128K" for 128_000, "500" for sub-thousand values.
 * Used in the increase-button label so the action reads as a step on a
 * familiar ladder rather than a raw number.
 */
export function formatBudget(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

/** Marker for which `dropped` provenance reasons indicate budget-driven trims.
 *  The compression pipeline currently emits exactly this string from the
 *  `truncate` pass; matching by exact value avoids false positives if other
 *  drop reasons are introduced later. */
export const BUDGET_DROP_REASON = 'token budget';

export interface TrimStats {
  count: number;
  originalTokens: number;
}

/**
 * Counts messages dropped by the budget-driven trim pass and sums their
 * pre-compression token count by looking up source messages by id.
 *
 * Pure: depends only on its arguments. The `source` lookup is necessary
 * because a dropped `CompressedMessage` has near-zero `approxTokens` —
 * the user-meaningful figure is what was removed, not what remains.
 */
export function countBudgetTrims(
  compressed: CompressedConversation,
  source: Conversation
): TrimStats {
  const sourceById = new Map(source.messages.map((m) => [m.id, m]));
  let count = 0;
  let originalTokens = 0;
  for (const m of compressed.messages) {
    if (
      m.provenance.kind === 'dropped' &&
      m.provenance.reason === BUDGET_DROP_REASON
    ) {
      count += 1;
      const src = sourceById.get(m.provenance.sourceMessageId);
      originalTokens += src?.approxTokens ?? 0;
    }
  }
  return { count, originalTokens };
}
