import type { Platform } from '../../types/conversation';
import type { RawConversation, RawMessage } from '../../types/raw';

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
  /**
   * The message-bearing elements currently mounted in the DOM, in document
   * order. Used by the completeness checks: its count drives the scroll-to-load
   * stability signal (L1), and the geometry of the last element vs the scroller
   * reveals an unmounted tail (L2 trigger). Cheap; need not exactly equal the
   * final extracted message count — only changes/positions matter.
   */
  messageElements(doc: Document): Element[];
  /**
   * Snapshot the messages currently mounted in the DOM, in document order, with
   * a best-effort stable `sourceId`. A pure read — NO scrolling. The orchestrator
   * calls this repeatedly during L2 tail-recovery and merges results by id, so
   * the most-recent turns a windowed virtualizer unmounted at the top can be
   * recovered by scrolling to the end and re-collecting.
   */
  collect(doc: Document): RawMessage[];
}
