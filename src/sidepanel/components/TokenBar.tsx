import React from 'react';
import type { SectionTotals, TokenBudgetView } from '../../pipeline/tokens/sections';

interface Props {
  totals: SectionTotals;
  budget: TokenBudgetView;
  /** Hide the 4-segment legend grid for the above-the-fold primary view. */
  compact?: boolean;
}

const COLORS = {
  handoff: 'bg-neutral-500',
  digest: 'bg-sky-500',
  recent: 'bg-emerald-500',
  continuation: 'bg-amber-500',
} as const;

const SECTION_LABELS = {
  handoff: 'Context',
  digest: 'Summary',
  recent: 'Recent',
  continuation: 'Next',
} as const;

/**
 * Stacked horizontal bar showing where the tokens are going + a budget
 * marker. The point is to make "what costs tokens?" answerable at a glance,
 * not to render a perfect pixel-accurate chart.
 *
 * Compact mode (default for above-the-fold use) inherits the parent surface
 * — no card wrapper — and skips the per-segment legend.
 */
export function TokenBar({ totals, budget, compact = false }: Props): JSX.Element {
  const max = Math.max(budget.targetTokens, totals.total);
  const seg = (n: number, color: string, label: string) => (
    <div
      className={`h-1.5 ${color}`}
      style={{ width: `${(n / max) * 100}%` }}
      title={`${label}: ${n} tokens`}
    />
  );
  const overBudget = budget.overflow > 0;
  const Body = (
    <>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12px] text-neutral-400">Prompt size</span>
        <span
          className={`text-[12px] tabular-nums ${
            overBudget ? 'text-rose-300' : 'text-neutral-200'
          }`}
        >
          {totals.total.toLocaleString()} / {budget.targetTokens.toLocaleString()}
          {overBudget && (
            <span className="ml-1 text-rose-300/80">
              (over by {budget.overflow.toLocaleString()})
            </span>
          )}
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        {seg(totals.handoff, COLORS.handoff, SECTION_LABELS.handoff)}
        {seg(totals.digest, COLORS.digest, SECTION_LABELS.digest)}
        {seg(totals.recent, COLORS.recent, SECTION_LABELS.recent)}
        {seg(totals.continuation, COLORS.continuation, SECTION_LABELS.continuation)}
      </div>
      {!compact && (
        <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
          <Legend color={COLORS.handoff} label={SECTION_LABELS.handoff} n={totals.handoff} />
          <Legend color={COLORS.digest} label={SECTION_LABELS.digest} n={totals.digest} />
          <Legend color={COLORS.recent} label={SECTION_LABELS.recent} n={totals.recent} />
          <Legend color={COLORS.continuation} label={SECTION_LABELS.continuation} n={totals.continuation} />
        </div>
      )}
    </>
  );

  if (compact) return <div>{Body}</div>;
  return <div className="rounded-md bg-neutral-900/30 p-3">{Body}</div>;
}

function Legend({ color, label, n }: { color: string; label: string; n: number }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 text-neutral-400">
      <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />
      <span className="flex-1">{label}</span>
      <span className="tabular-nums">{n}</span>
    </div>
  );
}
