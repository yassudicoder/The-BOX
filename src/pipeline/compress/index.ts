export * from './types';
export { structuralStrategy } from './structural';
import type { CompressionStrategy, CompressionStrategyId } from './types';
import { structuralStrategy } from './structural';

const STRATEGIES: Record<CompressionStrategyId, CompressionStrategy | null> = {
  structural: structuralStrategy,
  'llm-summary': null,
};

export function getStrategy(id: CompressionStrategyId): CompressionStrategy {
  const s = STRATEGIES[id];
  if (!s) throw new Error(`compression strategy not available: ${id}`);
  return s;
}
