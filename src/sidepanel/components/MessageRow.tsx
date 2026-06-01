import React, { useState } from 'react';
import type { CompressedMessage } from '../../pipeline/compress/types';
import type { ProvenanceView } from '../../core/provenance';
import { ArtifactBadge, PassBadge, StatusBadge, TokensBadge } from './Badges';
import { DiffView } from './DiffView';
import { shouldShowPass } from './Timeline.helpers';

interface Props {
  message: CompressedMessage;
  view: ProvenanceView;
  excluded: boolean;
  restored: boolean;
  debug?: boolean;
  onSetExcluded: (excluded: boolean) => void;
  onSetRestored: (restored: boolean) => void;
}

export const MessageRow = React.memo(function MessageRow(props: Props): JSX.Element {
  const { message, view, excluded, restored, debug = false } = props;
  const [open, setOpen] = useState(false);

  const isDropped = view.status === 'dropped';
  const hasArtifact = message.blocks.some((b) => b.kind === 'artifact');

  return (
    <li
      className={`px-2 py-2 transition-colors hover:bg-white/[0.03] ${
        excluded ? 'opacity-40' : ''
      } ${open ? 'bg-white/5' : ''}`}
    >
      <button
        className="flex w-full items-center gap-2 text-left"
        onClick={() => view.expandable && setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-[10.5px] uppercase tracking-wide text-neutral-500">
          {message.role}
        </span>
        <StatusBadge status={view.status} label={view.label} />
        {hasArtifact && <ArtifactBadge />}
        {shouldShowPass(view.attributedPass, debug) && (
          <PassBadge pass={view.attributedPass} />
        )}
        <TokensBadge tokens={message.approxTokens} delta={view.tokenDelta} />
      </button>

      <p className="mt-1 text-[11px] text-neutral-500">{view.explanation}</p>

      {!open && isDropped && (
        <p className="mt-1 text-[12px] italic text-neutral-500">
          Set aside to fit prompt size
        </p>
      )}

      {!open && !isDropped && message.content && (
        <p className="mt-1 line-clamp-2 text-[12px] text-neutral-300">
          {message.content}
        </p>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <DiffView original={view.source} compressed={message} view={view} />
          <div className="flex flex-wrap gap-3 text-[12px] text-neutral-300">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={excluded}
                onChange={(e) => props.onSetExcluded(e.target.checked)}
                className="accent-blue-500"
              />
              Exclude from prompt
            </label>
            {isDropped && (
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={restored}
                  onChange={(e) => props.onSetRestored(e.target.checked)}
                  className="accent-blue-500"
                />
                Restore in full
              </label>
            )}
          </div>
        </div>
      )}
    </li>
  );
});
