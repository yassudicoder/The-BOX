import React from 'react';
import type { SectionTotals, TokenBudgetView } from '../../pipeline/tokens/sections';

interface Props {
  totals: SectionTotals;
  budget: TokenBudgetView;
}

const COLORS = {
  handoff: 'bg-neutral-600',
  digest: 'bg-sky-700',
  recent: 'bg-emerald-700',
  continuation: 'bg-amber-700',
} as const;

/**
 * Stacked horizontal bar showing where the tokens are going + a budget
 * marker. The point is to make "what costs tokens?" answerable at a glance,
 * not to render a perfect pixel-accurate chart.
 */
export function TokenBar({ totals, budget }: Props): JSX.Element {
  const max = Math.max(budget.targetTokens, totals.total);
  const seg = (n: number, color: string) => (
    <div
      className={`h-2 ${color}`}
      style={{ width: `${(n / max) * 100}%` }}
      title={`${n} tokens`}
    />
  );
  const overBudget = budget.overflow > 0;
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-neutral-400">Tokens</span>
        <span className={`tabular-nums ${overBudget ? 'text-rose-300' : 'text-neutral-300'}`}>
          {totals.total.toLocaleString()} / {budget.targetTokens.toLocaleString()}
          {overBudget && (
            <span className="ml-1 text-rose-400">
              (+{budget.overflow.toLocaleString()})
            </span>
          )}
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded bg-neutral-900">
        {seg(totals.handoff, COLORS.handoff)}
        {seg(totals.digest, COLORS.digest)}
        {seg(totals.recent, COLORS.recent)}
        {seg(totals.continuation, COLORS.continuation)}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[10px]">
        <Legend color={COLORS.handoff} label="Handoff" n={totals.handoff} />
        <Legend color={COLORS.digest} label="Digest" n={totals.digest} />
        <Legend color={COLORS.recent} label="Recent" n={totals.recent} />
        <Legend color={COLORS.continuation} label="Continue" n={totals.continuation} />
      </div>
    </div>
  );
}

function Legend({ color, label, n }: { color: string; label: string; n: number }): JSX.Element {
  return (
    <div className="flex items-center gap-1 text-neutral-400">
      <span className={`inline-block h-2 w-2 ${color}`} />
      <span className="flex-1">{label}</span>
      <span className="tabular-nums">{n}</span>
    </div>
  );
}
