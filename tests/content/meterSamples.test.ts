import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  approxTokens,
  samplesFromRaw,
  detectHardWall,
} from '../../src/content/meterSamples';
import type { RawMessage } from '../../src/types/raw';

describe('stripHtml', () => {
  it('removes tags, decodes nbsp, and collapses whitespace', () => {
    expect(stripHtml('<p>hello&nbsp;<b>world</b></p>\n  <i>!</i>')).toBe('hello world !');
  });
});

describe('approxTokens', () => {
  it('is ~4 chars per token and 0 for blank', () => {
    expect(approxTokens('')).toBe(0);
    expect(approxTokens('   ')).toBe(0);
    expect(approxTokens('abcdefgh')).toBe(2);
  });
});

describe('samplesFromRaw', () => {
  it('keeps the stable sourceId and derives a turn index when present (Claude)', () => {
    const raw: RawMessage[] = [
      { role: 'user', html: '<p>hi there</p>', sourceId: 'conversation-turn-3:user' },
    ];
    const [s] = samplesFromRaw(raw);
    expect(s!.id).toBe('conversation-turn-3:user');
    expect(s!.turnIndex).toBe(3);
    expect(s!.tokens).toBeGreaterThan(0);
  });

  it('falls back to a content-based id and null index when there is no sourceId', () => {
    const raw: RawMessage[] = [{ role: 'assistant', html: '<p>answer</p>' }];
    const [s] = samplesFromRaw(raw);
    expect(s!.id).toContain('assistant:');
    expect(s!.turnIndex).toBe(null);
  });
});

describe('detectHardWall', () => {
  it('detects Claude\'s own length warning as a hard wall', () => {
    document.body.innerHTML = '<div>Your conversation is too long. Please start a new chat.</div>';
    expect(detectHardWall(document, 'claude')).toBe(true);
  });

  it('returns false for a normal Claude page', () => {
    document.body.innerHTML = '<div>A perfectly normal answer.</div>';
    expect(detectHardWall(document, 'claude')).toBe(false);
  });

  it('never reports a hard wall for non-Claude platforms', () => {
    document.body.innerHTML = '<div>conversation is too long</div>';
    expect(detectHardWall(document, 'chatgpt')).toBe(false);
    expect(detectHardWall(document, 'gemini')).toBe(false);
  });
});
