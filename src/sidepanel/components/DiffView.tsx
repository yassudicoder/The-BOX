import React from 'react';
import type { Message } from '../../types/conversation';
import type { CompressedMessage } from '../../pipeline/compress/types';

/**
 * Side-by-side diff is deliberately paragraph-level, not character-level.
 * For conversational content, char-diff is more noise than signal — what
 * matters is "here's what was kept vs the original."
 */
export const DiffView = React.memo(function DiffView({
  original,
  compressed,
}: {
  original: Message | null;
  compressed: CompressedMessage;
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2 rounded border border-neutral-800 bg-neutral-950 p-2 text-xs">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">Original</div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-neutral-300">
          {original ? original.content : '(no source message)'}
        </pre>
        {original && (
          <div className="mt-1 text-[10px] text-neutral-500">~{original.approxTokens} tokens</div>
        )}
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">Compressed</div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-neutral-200">
          {compressed.content || '(empty — dropped)'}
        </pre>
        <div className="mt-1 text-[10px] text-neutral-500">
          ~{compressed.approxTokens} tokens
        </div>
      </div>
    </div>
  );
});
