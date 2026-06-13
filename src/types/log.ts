import type { BlockKind, Platform } from './conversation';

export type ExtractionStep =
  | 'adapter_resolved'
  | 'scroll_pass'
  | 'scroll_complete'
  | 'tail_recovery'
  | 'adapter_extract_start'
  | 'adapter_extract_done'
  | 'normalize_done'
  | 'fallback_used'
  | 'warning';

export interface ExtractionEvent {
  step: ExtractionStep;
  /** ms since extraction start. */
  t: number;
  /** Free-form details — keep small, copyable. */
  detail?: Record<string, string | number | boolean | null>;
}

export interface SelectorReport {
  /** Per-selector hit map from the adapter probe. */
  hits: Record<string, boolean>;
  /** Selector-set version from the adapter. */
  selectorVersion: string;
  /** Hash of structural class names; drift = warning. */
  domFingerprint: string;
}

export interface ExtractionLog {
  platform: Platform | null;
  adapterVersion: string | null;
  startedAt: string;
  durationMs: number;
  url: string;
  selectorReport: SelectorReport | null;
  messageCount: number;
  blockCounts: Partial<Record<BlockKind, number>>;
  /**
   * Confidence is a coarse 0..1 estimate derived from:
   * - all primary selectors hit
   * - first message role == 'user' (no virtualization cut)
   * - message count matches turn count (when adapter tracks turns)
   * Surface to user as "high / medium / low", never as a precise number.
   */
  confidence: number;
  truncated: boolean;
  events: ExtractionEvent[];
}
