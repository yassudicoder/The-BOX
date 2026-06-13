import type { RawMessage } from '../types/raw';

/**
 * Stable identity for a raw message. Prefer the source DOM id (the only truly
 * stable key across re-collections); fall back to role+content so messages
 * without an id still de-duplicate sensibly. NEVER keyed by array position —
 * a windowed virtualizer renders different slices at different scroll offsets,
 * so position is meaningless across batches.
 */
export function messageKey(m: RawMessage): string {
  return m.sourceId ? `id:${m.sourceId}` : `c:${m.role}\n${m.html}`;
}

/**
 * Merge message batches collected at different scroll positions into one
 * ordered, de-duplicated list.
 *
 * De-dup is by stable id (see messageKey); order is first-seen across the
 * batches in the order they were collected. A top→bottom sweep therefore yields
 * conversation order even when a virtualizer unmounts one end: the head batch
 * fixes the opening turns, and each later batch appends only the newly-revealed
 * tail turns. Pure — the scroll/DOM work lives in extract.ts.
 */
export function mergeById(batches: RawMessage[][]): RawMessage[] {
  const byKey = new Map<string, RawMessage>();
  const order: string[] = [];
  for (const batch of batches) {
    // For id-less messages, two distinct turns with identical content within a
    // batch must stay distinct — disambiguate by their ordinal in this batch.
    // The same DOM region re-collected in a later batch yields the same content
    // in the same order, so ordinals line up and genuine overlap still de-dups.
    const seenInBatch = new Map<string, number>();
    for (const m of batch) {
      let key = messageKey(m);
      if (!m.sourceId) {
        const n = seenInBatch.get(key) ?? 0;
        seenInBatch.set(key, n + 1);
        key = `${key}#${n}`;
      }
      if (!byKey.has(key)) {
        byKey.set(key, m);
        order.push(key);
      }
    }
  }
  return order.map((k) => byKey.get(k) as RawMessage);
}
