import React, { useMemo } from 'react';
import type { Conversation } from '../../types/conversation';
import type { CompressedConversation } from '../../pipeline/compress/types';
import { viewOf } from '../../core/provenance';
import { MessageRow } from './MessageRow';
import { useSidepanel } from '../state/store';
import {
  digestHeaderText,
  recentHeaderText,
  type DigestSummary,
} from './Timeline.helpers';

interface Props {
  source: Conversation;
  compressed: CompressedConversation;
  debug?: boolean;
}

export const Timeline = React.memo(function Timeline({
  source,
  compressed,
  debug = false,
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

  const digestItems = items.filter((it) => it.inDigest);
  const recentItems = items.filter((it) => !it.inDigest);

  const digestSummary: DigestSummary = useMemo(() => {
    let originalTokens = 0;
    let compressedTokens = 0;
    for (const { m, view } of digestItems) {
      compressedTokens += m.approxTokens;
      originalTokens += view.originalTokens ?? m.approxTokens;
    }
    return {
      count: digestItems.length,
      originalTokens,
      compressedTokens,
      savedTokens: Math.max(0, originalTokens - compressedTokens),
    };
  }, [digestItems]);

  return (
    <div className="flex flex-col gap-4">
      {digestItems.length > 0 && (
        <section>
          <SectionHeader title={digestHeaderText(digestSummary)} count={digestItems.length} />
          <ul className="divide-y divide-white/5">
            {digestItems.map(({ m, view }) => (
              <MessageRow
                key={m.id}
                message={m}
                view={view}
                debug={debug}
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
          <SectionHeader title={recentHeaderText(recentItems.length)} count={recentItems.length} />
          <ul className="divide-y divide-white/5">
            {recentItems.map(({ m, view }) => (
              <MessageRow
                key={m.id}
                message={m}
                view={view}
                debug={debug}
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
    <div className="mb-2 flex items-baseline justify-between gap-2 px-2 text-[11px] text-neutral-500">
      <span className="truncate">{title}</span>
      <span className="tabular-nums">{count}</span>
    </div>
  );
}
