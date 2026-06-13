/**
 * Pure token-usage accumulation for the live context meter.
 *
 * The content-layer observer reads the mounted messages each debounce and feeds
 * them here as already-counted {id, tokens, turnIndex}. This module keeps a
 * running cache keyed by stable message id (so a message still counts after it
 * scrolls out of a virtualized window) and estimates the history we've never
 * seen from turn indices — WITHOUT ever scrolling the page (a hard rule: the
 * meter rides the L1 seam only, never triggers L2 recovery).
 *
 * Pure: no DOM, no chrome.*, no tokenizer. The DOM read + estimateTokens happen
 * in the thin content shell; this is unit-testable in isolation.
 */

export interface MountedMessage {
  /** Stable message id (same id the adapters/merge use). */
  id: string;
  /** Pre-counted approximate tokens for this message's current text. */
  tokens: number;
  /**
   * Best-effort conversation turn index parsed from the DOM (e.g. Claude's
   * conversation-turn-N), or null when the platform exposes no index (e.g.
   * ChatGPT's UUID ids) — in which case no unmounted history is estimated.
   */
  turnIndex: number | null;
}

export interface UsageState {
  /** Tokens per message id ever seen. Persists across unmounts (never deleted). */
  byId: Record<string, number>;
  /** Highest turn index ever observed; -1 when no index has been seen. */
  maxTurnIndex: number;
}

export function emptyUsage(): UsageState {
  return { byId: {}, maxTurnIndex: -1 };
}

/**
 * Fold the currently-mounted messages into the running state. Overwrites each
 * id's token count (so a streaming message's growing text is captured on the
 * next debounce) and never removes ids that have unmounted.
 */
export function updateUsage(state: UsageState, mounted: MountedMessage[]): UsageState {
  const byId = { ...state.byId };
  let maxTurnIndex = state.maxTurnIndex;
  for (const m of mounted) {
    byId[m.id] = m.tokens;
    if (m.turnIndex !== null && m.turnIndex > maxTurnIndex) maxTurnIndex = m.turnIndex;
  }
  return { byId, maxTurnIndex };
}

export interface UsageEstimate {
  /** Tokens summed over every message we've actually seen. */
  seenTokens: number;
  /** Number of distinct messages seen. */
  seenTurns: number;
  /** Estimated total turns in the conversation (from indices), >= seenTurns. */
  expectedTurns: number;
  /** Average tokens per seen turn. */
  avgTokensPerTurn: number;
  /**
   * Estimated whole-conversation tokens: everything seen, plus the turns we've
   * never seen (expectedTurns - seenTurns) valued at the average. Equals
   * seenTokens when no turn index is available.
   */
  estimatedTotalTokens: number;
}

export function estimateUsage(state: UsageState): UsageEstimate {
  const ids = Object.keys(state.byId);
  const seenTurns = ids.length;
  const seenTokens = ids.reduce((s, id) => s + state.byId[id]!, 0);
  const avgTokensPerTurn = seenTurns > 0 ? seenTokens / seenTurns : 0;

  // Index-based expectation: highest index implies (index + 1) turns exist.
  // With no index, we can't know the unseen history without scrolling (which we
  // refuse to do), so expected collapses to what we've seen.
  const indexImpliedTurns = state.maxTurnIndex >= 0 ? state.maxTurnIndex + 1 : seenTurns;
  const expectedTurns = Math.max(indexImpliedTurns, seenTurns);
  const unseenTurns = Math.max(0, expectedTurns - seenTurns);

  return {
    seenTokens,
    seenTurns,
    expectedTurns,
    avgTokensPerTurn,
    estimatedTotalTokens: Math.round(seenTokens + unseenTurns * avgTokensPerTurn),
  };
}

/**
 * Parse a turn index from a stable message id, matching an explicit "turn-N"
 * pattern only (e.g. Claude's "conversation-turn-12:user" → 12). Deliberately
 * does NOT grab any trailing digit, so ChatGPT's UUID ids and Gemini's hex turn
 * ids correctly yield null (no index → no unmounted-history estimate for those).
 */
export function parseTurnIndex(idish: string | null | undefined): number | null {
  if (!idish) return null;
  const m = /turn[-_]?(\d+)/i.exec(idish);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
