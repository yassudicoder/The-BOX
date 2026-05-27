import React from 'react';
import type { Warning } from '../../core/warnings';

const STYLE: Record<Warning['severity'], string> = {
  blocker: 'border-rose-800 bg-rose-950/60 text-rose-100',
  warning: 'border-amber-800 bg-amber-950/60 text-amber-100',
  info: 'border-sky-800 bg-sky-950/60 text-sky-100',
};

export function WarningBanner({ warning }: { warning: Warning }): JSX.Element {
  return (
    <div className={`rounded border p-2 text-xs ${STYLE[warning.severity]}`}>
      <div className="font-medium">{warning.title}</div>
      <div className="mt-0.5 text-[11px] opacity-90">{warning.explanation}</div>
      <div className="mt-1 text-[11px] opacity-80">
        <span className="font-medium">Suggested:</span> {warning.recommendedAction}
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
    <div className="flex flex-col gap-1">
      {sorted.map((w) => (
        <WarningBanner key={w.code} warning={w} />
      ))}
    </div>
  );
}
