import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { normalize } from '../../src/pipeline/normalize';
import { structuralStrategy } from '../../src/pipeline/compress';
import { buildTransferPrompt } from '../../src/pipeline/transfer';
import type { Conversation } from '../../src/types/conversation';
import type { RawConversation } from '../../src/types/raw';

function makeConvo(turns: Array<{ role: 'user' | 'assistant'; html: string }>): Conversation {
  const raw: RawConversation = {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/test',
    title: 'Quicksort discussion',
    model: 'gpt-4o',
    messages: turns.map((t) => ({ role: t.role, html: t.html, sourceId: ulid() })),
    truncated: false,
  };
  return normalize(raw);
}

describe('end-to-end sample (visual sanity)', () => {
  it('produces a human-readable prompt for ChatGPT → Claude handoff', () => {
    const conv = makeConvo([
      {
        role: 'user',
        html: '<p>From now on, always include time complexity for any algorithm.</p>',
      },
      { role: 'assistant', html: '<p>Will do.</p>' },
      { role: 'user', html: '<p>Write a quicksort in TypeScript.</p>' },
      {
        role: 'assistant',
        html:
          '<p>Here is a simple implementation. Time complexity: O(n log n) average, O(n^2) worst case.</p><pre><code class="language-ts">function quicksort(arr: number[]): number[] { return arr; }</code></pre>',
      },
      { role: 'user', html: '<p>Make it in-place.</p>' },
      {
        role: 'assistant',
        html:
          '<p>Sure. Time complexity unchanged.</p><pre><code class="language-ts">function quicksortInPlace(arr: number[]): void {}</code></pre>',
      },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 4000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const out = buildTransferPrompt(cc, conv, { target: 'claude' });

    // Surface for human review during dev:
    if (process.env.SHOW_PROMPT) {
      // eslint-disable-next-line no-console
      console.log('\n----- TRANSFER PROMPT -----\n' + out.prompt + '\n---------------------------\n');
    }

    expect(out.prompt).toContain('<handoff');
    expect(out.prompt).toContain('always include time complexity');
    expect(out.prompt).toContain('Make it in-place'); // verbatim continuation
    expect(out.prompt).toContain('quicksortInPlace'); // recent code preserved
    expect(out.warnings).toEqual([]); // budget met, recent non-empty
  });
});
