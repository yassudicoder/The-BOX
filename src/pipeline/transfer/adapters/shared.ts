import type { CompressedMessage } from '../../compress/types';
import type { Conversation } from '../../../types/conversation';

export function formatMessage(m: CompressedMessage): string {
  const tag = roleTag(m.role);
  if (m.provenance.kind === 'dropped') {
    return `**${tag}**: _(dropped — ${m.provenance.reason})_`;
  }
  if (m.provenance.kind === 'summarized') {
    return `**${tag}** _(summarized)_:\n${m.content}`;
  }
  if (m.provenance.kind === 'verbatim' && m.provenance.reason === 'instruction') {
    return `**${tag}** _(standing instruction)_:\n${m.content}`;
  }
  return `**${tag}**:\n${m.content}`;
}

export function roleTag(role: string): string {
  switch (role) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    case 'tool':
      return 'Tool';
    default:
      return role;
  }
}

export function deriveTopic(conv: Conversation): string {
  const firstUser = conv.messages.find((m) => m.role === 'user');
  if (!firstUser) return conv.source.title ?? 'untitled conversation';
  const line =
    firstUser.content
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith('```')) ?? '';
  return line.length > 120 ? line.slice(0, 117) + '...' : line;
}

export function displayName(platform: string): string {
  switch (platform) {
    case 'chatgpt':
      return 'ChatGPT';
    case 'claude':
      return 'Claude';
    case 'gemini':
      return 'Gemini';
    case 'deepseek':
      return 'DeepSeek';
    case 'perplexity':
      return 'Perplexity';
    case 'copilot':
      return 'Copilot';
    case 'grok':
      return 'Grok';
    case 'aistudio':
      return 'Google AI Studio';
    default:
      return platform;
  }
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function attr(v: string | undefined): string {
  return escapeXml(v ?? 'unknown');
}
