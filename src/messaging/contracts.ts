import type { Conversation, Platform, SourcePlatform } from '../types/conversation';
import type { ExtractionErrorReason } from '../types/raw';
import type { ClaudeQuota } from '../core/context/quota';

export type CompressionStrategyId = 'structural' | 'llm-summary';

export interface TransferOptions {
  recentTurnsVerbatim: number;
  targetTokens: number;
  nextInstruction?: string;
}

export type Msg =
  | { type: 'PING' }
  | { type: 'PONG'; platform: Platform | null }
  | { type: 'EXTRACT_REQUEST'; tabId: number }
  | { type: 'EXTRACT_RESULT'; conversation: Conversation }
  | { type: 'EXTRACT_ERROR'; reason: ExtractionErrorReason; detail?: string }
  | {
      type: 'COMPRESS_REQUEST';
      conversationId: string;
      strategy: CompressionStrategyId;
      targetTokens: number;
    }
  | { type: 'COMPRESS_RESULT'; conversationId: string; compressedId: string }
  | {
      type: 'BUILD_TRANSFER';
      conversationId: string;
      target: Platform;
      options: TransferOptions;
    }
  | { type: 'BUILD_TRANSFER_RESULT'; transferId: string; prompt: string }
  // Sent by the in-page floating button (content script) on click. The
  // background reads sender.tab.id, opens the side panel, and flags a pending
  // capture for the panel to pick up.
  | { type: 'CAPTURE_AND_OPEN' }
  | { type: 'CAPTURE_OPENED'; panelOpened: boolean; detail?: string }
  // Sent (debounced) by the opt-in context-meter content script with a local
  // token estimate for the active conversation. The background resolves the
  // window from the user's plan, sets the per-tab badge, and stores the reading
  // for the side panel. Carries no message content — only counts.
  | {
      type: 'CONTEXT_USAGE';
      platform: SourcePlatform;
      usedTokens: number;
      seenTurns: number;
      expectedTurns: number;
      hardWall: boolean;
    }
  // Sent (polled) by the opt-in meter content script on Claude only, carrying
  // the user's OWN exact usage fractions read same-origin from claude.ai's
  // /usage API. `quota: null` means the endpoint was unreachable or its shape
  // changed — the background then drops any stored reading so the panel falls
  // back to the estimate (never a stale "exact" number).
  | { type: 'CLAUDE_QUOTA'; quota: ClaudeQuota | null };

export type MsgType = Msg['type'];
export type MsgOf<T extends MsgType> = Extract<Msg, { type: T }>;
