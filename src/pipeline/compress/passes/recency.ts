import type { CompressionPass } from '../types';
import { totalTokens } from '../types';

/**
 * Marks the last `recentTurnsVerbatim` messages as verbatim (already the
 * default for non-touched messages). Annotates older verbatim messages with
 * a "candidate for summarization" hint by leaving them verbatim — the
 * salience pass picks them up. This pass exists mainly to record the cutoff
 * in the pass history so the UI can show "last K turns kept verbatim".
 *
 * It is a no-op on `messages` content; only `passes` is updated.
 */
export const recencyPass: CompressionPass = (cc, _src, opts) => {
  const total = cc.messages.length;
  const cutoff = Math.max(0, total - opts.recentTurnsVerbatim);
  const tokens = totalTokens(cc.messages);
  const olderIds = cc.messages.slice(0, cutoff).map((m) => m.id);
  return {
    ...cc,
    passes: [
      ...cc.passes,
      {
        pass: 'recency',
        inputTokens: tokens,
        outputTokens: tokens,
        affectedMessageIds: olderIds,
        notes: `keepLast=${opts.recentTurnsVerbatim}, candidates=${olderIds.length}`,
      },
    ],
  };
};
