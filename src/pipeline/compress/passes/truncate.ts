import type { CompressedMessage, CompressionPass, Provenance } from '../types';
import { totalTokens } from '../types';

/**
 * Enforces the token budget. Drops oldest non-verbatim messages first.
 * Never drops messages inside the recent-verbatim window. If dropping all
 * candidates still exceeds the budget, leaves the budget unmet rather than
 * cutting into recent context — the transfer-prompt builder will warn the
 * user that the conversation could not be fit.
 */
export const truncatePass: CompressionPass = (cc, _src, opts) => {
  const before = totalTokens(cc.messages);
  if (before <= opts.targetTokens) {
    return {
      ...cc,
      passes: [
        ...cc.passes,
        {
          pass: 'truncate',
          inputTokens: before,
          outputTokens: before,
          affectedMessageIds: [],
          notes: 'within budget',
        },
      ],
    };
  }

  const cutoff = Math.max(0, cc.messages.length - opts.recentTurnsVerbatim);
  const dropped: string[] = [];
  const messages: CompressedMessage[] = [...cc.messages];

  // Walk older window oldest → newest, replacing each with a "dropped"
  // marker until we're within budget.
  for (let i = 0; i < cutoff; i++) {
    if (totalTokens(messages) <= opts.targetTokens) break;
    const m = messages[i]!;
    if (m.provenance.kind === 'dropped') continue;
    if (m.provenance.kind === 'verbatim' && m.provenance.reason === 'instruction') continue;
    const sourceMessageId =
      'sourceMessageId' in m.provenance ? m.provenance.sourceMessageId : m.id;
    const provenance: Provenance = {
      kind: 'dropped',
      sourceMessageId,
      reason: 'token budget',
    };
    messages[i] = {
      id: m.id,
      role: m.role,
      content: '',
      blocks: [],
      approxTokens: 0,
      provenance,
    };
    dropped.push(m.id);
  }

  return {
    ...cc,
    messages,
    passes: [
      ...cc.passes,
      {
        pass: 'truncate',
        inputTokens: before,
        outputTokens: totalTokens(messages),
        affectedMessageIds: dropped,
        notes:
          totalTokens(messages) > opts.targetTokens
            ? 'budget unmet — recent window untouched'
            : undefined,
      },
    ],
  };
};
