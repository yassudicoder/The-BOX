/**
 * Claude.ai DOM selectors.
 *
 * Claude does not expose a single canonical data-attribute for messages.
 * We rely on a layered approach:
 *   1. data-testid (when present)
 *   2. aria roles
 *   3. structural class patterns ("font-claude-message" for assistant turns,
 *      contenteditable=false blocks for user turns)
 *
 * Bump SELECTOR_VERSION whenever this file changes.
 */
export const SELECTOR_VERSION = '2026-05-27.1';

export const SELECTORS = {
  /** Turn containers. Claude uses divs grouping a user prompt + assistant reply. */
  turn: '[data-testid^="conversation-turn"], div.group\\/conversation-turn, main [data-test-render-count]',
  /** Assistant message body. */
  assistantMessage: '[data-testid="conversation-turn-assistant"], .font-claude-message, div[data-is-streaming]',
  /** User message body. */
  userMessage: '[data-testid="user-message"], [data-test-id="user-message"], div[data-message-author="user"]',
  /** Conversation root for scroll-to-top. */
  conversationRoot: 'main, [data-testid="chat-container"]',
  /** Page title. */
  title: 'header h1, [data-testid="chat-title"]',
} as const;
