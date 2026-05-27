import type { Conversation } from '../types/conversation';

/**
 * Markdown export of the captured conversation. Lossless wrt our canonical
 * Conversation; round-trip readable. Code blocks already have their fences.
 */
export function exportMarkdown(conv: Conversation): string {
  const lines: string[] = [];
  lines.push(`# ${conv.source.title ?? 'Conversation'}`);
  lines.push('');
  lines.push(`- Source: ${conv.source.platform}`);
  if (conv.source.model) lines.push(`- Model: ${conv.source.model}`);
  if (conv.source.url) lines.push(`- URL: ${conv.source.url}`);
  lines.push(`- Captured: ${conv.source.capturedAt}`);
  lines.push(`- Messages: ${conv.stats.messageCount}, ~${conv.stats.approxTokens} tokens`);
  lines.push('');

  for (const m of conv.messages) {
    lines.push(`## ${capitalize(m.role)}`);
    if (m.createdAt) lines.push(`_${m.createdAt}_`);
    lines.push('');
    lines.push(m.content);
    lines.push('');
  }
  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
