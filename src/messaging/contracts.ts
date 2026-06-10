import type { Conversation, Platform } from '../types/conversation';
import type { ExtractionErrorReason } from '../types/raw';

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
  | { type: 'CAPTURE_OPENED'; panelOpened: boolean; detail?: string };

export type MsgType = Msg['type'];
export type MsgOf<T extends MsgType> = Extract<Msg, { type: T }>;
