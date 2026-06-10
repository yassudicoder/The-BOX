import type { SourcePlatform, Role } from './conversation';

export interface RawMessage {
  role: Role;
  /** Adapter-extracted HTML. Normalizer converts to markdown + blocks. */
  html: string;
  /** Best-effort stable id from the source DOM, when available. */
  sourceId?: string;
  /** ISO timestamp if the platform exposes one. */
  createdAt?: string;
}

export interface RawConversation {
  platform: SourcePlatform;
  url: string;
  title?: string;
  model?: string;
  messages: RawMessage[];
  /** True if we suspect virtualization or another reason left messages missing. */
  truncated: boolean;
}

export type ExtractionErrorReason =
  | 'unsupported_platform'
  | 'not_a_conversation_page'
  | 'selectors_missed'
  | 'virtualization_failed'
  | 'permission_denied'
  | 'storage_full'
  | 'unknown';

export class ExtractionError extends Error {
  constructor(public reason: ExtractionErrorReason, message?: string) {
    super(message ?? reason);
    this.name = 'ExtractionError';
  }
}
