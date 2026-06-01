import { describe, it, expect, beforeEach } from 'vitest';
import {
  TARGET_DEFAULT_BUDGETS,
  useSidepanel,
} from '../../src/sidepanel/state/store';

// The Zustand store is a module-singleton; reset to a clean post-mount state
// between tests so each case is independent.
function resetStore(): void {
  useSidepanel.setState({
    status: 'idle',
    error: null,
    conv: null,
    compressed: null,
    target: 'claude',
    recentTurnsVerbatim: 4,
    targetTokens: TARGET_DEFAULT_BUDGETS.claude,
    targetTokensUserModified: false,
    nextInstruction: '',
    prompt: '',
    promptTokens: 0,
    warnings: [],
    totals: { handoff: 0, digest: 0, recent: 0, continuation: 0, total: 0 },
    budget: null,
  });
}

describe('TARGET_DEFAULT_BUDGETS', () => {
  it('exposes the agreed per-target defaults', () => {
    expect(TARGET_DEFAULT_BUDGETS.chatgpt).toBe(32_000);
    expect(TARGET_DEFAULT_BUDGETS.claude).toBe(32_000);
    expect(TARGET_DEFAULT_BUDGETS.gemini).toBe(64_000);
  });
});

describe('store: setTarget budget tracking', () => {
  beforeEach(resetStore);

  it.each([
    ['chatgpt' as const, 32_000],
    ['claude' as const, 32_000],
    ['gemini' as const, 64_000],
  ])(
    'when user has not modified, setTarget(%s) updates targetTokens to %d',
    (target, expected) => {
      useSidepanel.getState().setTarget(target);
      const state = useSidepanel.getState();
      expect(state.target).toBe(target);
      expect(state.targetTokens).toBe(expected);
    }
  );

  it('when user has modified, setTarget does NOT update targetTokens', () => {
    useSidepanel.setState({
      targetTokens: 10_000,
      targetTokensUserModified: true,
    });
    useSidepanel.getState().setTarget('gemini');
    const state = useSidepanel.getState();
    expect(state.target).toBe('gemini');
    expect(state.targetTokens).toBe(10_000);
  });

  it('when user has modified, the value persists across multiple target switches', () => {
    useSidepanel.setState({
      targetTokens: 12_345,
      targetTokensUserModified: true,
    });
    useSidepanel.getState().setTarget('chatgpt');
    useSidepanel.getState().setTarget('gemini');
    useSidepanel.getState().setTarget('claude');
    expect(useSidepanel.getState().targetTokens).toBe(12_345);
  });
});

describe('store: setTargetTokens', () => {
  beforeEach(resetStore);

  it('sets the user-modified flag', () => {
    expect(useSidepanel.getState().targetTokensUserModified).toBe(false);
    useSidepanel.getState().setTargetTokens(20_000);
    expect(useSidepanel.getState().targetTokensUserModified).toBe(true);
    expect(useSidepanel.getState().targetTokens).toBe(20_000);
  });

  it('floors at 500 tokens (existing minimum)', () => {
    useSidepanel.getState().setTargetTokens(100);
    expect(useSidepanel.getState().targetTokens).toBe(500);
    // Even a floored value counts as a user modification — the user touched
    // the input.
    expect(useSidepanel.getState().targetTokensUserModified).toBe(true);
  });
});
