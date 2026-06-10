import type { TransferTargetAdapter } from './base';
import { createMarkdownTarget } from './markdownTarget';

/** DeepSeek (chat.deepseek.com) — transfer-only target. Accepts markdown. */
export const deepseekAdapter: TransferTargetAdapter = createMarkdownTarget({
  id: 'deepseek',
});
