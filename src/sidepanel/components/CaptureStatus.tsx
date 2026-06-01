import React from 'react';
import type { Conversation } from '../../types/conversation';
import { captureStatusText } from './CaptureStatus.helpers';

interface Props {
  conv: Conversation;
}

/**
 * One-line identity for the captured conversation. The re-capture affordance
 * lives in the header (next to the title) so the status text gets the full
 * panel width and doesn't compete with a button.
 */
export const CaptureStatus = React.memo(function CaptureStatus({
  conv,
}: Props): JSX.Element {
  const text = captureStatusText({
    platform: conv.source.platform,
    title: conv.source.title,
    messageCount: conv.stats.messageCount,
  });
  return (
    <p className="truncate text-[12px] text-neutral-400" title={text}>
      {text}
    </p>
  );
});
