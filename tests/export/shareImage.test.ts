import { describe, it, expect } from 'vitest';
import { wrapLine, layout, type Measure } from '../../src/export/shareImage';
import type { Message } from '../../src/types/conversation';

// Fake monospace measure: every character is 10px wide. Lets us reason about
// wrapping deterministically without a real canvas 2D context.
const CHAR = 10;
const measure: Measure = (t) => t.length * CHAR;

function msg(role: Message['role'], content: string): Message {
  return { id: role + content.length, role, content, blocks: [], approxTokens: 1 };
}

describe('wrapLine', () => {
  it('keeps a short line on one row', () => {
    expect(wrapLine('hello world', 200, measure)).toEqual(['hello world']);
  });

  it('wraps on word boundaries when the line is too wide', () => {
    // maxWidth 80px => 8 chars per line
    const lines = wrapLine('aaa bbb ccc', 80, measure);
    expect(lines).toEqual(['aaa bbb', 'ccc']);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(80);
  });

  it('hard-breaks a single word longer than the max width', () => {
    const lines = wrapLine('abcdefghij', 50, measure); // 5 chars per line
    expect(lines).toEqual(['abcde', 'fghij']);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(50);
  });

  it('returns a single empty line for empty input (never zero lines)', () => {
    expect(wrapLine('', 100, measure)).toEqual(['']);
  });
});

describe('layout', () => {
  it('produces one laid-out item per message and a positive total height', () => {
    const { items, totalHeight } = layout(
      [msg('user', 'hi'), msg('assistant', 'hello there')],
      measure
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.role).toBe('user');
    expect(totalHeight).toBeGreaterThan(0);
  });

  it('preserves explicit newlines as separate wrapped paragraphs', () => {
    const { items } = layout([msg('assistant', 'line one\n\nline three')], measure);
    // three source rows: "line one", "" (blank), "line three"
    expect(items[0]?.lines).toEqual(['line one', '', 'line three']);
  });

  it('taller messages yield taller cards', () => {
    const short = layout([msg('user', 'a')], measure).items[0]!;
    const long = layout([msg('user', 'a\nb\nc\nd\ne')], measure).items[0]!;
    expect(long.height).toBeGreaterThan(short.height);
  });
});
