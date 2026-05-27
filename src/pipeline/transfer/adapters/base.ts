import type { Platform } from '../../../types/conversation';
import type { CompressedConversation, CompressedMessage } from '../../compress/types';
import type { Conversation } from '../../../types/conversation';
import type { Verbosity } from '../types';

export interface RenderContext {
  source: Conversation;
  compressed: CompressedConversation;
  digest: CompressedMessage[];
  recent: CompressedMessage[];
  continuation: { text: string; source: 'last_user_turn' | 'override' };
  verbosity: Verbosity;
  includeHandoff: boolean;
  /**
   * Section order, allowing per-target reordering. Default is
   * handoff → digest → recent → continuation, but a target may prefer
   * to lead with continuation, etc.
   */
  sectionOrder?: Section[];
}

export type Section = 'handoff' | 'digest' | 'recent' | 'continuation';

export interface TransferTargetAdapter {
  readonly id: Platform;
  readonly displayName: string;
  /** Defaults for this target — wrapper format and verbosity. */
  defaults: { useXmlTags: boolean; verbosity: Verbosity };
  /** The section order this target prefers. */
  sectionOrder: Section[];
  /** Phrasing for the "you are continuing a conversation" intro. */
  intro(ctx: RenderContext): string;
  /** Renders the handoff metadata block (or returns empty). */
  renderHandoff(ctx: RenderContext): string;
  renderDigest(ctx: RenderContext): string;
  renderRecent(ctx: RenderContext): string;
  renderContinuation(ctx: RenderContext): string;
}
