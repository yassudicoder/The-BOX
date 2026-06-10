import type { ExtractionLog } from './log';

/**
 * All platforms the product knows about. Source-side support (extraction)
 * is a strict subset — see AdapterRegistry. Target-side support (transfer)
 * is broader because building a prompt is much cheaper than scraping a DOM.
 *
 * The first three have both extraction and transfer adapters. The rest are
 * transfer-only today (you can send a conversation *into* them, but capturing
 * *from* them is gated on real DOM fixtures — see PROJECT_STATE "Deferred").
 */
export type Platform =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'deepseek'
  | 'perplexity'
  | 'copilot'
  | 'grok'
  | 'aistudio';

/** Platforms we can extract (capture) from. A strict subset of Platform. */
export type SourcePlatform = 'chatgpt' | 'claude' | 'gemini';
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export type Block =
  | { kind: 'text'; markdown: string }
  | { kind: 'code'; language: string | null; code: string }
  | {
      kind: 'artifact';
      identifier: string | null;
      title: string | null;
      language: string | null;
      mimeType: string | null;
      content: string;
    }
  | { kind: 'math'; tex: string }
  | { kind: 'image'; alt?: string; src?: string }
  | { kind: 'tool_call'; name: string; payload: string }
  | { kind: 'tool_result'; payload: string };

export type BlockKind = Block['kind'];

export interface Message {
  id: string;
  role: Role;
  content: string;
  blocks: Block[];
  approxTokens: number;
  createdAt?: string;
}

export interface ConversationStats {
  messageCount: number;
  approxTokens: number;
  truncated: boolean;
}

export interface ConversationSource {
  platform: SourcePlatform;
  url: string;
  title?: string;
  model?: string;
  capturedAt: string;
}

export interface Conversation {
  schemaVersion: 1;
  id: string;
  source: ConversationSource;
  messages: Message[];
  stats: ConversationStats;
  extractionLog?: ExtractionLog;
}

export const CONVERSATION_SCHEMA_VERSION = 1 as const;
