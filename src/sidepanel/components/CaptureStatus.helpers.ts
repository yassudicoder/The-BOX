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
  /** Specific model version, when the adapter could read it. */
  model?: string;
}

/**
 * Returns the user-facing one-line status, e.g.
 *   "Captured from Claude · Explain monads"
 *   "Captured from Claude (claude-opus-4) · Explain monads"
 *   "Captured from Claude · 38 messages"   (when there's no title)
 *
 * The model version, when known, sits in parentheses right after the platform
 * so it never competes with the title for the truncation budget. Title is
 * truncated to keep the line scannable in the narrow side panel.
 */
export function captureStatusText(input: CaptureStatusInput): string {
  const model = input.model?.trim();
  const head = `Captured from ${platformLabel(input.platform)}${model ? ` (${model})` : ''}`;
  const tail = input.title?.trim()
    ? truncate(input.title.trim(), 40)
    : `${input.messageCount} message${input.messageCount === 1 ? '' : 's'}`;
  return `${head} · ${tail}`;
}

/**
 * Human-readable capture time for display. Returns '' for an unparseable
 * value rather than guessing, so the caller can omit it cleanly.
 */
export function formatCapturedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}
