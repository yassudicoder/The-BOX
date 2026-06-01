import React from 'react';
import type { Warning } from '../../core/warnings';

// Left-stripe accent + subtle tint replaces the heavy bordered card; red still
// signals real alarm, but no longer fills an entire box.
const STRIPE: Record<Warning['severity'], string> = {
  blocker: 'border-rose-500 bg-rose-500/5',
  warning: 'border-amber-500 bg-amber-500/5',
  info: 'border-sky-500 bg-sky-500/5',
};

const TITLE_TONE: Record<Warning['severity'], string> = {
  blocker: 'text-rose-200',
  warning: 'text-amber-200',
  info: 'text-sky-200',
};

export function WarningBanner({ warning }: { warning: Warning }): JSX.Element {
  return (
    <div
      role="alert"
      className={`rounded-r-md border-l-2 px-3 py-2 ${STRIPE[warning.severity]}`}
    >
      <div className={`text-[12px] font-medium ${TITLE_TONE[warning.severity]}`}>
        {warning.title}
      </div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-neutral-300/90">
        {warning.explanation}
      </div>
      <div className="mt-1 text-[11px] text-neutral-400">
        {warning.recommendedAction}
      </div>
    </div>
  );
}

export function WarningStack({ warnings }: { warnings: Warning[] }): JSX.Element | null {
  if (warnings.length === 0) return null;
  // Sort by severity: blockers first.
  const order: Warning['severity'][] = ['blocker', 'warning', 'info'];
  const sorted = [...warnings].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)
  );
  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((w) => (
        <WarningBanner key={w.code} warning={w} />
      ))}
    </div>
  );
}
