import { resolveAdapter } from '../adapters/base/AdapterRegistry';
import { ExtractionError, type RawConversation } from '../types/raw';
import type { BlockKind, Conversation } from '../types/conversation';
import type { ExtractionEvent, ExtractionLog } from '../types/log';
import { normalize } from './normalize';
import { waitForDomIdle, sleep } from '../utils/wait';

export interface ExtractOptions {
  signal?: AbortSignal;
  doc?: Document;
  maxScrollPasses?: number;
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

  let scrollPasses = 0;
  let raw: RawConversation;
  try {
    raw = await adapter.extract({
      signal,
      doc,
      scrollToLoadAll: async () => {
        scrollPasses = await scrollToTopUntilStable(doc, maxPasses, signal, push);
        push('scroll_complete', { passes: scrollPasses });
      },
    });
  } catch (err) {
    push('warning', {
      reason: err instanceof ExtractionError ? err.reason : 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
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

async function scrollToTopUntilStable(
  doc: Document,
  maxPasses: number,
  signal: AbortSignal,
  push: (step: ExtractionEvent['step'], detail?: ExtractionEvent['detail']) => void
): Promise<number> {
  const scroller =
    doc.querySelector('main') ??
    (doc.scrollingElement as Element | null) ??
    doc.documentElement;
  if (!scroller) return 0;

  let previousHeight = -1;
  let pass = 0;
  for (; pass < maxPasses; pass++) {
    if (signal.aborted) return pass;
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll'));
    await waitForDomIdle(scroller, { quietMs: 250, timeoutMs: 1500 });
    const currentHeight = scroller.scrollHeight;
    push('scroll_pass', { pass, height: currentHeight });
    if (currentHeight === previousHeight) return pass + 1;
    previousHeight = currentHeight;
    await sleep(50);
  }
  return pass;
}
