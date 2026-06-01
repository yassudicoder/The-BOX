import React from 'react';
import type { ProvenanceStatus } from '../../core/provenance';

// Borderless pills. Color tint carries identity; no walls. Red is still
// reserved for genuine alarm (warnings, overflow) — 'dropped' is slate.
const STYLE: Record<ProvenanceStatus, string> = {
  verbatim: 'bg-neutral-500/10 text-neutral-200',
  instruction: 'bg-amber-500/10 text-amber-200',
  summarized: 'bg-sky-500/10 text-sky-200',
  dropped: 'bg-slate-500/10 text-slate-300',
  synthetic: 'bg-neutral-500/10 text-neutral-300',
};

const PILL_BASE =
  'rounded-full px-2 py-0.5 text-[10.5px] font-medium tracking-wide';

export const StatusBadge = React.memo(function StatusBadge({
  status,
  label,
}: {
  status: ProvenanceStatus;
  label: string;
}): JSX.Element {
  return <span className={`${PILL_BASE} ${STYLE[status]}`}>{label}</span>;
});

export function ArtifactBadge(): JSX.Element {
  return (
    <span className={`${PILL_BASE} bg-violet-500/10 text-violet-200`}>
      Artifact
    </span>
  );
}

export function PassBadge({ pass }: { pass: string | null }): JSX.Element | null {
  if (!pass) return null;
  return (
    <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10.5px] text-neutral-400">
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
  // Positive framing for the common case (delta < 0 = compression saved tokens).
  // Subdued neutral; reserved red is only for genuine problems.
  return (
    <span className="ml-auto text-[11px] tabular-nums text-neutral-500">
      ~{tokens}t
      {delta !== null && delta < 0 && (
        <span className="ml-1">· saved ~{-delta}t</span>
      )}
      {delta !== null && delta > 0 && (
        <span className="ml-1">· +{delta}t</span>
      )}
    </span>
  );
}
