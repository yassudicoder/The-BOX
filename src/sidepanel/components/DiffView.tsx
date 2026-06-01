import React from 'react';
import type { Message } from '../../types/conversation';
import type { CompressedMessage } from '../../pipeline/compress/types';
import type { ProvenanceView } from '../../core/provenance';

/**
 * Side-by-side diff is deliberately paragraph-level, not character-level.
 * For conversational content, char-diff is more noise than signal — what
 * matters is "here's what was kept vs the original."
 *
 * Inherits the parent surface (no outer card wrapper); each pane stands on a
 * faint inset tint to read as quote-blocks rather than form fields.
 */
export const DiffView = React.memo(function DiffView({
  original,
  compressed,
  view,
}: {
  original: Message | null;
  compressed: CompressedMessage;
  view?: ProvenanceView;
}): JSX.Element {
  const caption = view ? captionFor(view, original, compressed) : null;
  return (
    <div className="space-y-2">
      {caption && <div className="text-[11px] text-neutral-400">{caption}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Pane
          label="Captured"
          tone="muted"
          body={original ? original.content : '(no original)'}
          tokens={original?.approxTokens ?? null}
        />
        <Pane
          label="In prompt"
          tone="bright"
          body={compressed.content || '(set aside — not sent)'}
          tokens={compressed.approxTokens}
        />
      </div>
    </div>
  );
});

function Pane({
  label,
  tone,
  body,
  tokens,
}: {
  label: string;
  tone: 'muted' | 'bright';
  body: string;
  tokens: number | null;
}): JSX.Element {
  return (
    <div className="rounded-md bg-white/[0.03] p-2">
      <div className="mb-1 text-[10.5px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <pre
        className={`max-h-48 overflow-auto whitespace-pre-wrap text-[12px] ${
          tone === 'bright' ? 'text-neutral-200' : 'text-neutral-300'
        }`}
      >
        {body}
      </pre>
      {tokens !== null && (
        <div className="mt-1 text-[10.5px] text-neutral-500">~{tokens} tokens</div>
      )}
    </div>
  );
}

function captionFor(
  view: ProvenanceView,
  original: Message | null,
  compressed: CompressedMessage
): string {
  switch (view.status) {
    case 'verbatim':
    case 'instruction':
      return 'Kept word-for-word';
    case 'dropped':
      return 'Set aside to fit prompt size';
    case 'synthetic':
      return 'Transfer note added';
    case 'summarized':
      if (original) {
        return `Shortened from ~${original.approxTokens} → ~${compressed.approxTokens} tokens`;
      }
      return `Shortened to ~${compressed.approxTokens} tokens`;
  }
}
