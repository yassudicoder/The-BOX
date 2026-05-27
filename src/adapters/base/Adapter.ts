import type { Platform } from '../../types/conversation';
import type { RawConversation } from '../../types/raw';

export interface AdapterProbe {
  /** Selector-set version. Bump when you change selectors.ts. */
  version: string;
  /** Per-selector hit map: false means the selector found nothing. */
  selectorHits: Record<string, boolean>;
  /** Structural class-name hash of the conversation root. Drift = warning. */
  domFingerprint: string;
}

export interface ExtractContext {
  signal: AbortSignal;
  /** Document the adapter should read from. Defaults to window.document. */
  doc: Document;
  /** Trigger scroll-to-top loops to defeat virtualization. */
  scrollToLoadAll: () => Promise<void>;
}

export interface Adapter {
  readonly platform: Platform;
  matches(url: URL): boolean;
  extract(ctx: ExtractContext): Promise<RawConversation>;
  probe(doc: Document): AdapterProbe;
}
