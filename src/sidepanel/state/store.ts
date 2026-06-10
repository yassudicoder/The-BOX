import { create } from 'zustand';
import type { Conversation, Platform } from '../../types/conversation';
import type { CompressedConversation } from '../../pipeline/compress/types';
import { structuralStrategy } from '../../pipeline/compress';
import {
  buildTransferPrompt,
  emptyCompose,
  type ComposeState,
} from '../../pipeline/transfer';
import { computeSectionTotals, viewBudget } from '../../pipeline/tokens/sections';
import type { SectionTotals, TokenBudgetView } from '../../pipeline/tokens/sections';
import type { Warning } from '../../core/warnings';
import {
  chromeLocalDriver,
  clearAllCaptures,
  getStoredCount,
} from '../../background/storage';

export type Status = 'idle' | 'capturing' | 'ready' | 'error';

/**
 * Default token budget per transfer target. Declared as a Record (not a
 * function with a default branch) so the type system errors at the
 * declaration site when the Platform union grows — that's load-bearing
 * for the "Platform union widens cleanly" invariant.
 */
export const TARGET_DEFAULT_BUDGETS: Record<Platform, number> = {
  chatgpt: 32_000,
  claude: 32_000,
  gemini: 64_000,
  deepseek: 32_000,
  perplexity: 16_000,
  copilot: 16_000,
  grok: 32_000,
  aistudio: 64_000,
};

export interface SidepanelState {
  status: Status;
  error: string | null;

  conv: Conversation | null;
  compressed: CompressedConversation | null;

  target: Platform;
  recentTurnsVerbatim: number;
  targetTokens: number;
  /**
   * Tracks whether the user has manually edited the target-tokens input.
   * While false, switching `target` updates `targetTokens` to the new
   * target's default. Once true, the user's value sticks across target
   * switches. In-memory only; not persisted (matches compose-state pattern).
   */
  targetTokensUserModified: boolean;
  nextInstruction: string;

  compose: ComposeState;

  prompt: string;
  promptTokens: number;
  warnings: Warning[];
  totals: SectionTotals;
  budget: TokenBudgetView | null;

  /** Count of captures persisted in chrome.storage.local. null = not yet loaded. */
  storedCount: number | null;

  // intents
  setStatus(s: Status): void;
  setError(e: string | null): void;
  setConversation(c: Conversation | null): void;
  setTarget(p: Platform): void;
  setRecentTurnsVerbatim(n: number): void;
  setTargetTokens(n: number): void;
  setNextInstruction(s: string): void;
  toggleSection(key: keyof ComposeState['sectionToggles']): void;
  setMessageExcluded(id: string, excluded: boolean): void;
  setMessageRestored(id: string, restored: boolean): void;
  /** Recompute compressed + prompt. Cheap; called whenever compose changes. */
  recompute(): void;
  /** Read the stored-captures count from chrome.storage.local. */
  refreshStoredCount(): Promise<void>;
  /** Destructive: remove every persisted capture + the index. */
  clearStoredCaptures(): Promise<void>;
}

export const useSidepanel = create<SidepanelState>((set, get) => ({
  status: 'idle',
  error: null,

  conv: null,
  compressed: null,

  target: 'claude',
  recentTurnsVerbatim: 4,
  targetTokens: TARGET_DEFAULT_BUDGETS.claude,
  targetTokensUserModified: false,
  nextInstruction: '',

  compose: emptyCompose(),

  prompt: '',
  promptTokens: 0,
  warnings: [],
  totals: { handoff: 0, digest: 0, recent: 0, continuation: 0, total: 0 },
  budget: null,

  storedCount: null,

  setStatus: (s) => set({ status: s }),
  setError: (e) => set({ error: e }),

  setConversation: (c) => {
    if (!c) {
      set({
        conv: null,
        compressed: null,
        prompt: '',
        promptTokens: 0,
        warnings: [],
        totals: { handoff: 0, digest: 0, recent: 0, continuation: 0, total: 0 },
        budget: null,
        compose: emptyCompose(),
      });
      return;
    }
    const target: Platform = c.source.platform === 'claude' ? 'chatgpt' : 'claude';
    const { targetTokensUserModified, targetTokens } = get();
    const nextTokens = targetTokensUserModified
      ? targetTokens
      : TARGET_DEFAULT_BUDGETS[target];
    set({
      conv: c,
      target,
      targetTokens: nextTokens,
      compose: emptyCompose(),
      compressed: null,
      status: 'ready',
      error: null,
    });
    get().recompute();
  },

  setTarget: (p) => {
    const { targetTokensUserModified, targetTokens } = get();
    const nextTokens = targetTokensUserModified
      ? targetTokens
      : TARGET_DEFAULT_BUDGETS[p];
    set({ target: p, targetTokens: nextTokens });
    get().recompute();
  },
  setRecentTurnsVerbatim: (n) => {
    set({ recentTurnsVerbatim: Math.max(0, n) });
    get().recompute();
  },
  setTargetTokens: (n) => {
    set({ targetTokens: Math.max(500, n), targetTokensUserModified: true });
    get().recompute();
  },
  setNextInstruction: (s) => {
    set({ nextInstruction: s });
    get().recompute();
  },

  toggleSection: (key) => {
    const next = { ...get().compose };
    next.sectionToggles = {
      ...next.sectionToggles,
      [key]: !next.sectionToggles[key],
    };
    set({ compose: next });
    get().recompute();
  },

  setMessageExcluded: (id, excluded) => {
    const compose = get().compose;
    const excludedSet = new Set(compose.excludedMessageIds);
    if (excluded) excludedSet.add(id);
    else excludedSet.delete(id);
    set({ compose: { ...compose, excludedMessageIds: excludedSet } });
    get().recompute();
  },

  setMessageRestored: (id, restored) => {
    const compose = get().compose;
    const restoredSet = new Set(compose.restoredMessageIds);
    if (restored) restoredSet.add(id);
    else restoredSet.delete(id);
    set({ compose: { ...compose, restoredMessageIds: restoredSet } });
    get().recompute();
  },

  recompute: () => {
    const { conv, target, recentTurnsVerbatim, targetTokens, nextInstruction, compose } = get();
    if (!conv) return;
    const compressed = structuralStrategy.compress(conv, {
      targetTokens,
      recentTurnsVerbatim,
      preserveCodeBlocks: true,
    });
    const result = buildTransferPrompt(
      compressed,
      conv,
      { target, nextInstruction: nextInstruction.trim() || undefined },
      compose
    );
    const totals = computeSectionTotals(compressed, compose, {
      target,
      continuation: result.prompt,
    });
    const budget = viewBudget(compressed, totals);
    set({
      compressed,
      prompt: result.prompt,
      promptTokens: result.approxTokens,
      warnings: result.warnings,
      totals,
      budget,
    });
  },

  refreshStoredCount: async () => {
    try {
      const n = await getStoredCount(chromeLocalDriver());
      set({ storedCount: n });
    } catch {
      // Storage read failure is rare in practice; leaving storedCount at its
      // previous value rather than spuriously changing the displayed number.
    }
  },

  clearStoredCaptures: async () => {
    await clearAllCaptures(chromeLocalDriver());
    set({ storedCount: 0 });
  },
}));
