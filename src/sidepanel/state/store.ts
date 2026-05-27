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

export type Status = 'idle' | 'capturing' | 'ready' | 'error';

export interface SidepanelState {
  status: Status;
  error: string | null;

  conv: Conversation | null;
  compressed: CompressedConversation | null;

  target: Platform;
  recentTurnsVerbatim: number;
  targetTokens: number;
  nextInstruction: string;

  compose: ComposeState;

  prompt: string;
  promptTokens: number;
  warnings: Warning[];
  totals: SectionTotals;
  budget: TokenBudgetView | null;

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
}

export const useSidepanel = create<SidepanelState>((set, get) => ({
  status: 'idle',
  error: null,

  conv: null,
  compressed: null,

  target: 'claude',
  recentTurnsVerbatim: 4,
  targetTokens: 8000,
  nextInstruction: '',

  compose: emptyCompose(),

  prompt: '',
  promptTokens: 0,
  warnings: [],
  totals: { handoff: 0, digest: 0, recent: 0, continuation: 0, total: 0 },
  budget: null,

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
    set({
      conv: c,
      target,
      compose: emptyCompose(),
      compressed: null,
      status: 'ready',
      error: null,
    });
    get().recompute();
  },

  setTarget: (p) => {
    set({ target: p });
    get().recompute();
  },
  setRecentTurnsVerbatim: (n) => {
    set({ recentTurnsVerbatim: Math.max(0, n) });
    get().recompute();
  },
  setTargetTokens: (n) => {
    set({ targetTokens: Math.max(500, n) });
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
}));
