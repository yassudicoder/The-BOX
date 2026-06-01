import type { Adapter } from './Adapter';
import { ChatGPTAdapter } from '../chatgpt/ChatGPTAdapter';
import { ClaudeAdapter } from '../claude/ClaudeAdapter';
import { GeminiAdapter } from '../gemini/GeminiAdapter';

const adapters: Adapter[] = [new ChatGPTAdapter(), new ClaudeAdapter(), new GeminiAdapter()];

export function resolveAdapter(url: URL): Adapter | null {
  for (const adapter of adapters) {
    if (adapter.matches(url)) return adapter;
  }
  return null;
}

export function listAdapters(): readonly Adapter[] {
  return adapters;
}
