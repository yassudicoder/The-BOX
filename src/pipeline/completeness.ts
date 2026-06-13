/**
 * Capture-completeness assessment (L1).
 *
 * Extraction reads whatever is materialized in the live DOM at snapshot time.
 * Long conversations on ChatGPT/Claude/Gemini load turns only as you scroll, so
 * a naive single snapshot can miss the oldest OR the most-recent turns. These
 * pure helpers decide whether a capture looks incomplete, so the exporter and
 * the warning taxonomy can flag it honestly instead of exporting a partial
 * conversation silently.
 *
 * Pure and DOM-free on purpose: the scroll loop in extract.ts feeds these
 * functions sampled numbers, so the decision logic is unit-testable without a
 * real (layout-capable) browser. The actual scroll/geometry behaviour is
 * exercised by the adapters and, for virtualization specifically, by the gated
 * L2 browser tests.
 */

/** A single observation of the conversation's load state during a scroll pass. */
export interface LoadSample {
  /** scrollHeight of the conversation scroller at this pass. */
  height: number;
  /** Number of message elements currently mounted in the DOM at this pass. */
  count: number;
}

/**
 * Pure: two consecutive samples show no further growth — both the scroll height
 * and the mounted-message count are unchanged. Height alone is unreliable for
 * spacer-padded virtual lists (the container reserves full height for unmounted
 * rows), which is why the count must also hold.
 */
export function loadStabilized(a: LoadSample, b: LoadSample): boolean {
  return a.height === b.height && a.count === b.count;
}

/** Result of the scroll-to-load loop, consumed by captureIsTruncated. */
export interface ScrollOutcome {
  /** Number of scroll passes actually performed. */
  passes: number;
  /** True iff a pass was observed where the load state stopped growing. */
  confirmedStable: boolean;
}

export interface TruncationInputs {
  /**
   * Adapter heuristic: the first captured turn is an assistant turn, which
   * usually means the opening user prompt scrolled out of the virtual window.
   */
  headHeuristic: boolean;
  /** The scroll loop observed the conversation stop growing (fully materialized). */
  scrollConfirmedStable: boolean;
  /**
   * How many scroll passes ran. 0 means we never scrolled (no scroller found) —
   * which is NOT evidence of loss (e.g. a short page with no scroll container).
   */
  scrollPasses: number;
}

/**
 * Decide whether a capture is incomplete. True when either:
 *  - the opening user prompt looks missing (head heuristic), or
 *  - we scrolled but never saw the conversation stop growing, so turns were
 *    still loading when we read the DOM (older/newer turns may be missing).
 *
 * A zero-pass scroll (no scroller) is treated as "no evidence of loss" so short
 * conversations are never spuriously flagged.
 */
export function captureIsTruncated(inp: TruncationInputs): boolean {
  const scrolledButUnstable = inp.scrollPasses > 0 && !inp.scrollConfirmedStable;
  return inp.headHeuristic || scrolledButUnstable;
}
