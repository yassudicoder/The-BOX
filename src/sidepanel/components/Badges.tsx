import React from 'react';
import type { ProvenanceStatus } from '../../core/provenance';

const STYLE: Record<ProvenanceStatus, string> = {
  verbatim: 'border-neutral-700 bg-neutral-900 text-neutral-300',
  instruction: 'border-amber-700 bg-amber-950/60 text-amber-200',
  summarized: 'border-sky-800 bg-sky-950/60 text-sky-200',
  dropped: 'border-rose-900 bg-rose-950/60 text-rose-200',
  synthetic: 'border-neutral-700 bg-neutral-900 text-neutral-400',
};

export const StatusBadge = React.memo(function StatusBadge({
  status,
  label,
}: {
  status: ProvenanceStatus;
  label: string;
}): JSX.Element {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLE[status]}`}
    >
      {label}
    </span>
  );
});

export function ArtifactBadge(): JSX.Element {
  return (
    <span className="rounded border border-violet-800 bg-violet-950/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200">
      Artifact
    </span>
  );
}

export function PassBadge({ pass }: { pass: string | null }): JSX.Element | null {
  if (!pass) return null;
  return (
    <span className="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-[10px] font-mono text-neutral-400">
      {pass}
    </span>
  );
}

export function TokensBadge({
  tokens,
  delta,
}: {
  tokens: number;
  delta: number | null;
}): JSX.Element {
  return (
    <span className="ml-auto text-[10px] tabular-nums text-neutral-400">
      ~{tokens}t{delta !== null && delta !== 0 && (
        <span className={delta < 0 ? 'text-emerald-400' : 'text-rose-400'}>
          {' '}
          ({delta > 0 ? '+' : ''}
          {delta})
        </span>
      )}
    </span>
  );
}
