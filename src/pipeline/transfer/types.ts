import type { Platform } from '../../types/conversation';
import type { Warning } from '../../core/warnings';

export type Verbosity = 'full' | 'compact';

export interface TransferOptions {
  target: Platform;
  useXmlTags?: boolean;
  verbosity?: Verbosity;
  nextInstruction?: string;
}

export interface TransferPrompt {
  id: string;
  prompt: string;
  approxTokens: number;
  target: Platform;
  sections: {
    handoffIncluded: boolean;
    digestMessageCount: number;
    recentMessageCount: number;
    continuationSource: 'last_user_turn' | 'override';
  };
  warnings: Warning[];
}
