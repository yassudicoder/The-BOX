/**
 * Gemini (gemini.google.com) DOM selectors.
 *
 * Gemini is an Angular app with no `data-testid` story on the actual message
 * nodes. Selectors lean on:
 *   1. Angular custom-element tag names (`user-query`, `model-response`,
 *      `message-content`) — these are component names defined in TypeScript
 *      and are reliably stable across releases.
 *   2. Semantic class names (`.query-text`, `.markdown.markdown-main-panel`)
 *      that survive Angular's component-scope CSS hashing because they are
 *      authored as global utility classes.
 *   3. Each rendered turn lives in a `.conversation-container[id]` div where
 *      the id is a stable hex turn id (e.g. `70eca5bdaf4f3d32`) — useful as
 *      a sourceId without needing to hash content.
 *
 * Scope: gemini.google.com only. Not aistudio.google.com (separate product,
 * separate DOM, would need its own adapter).
 *
 * Bump SELECTOR_VERSION whenever this file changes.
 */
export const SELECTOR_VERSION = '2026-05-28.1';

export const SELECTORS = {
  /** Each rendered turn — wraps a user-query + model-response pair. */
  turn: '.conversation-container[id]',
  /** User prompt body. */
  userMessage: 'user-query .query-text, user-query-content .query-text',
  /** Assistant response body. */
  assistantMessage: 'model-response message-content .markdown.markdown-main-panel',
  /** Conversation root for scroll-to-top virtualization defeat. */
  conversationRoot: 'chat-window-content, .chat-history-scroll-container, main',
  /**
   * Page title — Gemini renders the conversation title inside the active
   * sidenav item. Fall back to `document.title` (suffixed " - Google Gemini").
   */
  title: '.mdc-list-item--activated .title-text',
  /**
   * Model picker button. Its aria-label reads "Open mode picker, currently
   * <Model Name>" — parsed in inferModel.
   */
  modelPickerButton: 'button[aria-label*="mode picker" i]',
  /** Fallback model label container if aria-label parsing fails. */
  modelPickerLabel: '.logo-pill-label-container',
} as const;
