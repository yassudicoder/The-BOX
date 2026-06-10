import type { TransferTargetAdapter } from './base';
import { createMarkdownTarget } from './markdownTarget';

/** Microsoft Copilot (copilot.microsoft.com) — transfer-only target. Markdown. */
export const copilotAdapter: TransferTargetAdapter = createMarkdownTarget({
  id: 'copilot',
});
