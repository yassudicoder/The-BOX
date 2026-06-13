import { describe, it, expect } from 'vitest';
import {
  resolveContextWindow,
  readMeter,
  meterCopy,
  AMBER_AT,
  RED_AT,
} from '../../src/core/context/meter';
import {
  emptyUsage,
  updateUsage,
  estimateUsage,
  parseTurnIndex,
  type MountedMessage,
} from '../../src/core/context/usage';

const mm = (id: string, tokens: number, turnIndex: number | null = null): MountedMessage => ({
  id,
  tokens,
  turnIndex,
});

describe('resolveContextWindow', () => {
  it('prefers a confidently-matched model window over the plan default', () => {
    const r = resolveContextWindow({ platform: 'chatgpt', plan: 'free', model: 'GPT-4o' });
    expect(r.basis).toBe('model');
    expect(r.window).toBe(128_000);
  });

  it('matches the longest/most-specific model key first', () => {
    expect(resolveContextWindow({ platform: 'chatgpt', plan: 'pro', model: 'gpt-4o-mini' }).window).toBe(
      128_000
    );
    expect(resolveContextWindow({ platform: 'chatgpt', plan: 'pro', model: 'gpt-4' }).window).toBe(8_192);
  });

  it('falls back to the conservative plan default when the model is unknown', () => {
    const r = resolveContextWindow({ platform: 'chatgpt', plan: 'free' });
    expect(r.basis).toBe('plan-default');
    expect(r.window).toBe(8_000);
  });
});

describe('readMeter', () => {
  it('classifies green / amber / red at the 60% and 85% thresholds', () => {
    expect(readMeter(10, 100).level).toBe('green');
    expect(readMeter(Math.ceil(AMBER_AT * 100), 100).level).toBe('amber');
    expect(readMeter(Math.ceil(RED_AT * 100), 100).level).toBe('red');
  });

  it('clamps the ratio to [0,1] and rounds percent', () => {
    const over = readMeter(250, 100);
    expect(over.ratio).toBe(1);
    expect(over.percent).toBe(100);
  });

  it('forces 100% red at a platform hard wall regardless of estimate', () => {
    const r = readMeter(5, 100, true);
    expect(r).toMatchObject({ level: 'red', percent: 100, atHardWall: true });
  });
});

describe('meterCopy', () => {
  it('offers the Transfer CTA only in red', () => {
    expect(meterCopy('chatgpt', 'green').showTransferCta).toBe(false);
    expect(meterCopy('chatgpt', 'amber').showTransferCta).toBe(false);
    expect(meterCopy('chatgpt', 'red').showTransferCta).toBe(true);
  });

  it('uses platform-specific red framing', () => {
    expect(meterCopy('chatgpt', 'red').long.toLowerCase()).toContain('forgotten');
    expect(meterCopy('claude', 'red').long.toLowerCase()).toContain('hard length');
  });
});

describe('usage accumulation', () => {
  it('caches tokens by id and keeps counting messages after they unmount', () => {
    let s = emptyUsage();
    s = updateUsage(s, [mm('a', 10), mm('b', 20)]);
    s = updateUsage(s, [mm('c', 30)]); // a,b scrolled out — still counted
    expect(estimateUsage(s).seenTokens).toBe(60);
    expect(estimateUsage(s).seenTurns).toBe(3);
  });

  it('captures a streaming message growing across debounces', () => {
    let s = emptyUsage();
    s = updateUsage(s, [mm('a', 5)]);
    s = updateUsage(s, [mm('a', 40)]); // same id, more text
    expect(estimateUsage(s).seenTokens).toBe(40);
  });

  it('estimates unseen history from turn indices (never scrolls)', () => {
    // Mounted window is turns 10 & 11 only, but indices imply 12 turns exist.
    let s = emptyUsage();
    s = updateUsage(s, [mm('t10', 100, 10), mm('t11', 100, 11)]);
    const e = estimateUsage(s);
    expect(e.expectedTurns).toBe(12);
    // seen 200 + 10 unseen turns * avg 100 = 1200
    expect(e.estimatedTotalTokens).toBe(1200);
  });

  it('makes no unseen estimate when there is no turn index', () => {
    let s = emptyUsage();
    s = updateUsage(s, [mm('x', 100), mm('y', 100)]);
    const e = estimateUsage(s);
    expect(e.expectedTurns).toBe(2);
    expect(e.estimatedTotalTokens).toBe(200);
  });
});

describe('parseTurnIndex', () => {
  it('extracts the index from a Claude-style turn id', () => {
    expect(parseTurnIndex('conversation-turn-12:user')).toBe(12);
    expect(parseTurnIndex('conversation-turn-0:assistant')).toBe(0);
  });
  it('returns null for UUID / hex / index-less ids', () => {
    expect(parseTurnIndex('a1b2c3-uuid-ffff')).toBe(null); // ChatGPT UUID, trailing hex
    expect(parseTurnIndex('70eca5bdaf4f3d32:user')).toBe(null); // Gemini hex turn id
    expect(parseTurnIndex(undefined)).toBe(null);
    expect(parseTurnIndex('')).toBe(null);
  });
});
