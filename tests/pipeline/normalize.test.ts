import { describe, it, expect } from 'vitest';
import { normalize, parseBlocks } from '../../src/pipeline/normalize';
import type { RawConversation } from '../../src/types/raw';

describe('normalize', () => {
  it('produces canonical Conversation with markdown content and token estimates', () => {
    const raw: RawConversation = {
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/test',
      title: 'Test',
      messages: [
        { role: 'user', html: '<p>hello <strong>world</strong></p>' },
        {
          role: 'assistant',
          html:
            '<p>here:</p><pre><code class="language-ts">const x: number = 1;</code></pre>',
        },
      ],
      truncated: false,
    };
    const conv = normalize(raw);
    expect(conv.schemaVersion).toBe(1);
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[0]?.content).toContain('**world**');
    expect(conv.messages[1]?.content).toMatch(/```ts/);
    expect(conv.messages[1]?.blocks.some((b) => b.kind === 'code')).toBe(true);
    expect(conv.stats.approxTokens).toBeGreaterThan(0);
    expect(conv.stats.truncated).toBe(false);
  });
});

describe('parseBlocks', () => {
  it('splits fenced code from prose and preserves language', () => {
    const md = 'before\n\n```py\nprint(1)\n```\n\nafter';
    const blocks = parseBlocks(md);
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'code', 'text']);
    const code = blocks.find((b) => b.kind === 'code');
    expect(code && code.kind === 'code' && code.language).toBe('py');
  });

  it('extracts inline math', () => {
    const md = 'energy is $E = mc^2$ in physics';
    const blocks = parseBlocks(md);
    expect(blocks.some((b) => b.kind === 'math')).toBe(true);
  });
});
