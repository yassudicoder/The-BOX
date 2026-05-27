import React, { useMemo } from 'react';
import type { Conversation } from '../../types/conversation';
import type { CompressedConversation } from '../../pipeline/compress/types';
import { viewOf } from '../../core/provenance';
import { MessageRow } from './MessageRow';
import { useSidepanel } from '../state/store';

interface Props {
  source: Conversation;
  compressed: CompressedConversation;
}

export const Timeline = React.memo(function Timeline({
  source,
  compressed,
}: Props): JSX.Element {
  const compose = useSidepanel((s) => s.compose);
  const setExcluded = useSidepanel((s) => s.setMessageExcluded);
  const setRestored = useSidepanel((s) => s.setMessageRestored);

  const olderIds = useMemo(
    () => new Set((compressed.passes.find((p) => p.pass === 'recency')?.affectedMessageIds) ?? []),
    [compressed]
  );

  const items = useMemo(
    () =>
      compressed.messages.map((m) => ({
        m,
        view: viewOf(m, source, compressed),
        inDigest: olderIds.has(m.id) || m.provenance.kind !== 'verbatim',
      })),
    [compressed, source, olderIds]
  );

  // Group into a digest header + recent header. The digest header is what the
  // user sees when scanning: "earlier conversation compressed into digest."
  const digestItems = items.filter((it) => it.inDigest);
  const recentItems = items.filter((it) => !it.inDigest);

  return (
    <div className="flex flex-col gap-3">
      {digestItems.length > 0 && (
        <section>
          <SectionHeader title="Earlier conversation compressed into digest" count={digestItems.length} />
          <ul className="flex flex-col gap-1">
            {digestItems.map(({ m, view }) => (
              <MessageRow
                key={m.id}
                message={m}
                view={view}
                excluded={compose.excludedMessageIds.has(m.id)}
                restored={compose.restoredMessageIds.has(m.id)}
                onSetExcluded={(v) => setExcluded(m.id, v)}
                onSetRestored={(v) => setRestored(m.id, v)}
              />
            ))}
          </ul>
        </section>
      )}
      {recentItems.length > 0 && (
        <section>
          <SectionHeader title="Recent exchange (verbatim)" count={recentItems.length} />
          <ul className="flex flex-col gap-1">
            {recentItems.map(({ m, view }) => (
              <MessageRow
                key={m.id}
                message={m}
                view={view}
                excluded={compose.excludedMessageIds.has(m.id)}
                restored={compose.restoredMessageIds.has(m.id)}
                onSetExcluded={(v) => setExcluded(m.id, v)}
                onSetRestored={(v) => setRestored(m.id, v)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
});

function SectionHeader({ title, count }: { title: string; count: number }): JSX.Element {
  return (
    <div className="mb-1 flex items-baseline justify-between border-b border-neutral-800 pb-1 text-[10px] uppercase tracking-wide text-neutral-500">
      <span>{title}</span>
      <span className="tabular-nums">{count}</span>
    </div>
  );
}
