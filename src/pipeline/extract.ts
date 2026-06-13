import { resolveAdapter } from '../adapters/base/AdapterRegistry';
import { ExtractionError, type RawConversation, type RawMessage } from '../types/raw';
import type { BlockKind, Conversation } from '../types/conversation';
import type { ExtractionEvent, ExtractionLog } from '../types/log';
import { normalize } from './normalize';
import {
  captureIsTruncated,
  loadStabilized,
  type LoadSample,
  type ScrollOutcome,
} from './completeness';
import { mergeById } from './merge';
import { waitForDomIdle, sleep } from '../utils/wait';

export interface ExtractOptions {
  signal?: AbortSignal;
  doc?: Document;
  maxScrollPasses?: number;
  /** L2 tail-recovery: max downward scroll steps when a capture looks incomplete. */
  maxTailRecoverySteps?: number;
  /** L2 tail-recovery: overall wall-clock budget (ms) for the downward sweep. */
  maxTailRecoveryMs?: number;
}

export async function extractFromDocument(
  opts: ExtractOptions = {}
): Promise<Conversation> {
  const doc = opts.doc ?? document;
  const url = new URL(doc.location?.href ?? location.href);
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const events: ExtractionEvent[] = [];
  const push = (step: ExtractionEvent['step'], detail?: ExtractionEvent['detail']): void => {
    events.push({ step, t: Math.round(performance.now() - t0), detail });
  };

  const adapter = resolveAdapter(url);
  if (!adapter) {
    throw new ExtractionError('unsupported_platform', `no adapter for ${url.hostname}`);
  }
  push('adapter_resolved', { platform: adapter.platform, host: url.hostname });

  const probe = adapter.probe(doc);
  push('adapter_extract_start', {
    selectorVersion: probe.version,
    fingerprint: probe.domFingerprint,
  });

  const signal = opts.signal ?? new AbortController().signal;
  const maxPasses = opts.maxScrollPasses ?? 8;

  let scrollOutcome: ScrollOutcome = { passes: 0, confirmedStable: false };
  let raw: RawConversation;
  try {
    raw = await adapter.extract({
      signal,
      doc,
      scrollToLoadAll: async () => {
        scrollOutcome = await scrollToLoadConversation(
          doc,
          maxPasses,
          signal,
          () => adapter.messageElements(doc).length,
          push
        );
        push('scroll_complete', {
          passes: scrollOutcome.passes,
          confirmedStable: scrollOutcome.confirmedStable,
        });
      },
    });
  } catch (err) {
    push('warning', {
      reason: err instanceof ExtractionError ? err.reason : 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // L1 completeness: combine the adapter's head-side heuristic with what the
  // scroll loop observed. If we scrolled but the conversation never stopped
  // growing, turns were still loading when we snapshotted — flag it so every
  // downstream surface (panel, transfer prompt, exports) can say so honestly.
  raw.truncated = captureIsTruncated({
    headHeuristic: raw.truncated,
    scrollConfirmedStable: scrollOutcome.confirmedStable,
    scrollPasses: scrollOutcome.passes,
  });

  // L2 bounded tail-recovery. Triggers when either L1 flagged the capture
  // incomplete (lazy-load / slow-render case) OR a cheap geometry check shows a
  // windowed virtualizer has unmounted content below the last visible message
  // (the windowed-tail case L1's count/height check at the top cannot see).
  // Normal-length, fully-mounted chats hit neither condition, so their fast path
  // is untouched. We sweep down to the end, re-collect, and merge by stable id.
  const scroller = scrollOutcome.passes > 0 ? findScroller(doc) : null;
  const viewport = scroller ? Math.max(1, scroller.clientHeight) : 0;
  const windowedTail =
    scroller !== null && unmountedTailPx(scroller, adapter.messageElements(doc)) > viewport;
  if (scroller && (raw.truncated || windowedTail)) {
    const batches = await recoverTail(
      scroller,
      () => adapter.collect(doc),
      opts.maxTailRecoverySteps ?? 12,
      opts.maxTailRecoveryMs ?? 12_000,
      signal,
      t0,
      push
    );
    const merged = mergeById([raw.messages, ...batches]);
    if (merged.length > raw.messages.length) raw.messages = merged;

    // Honest re-assessment after recovery. The opening prompt can only be
    // recovered by scrolling up (already done in L1); if it's still missing,
    // stay flagged. The tail counts as recovered only if we reached the
    // bottom of the scroller.
    const headStillMissing = raw.messages[0]?.role === 'assistant';
    const reachedBottom =
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    raw.truncated = headStillMissing || !reachedBottom;
    push('tail_recovery', {
      steps: batches.length,
      messages: raw.messages.length,
      reachedBottom,
      truncated: raw.truncated,
    });
  }

  push('adapter_extract_done', { rawMessages: raw.messages.length, truncated: raw.truncated });

  const conversation = normalize(raw);
  push('normalize_done', {
    messages: conversation.stats.messageCount,
    tokens: conversation.stats.approxTokens,
  });

  const blockCounts = countBlocks(conversation);
  const confidence = scoreConfidence(probe.selectorHits, raw);

  const log: ExtractionLog = {
    platform: adapter.platform,
    adapterVersion: probe.version,
    startedAt,
    durationMs: Math.round(performance.now() - t0),
    url: url.href,
    selectorReport: {
      hits: probe.selectorHits,
      selectorVersion: probe.version,
      domFingerprint: probe.domFingerprint,
    },
    messageCount: conversation.stats.messageCount,
    blockCounts,
    confidence,
    truncated: conversation.stats.truncated,
    events,
  };

  return { ...conversation, extractionLog: log };
}

function countBlocks(conv: Conversation): Partial<Record<BlockKind, number>> {
  const out: Partial<Record<BlockKind, number>> = {};
  for (const m of conv.messages) {
    for (const b of m.blocks) {
      out[b.kind] = (out[b.kind] ?? 0) + 1;
    }
  }
  return out;
}

function scoreConfidence(hits: Record<string, boolean>, raw: RawConversation): number {
  const total = Object.values(hits).length || 1;
  const hitCount = Object.values(hits).filter(Boolean).length;
  const hitRatio = hitCount / total;
  const notTruncated = raw.truncated ? 0 : 1;
  // 0.7 weight on selector coverage, 0.3 on absence of truncation.
  return Math.round((hitRatio * 0.7 + notTruncated * 0.3) * 100) / 100;
}

/**
 * Scroll the conversation to the top repeatedly to defeat lazy loading, and
 * report whether the conversation actually finished materializing.
 *
 * Unlike a height-only loop, this also tracks the mounted-message count each
 * pass (via the adapter) and only declares the load "stable" when BOTH height
 * and count stop changing — scrollHeight alone is unreliable for spacer-padded
 * virtual lists. If it runs out of passes while still growing, it returns
 * confirmedStable:false so the caller can flag the capture as incomplete.
 */
function findScroller(doc: Document): Element | null {
  return (
    doc.querySelector('main') ??
    (doc.scrollingElement as Element | null) ??
    doc.documentElement
  );
}

/**
 * Px of conversation that exists BELOW the last mounted message — i.e. content a
 * windowed virtualizer has unmounted at the bottom while we sit at the top. A
 * large value means the most-recent turns aren't in the DOM yet (L2 trigger).
 *
 * Layout-dependent: under happy-dom (no layout) every rect is 0, so this returns
 * 0 and never spuriously triggers recovery in unit tests — the real behaviour is
 * exercised by the gated browser tests.
 */
function unmountedTailPx(scroller: Element, messageEls: Element[]): number {
  if (messageEls.length === 0) return 0;
  const scrollerTop = scroller.getBoundingClientRect().top;
  let lastBottom = 0;
  for (const el of messageEls) {
    const bottom = el.getBoundingClientRect().bottom - scrollerTop + scroller.scrollTop;
    if (bottom > lastBottom) lastBottom = bottom;
  }
  return Math.max(0, scroller.scrollHeight - lastBottom);
}

async function scrollToLoadConversation(
  doc: Document,
  maxPasses: number,
  signal: AbortSignal,
  countMessages: () => number,
  push: (step: ExtractionEvent['step'], detail?: ExtractionEvent['detail']) => void
): Promise<ScrollOutcome> {
  const scroller = findScroller(doc);
  if (!scroller) return { passes: 0, confirmedStable: false };

  let prev: LoadSample | null = null;
  let pass = 0;
  for (; pass < maxPasses; pass++) {
    if (signal.aborted) return { passes: pass, confirmedStable: false };
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForDomIdle(scroller, { quietMs: 250, timeoutMs: 1500 });
    const current: LoadSample = { height: scroller.scrollHeight, count: countMessages() };
    push('scroll_pass', { pass, height: current.height, count: current.count });
    if (prev && loadStabilized(prev, current)) {
      return { passes: pass + 1, confirmedStable: true };
    }
    prev = current;
    await sleep(50);
  }
  return { passes: pass, confirmedStable: false };
}

/**
 * L2 bounded tail-recovery sweep.
 *
 * Step the scroller downward roughly one viewport at a time, re-collecting the
 * mounted messages at each stop, until we reach the bottom, run out of steps, or
 * exhaust the wall-clock budget. Returns the batches in sweep order so the
 * caller can merge them by stable id — the most-recent turns a virtualizer
 * unmounted at the top get re-materialized as we approach the end.
 */
async function recoverTail(
  scroller: Element,
  collect: () => RawMessage[],
  maxSteps: number,
  maxMs: number,
  signal: AbortSignal,
  t0: number,
  push: (step: ExtractionEvent['step'], detail?: ExtractionEvent['detail']) => void
): Promise<RawMessage[][]> {
  const batches: RawMessage[][] = [collect()];
  let prevTop = -1;
  for (let step = 0; step < maxSteps; step++) {
    if (signal.aborted || performance.now() - t0 > maxMs) break;
    const viewport = Math.max(1, scroller.clientHeight);
    const target = Math.min(scroller.scrollTop + viewport * 0.9, scroller.scrollHeight);
    if (target <= prevTop) break; // cannot advance (already at the bottom)
    scroller.scrollTop = target;
    prevTop = target;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForDomIdle(scroller, { quietMs: 250, timeoutMs: 1500 });
    batches.push(collect());
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      break; // reached the bottom — already collected after the idle wait above
    }
    await sleep(30);
  }
  return batches;
}
