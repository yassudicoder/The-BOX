import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { normalize } from '../../src/pipeline/normalize';
import { structuralStrategy } from '../../src/pipeline/compress';
import { exportMarkdown } from '../../src/export/markdown';
import { buildBundle, bundleToJson, type ExportBundle } from '../../src/export/json';
import type { Conversation } from '../../src/types/conversation';
import type { RawConversation } from '../../src/types/raw';

function makeConvo(): Conversation {
  const raw: RawConversation = {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/x',
    title: 'Quicksort discussion',
    model: 'gpt-4o',
    messages: [
      { role: 'user', html: '<p>Write a quicksort.</p>', sourceId: ulid() },
      {
        role: 'assistant',
        html:
          '<p>Sure:</p><pre><code class="language-ts">const x = 1;</code></pre>',
        sourceId: ulid(),
      },
    ],
    truncated: false,
  };
  return normalize(raw);
}

describe('exportMarkdown', () => {
  it('produces a header and one section per role', () => {
    const md = exportMarkdown(makeConvo());
    expect(md).toContain('# Quicksort discussion');
    expect(md).toContain('## User');
    expect(md).toContain('## Assistant');
    expect(md).toContain('```ts');
  });
});

describe('JSON bundle', () => {
  it('serializes bundleVersion 1 with conversation + compressed + warnings', () => {
    const conv = makeConvo();
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const bundle = buildBundle({ conversation: conv, compressed: cc, warnings: [] });
    const json = bundleToJson(bundle);
    const parsed = JSON.parse(json) as ExportBundle;
    expect(parsed.bundleVersion).toBe(1);
    expect(parsed.conversation.id).toBe(conv.id);
    expect(parsed.compressed?.passes.length).toBeGreaterThan(0);
  });
});
