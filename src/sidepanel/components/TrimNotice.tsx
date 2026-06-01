import React, { useMemo } from 'react';
import type { Conversation } from '../../types/conversation';
import type { CompressedConversation } from '../../pipeline/compress/types';
import {
  countBudgetTrims,
  formatBudget,
  nextBudgetTier,
} from './TrimNotice.helpers';

interface Props {
  compressed: CompressedConversation;
  /**
   * The source conversation. Needed because dropped CompressedMessages have
   * near-zero `approxTokens` — the user-meaningful figure is what was
   * removed (i.e. the source token count), not what remains.
   *
   * (Spec deviation: spec listed `compressed`, `currentBudget`,
   * `onIncreaseBudget`. `source` is required to compute meaningful token
   * totals; without it the notice can only display a count.)
   */
  source: Conversation;
  currentBudget: number;
  onIncreaseBudget: () => void;
}

/**
 * Calm presentation of "older turns were trimmed to fit the budget" — a
 * normal outcome of compression, not an error. Renders nothing when no
 * budget-driven drops exist. The user can expand to see why, or click
 * "Increase to <next tier>" to raise the budget and recompute.
 */
export const TrimNotice = React.memo(function TrimNotice({
  compressed,
  source,
  currentBudget,
  onIncreaseBudget,
}: Props): JSX.Element | null {
  const stats = useMemo(
    () => countBudgetTrims(compressed, source),
    [compressed, source]
  );
  const next = nextBudgetTier(currentBudget);

  if (stats.count === 0) return null;

  const noun = stats.count === 1 ? 'older message' : 'older messages';
  const tokens = stats.originalTokens > 0
    ? ` (~${stats.originalTokens.toLocaleString()} tokens)`
    : '';

  return (
    <aside
      role="status"
      className="rounded-md bg-slate-500/10 px-3 py-2.5 text-[12px] text-neutral-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-neutral-200">
            {stats.count} {noun} set aside{tokens}
          </div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
            Target prompt size: {formatBudget(currentBudget)}. Pinned
            instructions and your recent turns are preserved.
          </div>
        </div>
        {next !== null && (
          <button
            type="button"
            onClick={onIncreaseBudget}
            className="shrink-0 rounded-md bg-white/5 px-2.5 py-1 text-[11px] text-neutral-100 transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
          >
            Increase to {formatBudget(next)}
          </button>
        )}
      </div>
      <details className="group mt-1.5">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-100">
          <span
            aria-hidden="true"
            className="inline-block w-3 text-neutral-500 transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          Why was this trimmed?
        </summary>
        <p className="mt-1 pl-4 text-[11px] leading-relaxed text-neutral-400">
          Your conversation is larger than the target prompt size, so the
          oldest turns were set aside to keep the prompt within budget. The
          receiving AI still sees a summary of those turns plus your most
          recent exchange word-for-word.
        </p>
      </details>
    </aside>
  );
});
