import type { Platform } from '../../../types/conversation';
import type { TransferTargetAdapter } from './base';
import { claudeAdapter } from './claude';
import { chatgptAdapter } from './chatgpt';
import { geminiAdapter } from './gemini';

const REGISTRY: Record<Platform, TransferTargetAdapter> = {
  claude: claudeAdapter,
  chatgpt: chatgptAdapter,
  gemini: geminiAdapter,
};

export function resolveTransferAdapter(target: Platform): TransferTargetAdapter {
  return REGISTRY[target];
}

export function listTransferTargets(): TransferTargetAdapter[] {
  return Object.values(REGISTRY);
}

export type { TransferTargetAdapter, Section, RenderContext } from './base';
