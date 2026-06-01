/**
 * chrome.storage.local-backed persistence for captured conversations.
 *
 * Pure helpers + a small StorageDriver abstraction so the logic can be
 * unit-tested against an in-memory map. The chrome-backed driver lives at
 * the bottom of the file and is the only thing that touches `chrome.*`.
 *
 * Invariant: the `conv:index` array is the canonical list of conversation
 * IDs. Every `conv:<id>` blob whose id is in the index is "live"; any
 * `conv:<id>` blob whose id is NOT in the index is an orphan and should be
 * removed by `sweepOrphans`. `persistConversation` evicts trailing IDs
 * (and their blobs) when the index grows beyond `STORAGE_CAP`.
 */
import type { Conversation } from '../types/conversation';

export const CONV_KEY_PREFIX = 'conv:';
export const CONV_INDEX_KEY = 'conv:index';

/**
 * Hard cap on the number of conversations kept in chrome.storage.local.
 *
 * Chrome enforces a 10 MB per-extension quota on `chrome.storage.local`. A
 * single captured conversation can easily exceed 100 KB (longer ones run
 * into the hundreds), so the previous cap of 200 was wildly optimistic.
 * 50 keeps real headroom for users who capture long conversations while
 * still preserving meaningful history.
 */
export const STORAGE_CAP = 50;

export interface StorageDriver {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export type PersistResult =
  | { ok: true }
  | { ok: false; reason: 'storage_full'; detail: string };

/**
 * Detects Chrome storage quota errors. Chrome has historically exposed
 * these as `QuotaExceededError`, but the underlying message we caught in
 * the field reads `Resource::kQuotaBytes quota exceeded`. The regex covers
 * both shapes plus future drift.
 */
export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota|kQuotaBytes/i.test(msg);
}

/**
 * Writes a new conversation blob and updates the index. If the new id
 * pushes the index beyond STORAGE_CAP, the trailing blobs are removed in
 * the same call — eviction happens BEFORE the write so the new write has
 * room to land.
 *
 * Quota recovery: count-based eviction handles "many small captures." When
 * the user has few but enormous captures, the count cap never trips and
 * the new write still fails with quota. In that case we evict more
 * aggressively (a meaningful chunk of the oldest entries) and retry once.
 * The user just initiated this capture — they implicitly accepted "drop
 * the oldest in exchange for this one." If the retry also fails, the
 * single capture is too big to fit even after eviction and we surface a
 * typed `storage_full` result; the caller renders a Clear-captures
 * affordance.
 */
export async function persistConversation(
  driver: StorageDriver,
  conv: Conversation
): Promise<PersistResult> {
  const indexRaw = await driver.get(CONV_INDEX_KEY);
  const existing = (indexRaw[CONV_INDEX_KEY] as string[] | undefined) ?? [];

  // Put the new id at the front, deduped, so retry-eviction (which trims
  // from the tail) never accidentally drops the conversation we're trying
  // to write right now.
  const newIndex = [conv.id, ...existing.filter((id) => id !== conv.id)];
  const kept = newIndex.slice(0, STORAGE_CAP);
  const evicted = newIndex.slice(STORAGE_CAP);
  if (evicted.length > 0) {
    await driver.remove(evicted.map((id) => `${CONV_KEY_PREFIX}${id}`));
  }

  const blobKey = `${CONV_KEY_PREFIX}${conv.id}`;
  const first = await tryWrite(driver, blobKey, conv, kept);
  if (first.kind === 'ok') return { ok: true };
  if (first.kind === 'other') throw first.err;

  // Quota path. Evict max(5, ~25%) more entries from the tail and retry.
  const extra = Math.max(5, Math.ceil(kept.length * 0.25));
  const retainCount = Math.max(1, kept.length - extra);
  const retryKept = kept.slice(0, retainCount);
  const retryEvicted = kept.slice(retainCount);
  if (retryEvicted.length > 0) {
    await driver.remove(retryEvicted.map((id) => `${CONV_KEY_PREFIX}${id}`));
  }

  const second = await tryWrite(driver, blobKey, conv, retryKept);
  if (second.kind === 'ok') return { ok: true };
  if (second.kind === 'other') throw second.err;

  return {
    ok: false,
    reason: 'storage_full',
    detail:
      "This capture is too large to fit, even after dropping older captures. Click 'Clear stored captures' and try again.",
  };
}

type WriteAttempt =
  | { kind: 'ok' }
  | { kind: 'quota' }
  | { kind: 'other'; err: unknown };

async function tryWrite(
  driver: StorageDriver,
  blobKey: string,
  conv: Conversation,
  index: string[]
): Promise<WriteAttempt> {
  try {
    await driver.set({ [blobKey]: conv, [CONV_INDEX_KEY]: index });
    return { kind: 'ok' };
  } catch (err) {
    if (isQuotaError(err)) return { kind: 'quota' };
    return { kind: 'other', err };
  }
}

export async function loadConversation(
  driver: StorageDriver,
  id: string
): Promise<Conversation | null> {
  const key = `${CONV_KEY_PREFIX}${id}`;
  const raw = await driver.get(key);
  return (raw[key] as Conversation | undefined) ?? null;
}

/**
 * Removes any `conv:<id>` blob whose id is not in the canonical index.
 *
 * Heals the state of users upgrading from a version that capped the index
 * but never evicted the blobs (so the blobs accumulated indefinitely and
 * eventually exhausted the 10 MB quota). Safe to call repeatedly; cheap
 * when there are no orphans.
 */
export async function sweepOrphans(
  driver: StorageDriver
): Promise<{ removed: number }> {
  // chrome.storage.local has no keys-only API, so we read everything. The
  // values are needed only to enumerate keys; we don't inspect them.
  const all = await driver.get(null);
  const indexedIds = new Set<string>(
    (all[CONV_INDEX_KEY] as string[] | undefined) ?? []
  );
  const orphanKeys: string[] = [];
  for (const key of Object.keys(all)) {
    if (key === CONV_INDEX_KEY) continue;
    if (!key.startsWith(CONV_KEY_PREFIX)) continue;
    const id = key.slice(CONV_KEY_PREFIX.length);
    if (!indexedIds.has(id)) orphanKeys.push(key);
  }
  if (orphanKeys.length > 0) {
    await driver.remove(orphanKeys);
  }
  return { removed: orphanKeys.length };
}

/**
 * Removes every captured conversation and the index. User-triggered;
 * intentionally destructive. Returns the number of conversation blobs
 * removed (excluding the index key from the count).
 */
export async function clearAllCaptures(
  driver: StorageDriver
): Promise<{ removed: number }> {
  const all = await driver.get(null);
  const toRemove: string[] = [];
  let blobCount = 0;
  for (const key of Object.keys(all)) {
    if (!key.startsWith(CONV_KEY_PREFIX)) continue;
    toRemove.push(key);
    if (key !== CONV_INDEX_KEY) blobCount += 1;
  }
  if (toRemove.length > 0) {
    await driver.remove(toRemove);
  }
  return { removed: blobCount };
}

export async function getStoredCount(driver: StorageDriver): Promise<number> {
  const indexRaw = await driver.get(CONV_INDEX_KEY);
  const idx = (indexRaw[CONV_INDEX_KEY] as string[] | undefined) ?? [];
  return idx.length;
}

/**
 * The production driver. Thin wrapper around `chrome.storage.local`.
 * Lives here so callers never touch `chrome.*` directly and tests can
 * substitute an in-memory driver without mocking the global.
 */
export function chromeLocalDriver(): StorageDriver {
  return {
    get: (keys) =>
      chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,
    set: (items) => chrome.storage.local.set(items),
    remove: (keys) => chrome.storage.local.remove(keys),
  };
}
