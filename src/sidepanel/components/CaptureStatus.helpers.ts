/**
 * Pure helpers for CaptureStatus presentation. Split from the component so the
 * formatter can be tested without rendering.
 */
import type { SourcePlatform } from '../../types/conversation';

const PLATFORM_LABEL: Record<SourcePlatform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

export function platformLabel(p: SourcePlatform): string {
  return PLATFORM_LABEL[p];
}

export interface CaptureStatusInput {
  platform: SourcePlatform;
  title?: string;
  messageCount: number;
}

/**
 * Returns the user-facing one-line status, e.g.
 *   "Captured from Claude · Explain monads"
 *   "Captured from Claude · 38 messages"   (when there's no title)
 *
 * Title is truncated to keep the line scannable in the narrow side panel.
 */
export function captureStatusText(input: CaptureStatusInput): string {
  const head = `Captured from ${platformLabel(input.platform)}`;
  const tail = input.title?.trim()
    ? truncate(input.title.trim(), 40)
    : `${input.messageCount} message${input.messageCount === 1 ? '' : 's'}`;
  return `${head} · ${tail}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}
