import type { Conversation } from '../types/conversation';
import type { CompressedConversation } from '../pipeline/compress/types';
import type { TransferPrompt } from '../pipeline/transfer/types';
import type { Warning } from '../core/warnings';

/**
 * JSON bundle: everything needed to reproduce a transfer or debug an
 * extraction. Stable schema — when fields are added, bump bundleVersion
 * and add migration if downstream tooling consumes this.
 */
export interface ExportBundle {
  bundleVersion: 1;
  exportedAt: string;
  conversation: Conversation;
  compressed: CompressedConversation | null;
  transfer: TransferPrompt | null;
  warnings: Warning[];
}

export function buildBundle(parts: {
  conversation: Conversation;
  compressed?: CompressedConversation;
  transfer?: TransferPrompt;
  warnings?: Warning[];
}): ExportBundle {
  return {
    bundleVersion: 1,
    exportedAt: new Date().toISOString(),
    conversation: parts.conversation,
    compressed: parts.compressed ?? null,
    transfer: parts.transfer ?? null,
    warnings: parts.warnings ?? [],
  };
}

export function bundleToJson(b: ExportBundle): string {
  return JSON.stringify(b, jsonReplacer, 2);
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) return Array.from(value);
  return value;
}
