import React, { useState } from 'react';
import type { CompressedMessage } from '../../pipeline/compress/types';
import type { ProvenanceView } from '../../core/provenance';
import { ArtifactBadge, PassBadge, StatusBadge, TokensBadge } from './Badges';
import { DiffView } from './DiffView';

interface Props {
  message: CompressedMessage;
  view: ProvenanceView;
  excluded: boolean;
  restored: boolean;
  onSetExcluded: (excluded: boolean) => void;
  onSetRestored: (restored: boolean) => void;
}

export const MessageRow = React.memo(function MessageRow(props: Props): JSX.Element {
  const { message, view, excluded, restored } = props;
  const [open, setOpen] = useState(false);

  const isDropped = view.status === 'dropped';
  const hasArtifact = message.blocks.some((b) => b.kind === 'artifact');

  return (
    <li
      className={`rounded border border-neutral-800 p-2 ${
        excluded ? 'opacity-40' : ''
      } ${isDropped ? 'bg-neutral-950' : 'bg-neutral-925'}`}
    >
      <button
        className="flex w-full items-center gap-2 text-left"
        onClick={() => view.expandable && setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {message.role}
        </span>
        <StatusBadge status={view.status} label={view.label} />
        {hasArtifact && <ArtifactBadge />}
        <PassBadge pass={view.attributedPass} />
        <TokensBadge tokens={message.approxTokens} delta={view.tokenDelta} />
      </button>

      <p className="mt-1 text-xs text-neutral-400">{view.explanation}</p>

      {!open && message.content && (
        <p className="mt-1 line-clamp-2 text-xs text-neutral-200">{message.content}</p>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <DiffView original={view.source} compressed={message} />
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={excluded}
                onChange={(e) => props.onSetExcluded(e.target.checked)}
              />
              Exclude from prompt
            </label>
            {isDropped && (
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={restored}
                  onChange={(e) => props.onSetRestored(e.target.checked)}
                />
                Restore verbatim
              </label>
            )}
          </div>
        </div>
      )}
    </li>
  );
});
