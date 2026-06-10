import React from 'react';
import type { Conversation } from '../../types/conversation';
import { captureStatusText, formatCapturedAt } from './CaptureStatus.helpers';

interface Props {
  conv: Conversation;
}

/**
 * One-line identity for the captured conversation, with the capture time on a
 * second muted line. The re-capture affordance lives in the header (next to
 * the title) so the status text gets the full panel width and doesn't compete
 * with a button.
 */
export const CaptureStatus = React.memo(function CaptureStatus({
  conv,
}: Props): JSX.Element {
  const text = captureStatusText({
    platform: conv.source.platform,
    title: conv.source.title,
    messageCount: conv.stats.messageCount,
    model: conv.source.model,
  });
  const captured = formatCapturedAt(conv.source.capturedAt);
  return (
    <div>
      <p className="truncate text-[12px] text-neutral-400" title={text}>
        {text}
      </p>
      {captured && <p className="text-[10px] text-neutral-500">Captured {captured}</p>}
    </div>
  );
});
