import type { TransferTargetAdapter } from './base';
import { createMarkdownTarget } from './markdownTarget';

/**
 * Google AI Studio (aistudio.google.com) — transfer-only target. The system
 * prompt / first turn accepts markdown; defaults mirror the other markdown
 * targets.
 */
export const aistudioAdapter: TransferTargetAdapter = createMarkdownTarget({
  id: 'aistudio',
});
