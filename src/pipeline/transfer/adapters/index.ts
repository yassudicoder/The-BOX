import type { Platform } from '../../../types/conversation';
import type { TransferTargetAdapter } from './base';
import { claudeAdapter } from './claude';
import { chatgptAdapter } from './chatgpt';
import { geminiAdapter } from './gemini';
import { deepseekAdapter } from './deepseek';
import { perplexityAdapter } from './perplexity';
import { copilotAdapter } from './copilot';
import { grokAdapter } from './grok';
import { aistudioAdapter } from './aistudio';

const REGISTRY: Record<Platform, TransferTargetAdapter> = {
  claude: claudeAdapter,
  chatgpt: chatgptAdapter,
  gemini: geminiAdapter,
  deepseek: deepseekAdapter,
  perplexity: perplexityAdapter,
  copilot: copilotAdapter,
  grok: grokAdapter,
  aistudio: aistudioAdapter,
};

export function resolveTransferAdapter(target: Platform): TransferTargetAdapter {
  return REGISTRY[target];
}

export function listTransferTargets(): TransferTargetAdapter[] {
  return Object.values(REGISTRY);
}

export type { TransferTargetAdapter, Section, RenderContext } from './base';
