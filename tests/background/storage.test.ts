import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import {
  CONV_INDEX_KEY,
  CONV_KEY_PREFIX,
  STORAGE_CAP,
  clearAllCaptures,
  getStoredCount,
  isQuotaError,
  loadConversation,
  persistConversation,
  sweepOrphans,
  type StorageDriver,
} from '../../src/background/storage';
import type { Conversation } from '../../src/types/conversation';

interface TestDriver {
  driver: StorageDriver;
  data: Map<string, unknown>;
  failNextSetWith(err: Error): void;
}

function makeDriver(initial: Record<string, unknown> = {}): TestDriver {
  const data = new Map<string, unknown>(Object.entries(initial));
  // Queue of failures applied to subsequent set() calls. Each call to
  // failNextSetWith pushes onto the queue; each set() shifts and throws if
  // populated. Lets tests simulate "first set quota-fails, retry succeeds."
  const setFailures: Error[] = [];

  const driver: StorageDriver = {
    async get(keys) {
      if (keys === null) return Object.fromEntries(data);
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) {
        if (data.has(k)) out[k] = data.get(k);
      }
      return out;
    },
    async set(items) {
      const next = setFailures.shift();
      if (next) throw next;
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) data.delete(k);
    },
  };

  return {
    driver,
    data,
    failNextSetWith(err) {
      setFailures.push(err);
    },
  };
}

function makeConv(id?: string): Conversation {
  return {
    schemaVersion: 1,
    id: id ?? ulid(),
    source: {
      platform: 'claude',
      url: 'https://claude.ai/x',
      capturedAt: new Date().toISOString(),
    },
    messages: [],
    stats: { messageCount: 0, approxTokens: 0, truncated: false },
  };
}

describe('isQuotaError', () => {
  it('matches the Chrome internal message we caught in the field', () => {
    expect(isQuotaError(new Error('Resource::kQuotaBytes quota exceeded'))).toBe(
      true
    );
  });

  it('matches the standard QuotaExceededError name in message form', () => {
    expect(isQuotaError(new Error('QuotaExceeded: out of room'))).toBe(true);
  });

  it('matches a plain "quota exceeded" message', () => {
    expect(isQuotaError(new Error('Storage quota exceeded'))).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isQuotaError(new Error('network failure'))).toBe(false);
    expect(isQuotaError('not even an error')).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe('persistConversation', () => {
  it('writes the conversation blob and inserts the id at the front of the index', async () => {
    const { driver, data } = makeDriver();
    const conv = makeConv('a');
    const result = await persistConversation(driver, conv);
    expect(result).toEqual({ ok: true });
    expect(data.get(`${CONV_KEY_PREFIX}a`)).toBe(conv);
    expect(data.get(CONV_INDEX_KEY)).toEqual(['a']);
  });

  it('prepends new captures to the index (most-recent-first ordering)', async () => {
    const { driver, data } = makeDriver();
    await persistConversation(driver, makeConv('first'));
    await persistConversation(driver, makeConv('second'));
    await persistConversation(driver, makeConv('third'));
    expect(data.get(CONV_INDEX_KEY)).toEqual(['third', 'second', 'first']);
  });

  it('is idempotent when persisting the same id twice (no duplicate index entries)', async () => {
    const { driver, data } = makeDriver();
    const conv = makeConv('a');
    await persistConversation(driver, conv);
    await persistConversation(driver, conv);
    expect(data.get(CONV_INDEX_KEY)).toEqual(['a']);
  });

  it('evicts the oldest blob and its index entry when the index would exceed STORAGE_CAP', async () => {
    const { driver, data } = makeDriver();
    // Fill to exactly STORAGE_CAP.
    for (let i = 0; i < STORAGE_CAP; i++) {
      await persistConversation(driver, makeConv(`id-${i}`));
    }
    // The first inserted ('id-0') should still be present.
    expect(data.has(`${CONV_KEY_PREFIX}id-0`)).toBe(true);
    expect((data.get(CONV_INDEX_KEY) as string[]).length).toBe(STORAGE_CAP);

    // One more push: id-0 should be evicted (it was at the tail).
    await persistConversation(driver, makeConv('newest'));
    expect(data.has(`${CONV_KEY_PREFIX}id-0`)).toBe(false);
    expect((data.get(CONV_INDEX_KEY) as string[]).length).toBe(STORAGE_CAP);
    expect((data.get(CONV_INDEX_KEY) as string[])[0]).toBe('newest');
  });

  it('on quota error, evicts more aggressively and retries — succeeds when retry has room', async () => {
    // Seed an index with 8 older captures and their blobs, simulating
    // "few but large" captures where the count cap never trips.
    const olderIds = Array.from({ length: 8 }, (_, i) => `old-${i}`);
    const initial: Record<string, unknown> = {
      [CONV_INDEX_KEY]: olderIds,
    };
    for (const id of olderIds) initial[`${CONV_KEY_PREFIX}${id}`] = makeConv(id);
    const { driver, data, failNextSetWith } = makeDriver(initial);

    // First write fails with quota; the retry (after aggressive eviction)
    // succeeds.
    failNextSetWith(new Error('Resource::kQuotaBytes quota exceeded'));

    const result = await persistConversation(driver, makeConv('new'));
    expect(result).toEqual({ ok: true });

    // The new capture is stored and at the front of the index.
    expect(data.has(`${CONV_KEY_PREFIX}new`)).toBe(true);
    const finalIndex = data.get(CONV_INDEX_KEY) as string[];
    expect(finalIndex[0]).toBe('new');

    // At least 5 oldest entries were evicted (the max(5, 25%) rule).
    expect(finalIndex.length).toBeLessThanOrEqual(9 - 5);
    // The most-recently-evicted (oldest) ids are gone from storage.
    expect(data.has(`${CONV_KEY_PREFIX}old-7`)).toBe(false);
  });

  it('preserves the new capture id at the front during retry-eviction (never evicts the one being written)', async () => {
    // 6 olders — extra = max(5, ceil(7 * 0.25)) = 5. retainCount = 7 - 5 = 2.
    // retryKept = ['new', 'old-0'] — new must stay at position 0.
    const olderIds = Array.from({ length: 6 }, (_, i) => `old-${i}`);
    const initial: Record<string, unknown> = { [CONV_INDEX_KEY]: olderIds };
    for (const id of olderIds) initial[`${CONV_KEY_PREFIX}${id}`] = makeConv(id);
    const { driver, data, failNextSetWith } = makeDriver(initial);

    failNextSetWith(new Error('Resource::kQuotaBytes quota exceeded'));
    const result = await persistConversation(driver, makeConv('new'));

    expect(result).toEqual({ ok: true });
    expect((data.get(CONV_INDEX_KEY) as string[])[0]).toBe('new');
    expect(data.has(`${CONV_KEY_PREFIX}new`)).toBe(true);
  });

  it('returns storage_full result only after both the first write AND the retry fail with quota', async () => {
    const { driver, failNextSetWith } = makeDriver();
    failNextSetWith(new Error('Resource::kQuotaBytes quota exceeded'));
    failNextSetWith(new Error('Resource::kQuotaBytes quota exceeded'));
    const result = await persistConversation(driver, makeConv('a'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('storage_full');
      expect(result.detail).toMatch(/clear stored captures/i);
    }
  });

  it('re-throws a non-quota error from the first write so it is not silently swallowed', async () => {
    const { driver, failNextSetWith } = makeDriver();
    failNextSetWith(new Error('disk on fire'));
    await expect(persistConversation(driver, makeConv('a'))).rejects.toThrow(
      'disk on fire'
    );
  });

  it('re-throws a non-quota error from the retry write so it is not silently swallowed', async () => {
    const { driver, failNextSetWith } = makeDriver();
    failNextSetWith(new Error('Resource::kQuotaBytes quota exceeded'));
    failNextSetWith(new Error('disk on fire'));
    await expect(persistConversation(driver, makeConv('a'))).rejects.toThrow(
      'disk on fire'
    );
  });
});

describe('loadConversation', () => {
  it('returns the stored conversation', async () => {
    const { driver } = makeDriver();
    const conv = makeConv('a');
    await persistConversation(driver, conv);
    const loaded = await loadConversation(driver, 'a');
    expect(loaded).toBe(conv);
  });

  it('returns null when the id is missing', async () => {
    const { driver } = makeDriver();
    const loaded = await loadConversation(driver, 'never-stored');
    expect(loaded).toBeNull();
  });
});

describe('sweepOrphans', () => {
  it('removes conv:<id> blobs that are not referenced in the index', async () => {
    const { driver, data } = makeDriver({
      [CONV_INDEX_KEY]: ['live'],
      [`${CONV_KEY_PREFIX}live`]: makeConv('live'),
      [`${CONV_KEY_PREFIX}orphan-1`]: makeConv('orphan-1'),
      [`${CONV_KEY_PREFIX}orphan-2`]: makeConv('orphan-2'),
    });
    const result = await sweepOrphans(driver);
    expect(result.removed).toBe(2);
    expect(data.has(`${CONV_KEY_PREFIX}live`)).toBe(true);
    expect(data.has(`${CONV_KEY_PREFIX}orphan-1`)).toBe(false);
    expect(data.has(`${CONV_KEY_PREFIX}orphan-2`)).toBe(false);
    // Index itself stays intact.
    expect(data.get(CONV_INDEX_KEY)).toEqual(['live']);
  });

  it('is a no-op when there are no orphans', async () => {
    const { driver, data } = makeDriver({
      [CONV_INDEX_KEY]: ['a', 'b'],
      [`${CONV_KEY_PREFIX}a`]: makeConv('a'),
      [`${CONV_KEY_PREFIX}b`]: makeConv('b'),
    });
    const result = await sweepOrphans(driver);
    expect(result.removed).toBe(0);
    expect(data.size).toBe(3);
  });

  it('handles a missing index gracefully (treats all conv:<id> as orphans)', async () => {
    const { driver, data } = makeDriver({
      [`${CONV_KEY_PREFIX}stray`]: makeConv('stray'),
    });
    const result = await sweepOrphans(driver);
    expect(result.removed).toBe(1);
    expect(data.has(`${CONV_KEY_PREFIX}stray`)).toBe(false);
  });

  it('does not touch non-conv keys', async () => {
    const { driver, data } = makeDriver({
      [CONV_INDEX_KEY]: [],
      'unrelated-key': 'leave me alone',
      [`${CONV_KEY_PREFIX}orphan`]: makeConv('orphan'),
    });
    await sweepOrphans(driver);
    expect(data.get('unrelated-key')).toBe('leave me alone');
    expect(data.has(`${CONV_KEY_PREFIX}orphan`)).toBe(false);
  });
});

describe('clearAllCaptures', () => {
  it('removes every conv:<id> blob and the index, returning the blob count', async () => {
    const { driver, data } = makeDriver({
      [CONV_INDEX_KEY]: ['a', 'b'],
      [`${CONV_KEY_PREFIX}a`]: makeConv('a'),
      [`${CONV_KEY_PREFIX}b`]: makeConv('b'),
      [`${CONV_KEY_PREFIX}stray`]: makeConv('stray'),
      'unrelated': 'untouched',
    });
    const result = await clearAllCaptures(driver);
    // 3 conversation blobs (a, b, stray) — not counting the index key itself.
    expect(result.removed).toBe(3);
    expect(data.has(CONV_INDEX_KEY)).toBe(false);
    expect(data.has(`${CONV_KEY_PREFIX}a`)).toBe(false);
    expect(data.has(`${CONV_KEY_PREFIX}b`)).toBe(false);
    expect(data.has(`${CONV_KEY_PREFIX}stray`)).toBe(false);
    // Non-conv keys are preserved.
    expect(data.get('unrelated')).toBe('untouched');
  });

  it('reports 0 when there is nothing stored', async () => {
    const { driver } = makeDriver();
    const result = await clearAllCaptures(driver);
    expect(result.removed).toBe(0);
  });
});

describe('getStoredCount', () => {
  it('returns the length of the index', async () => {
    const { driver } = makeDriver({
      [CONV_INDEX_KEY]: ['a', 'b', 'c'],
    });
    expect(await getStoredCount(driver)).toBe(3);
  });

  it('returns 0 when the index is missing', async () => {
    const { driver } = makeDriver();
    expect(await getStoredCount(driver)).toBe(0);
  });
});
