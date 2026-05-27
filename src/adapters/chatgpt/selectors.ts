/**
 * ChatGPT (chat.openai.com / chatgpt.com) DOM selectors.
 *
 * Layered for resilience:
 *   1. data attributes (most stable)
 *   2. ARIA roles
 *   3. structural class shapes (least stable; last resort)
 *
 * Bump SELECTOR_VERSION whenever this file changes.
 */
export const SELECTOR_VERSION = '2026-05-27.1';

export const SELECTORS = {
  /** Each rendered message has a role attribute. Primary, most stable. */
  message: '[data-message-author-role]',
  /** Role attribute value: "user" | "assistant" | "system" | "tool". */
  roleAttr: 'data-message-author-role',
  /** Message stable id. */
  messageIdAttr: 'data-message-id',
  /** Inner content wrapper holding the markdown-rendered HTML. */
  messageContent: '[data-message-author-role] .markdown, [data-message-author-role] .whitespace-pre-wrap',
  /** Conversation scroll container. Used for scroll-to-top. */
  conversationRoot: 'main [class*="react-scroll-to-bottom"], main',
  /** Page title element (best-effort). */
  title: 'nav [class*="truncate"], header h1',
} as const;

export type ChatGPTRole = 'user' | 'assistant' | 'system' | 'tool';
