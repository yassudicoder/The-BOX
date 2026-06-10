import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { normalize } from '../../src/pipeline/normalize';
import { exportHtml, type HtmlTemplate } from '../../src/export/html';
import type { Conversation } from '../../src/types/conversation';
import type { RawConversation } from '../../src/types/raw';

function makeConvo(): Conversation {
  const raw: RawConversation = {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/x',
    title: 'Quicksort discussion',
    model: 'gpt-4o',
    messages: [
      { role: 'user', html: '<p>Write a quicksort & explain <O(n log n)>.</p>', sourceId: ulid() },
      {
        role: 'assistant',
        html: '<p>Sure:</p><pre><code class="language-ts">const x = 1;</code></pre>',
        sourceId: ulid(),
      },
    ],
    truncated: false,
  };
  return normalize(raw);
}

const TEMPLATES: HtmlTemplate[] = ['highlight', 'dark', 'note'];

describe('exportHtml', () => {
  it('produces a self-contained document with inlined CSS', () => {
    const html = exportHtml(makeConvo());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    // no external stylesheet/script references — must be self-contained
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<script');
  });

  it('renders a header with title, model, and source', () => {
    const html = exportHtml(makeConvo());
    expect(html).toContain('Quicksort discussion');
    expect(html).toContain('gpt-4o');
    expect(html).toContain('ChatGPT');
  });

  it('renders one article per message with role labels', () => {
    const html = exportHtml(makeConvo());
    expect(html).toContain('msg-user');
    expect(html).toContain('msg-assistant');
    expect((html.match(/<article/g) ?? []).length).toBe(2);
  });

  it('preserves code blocks and their language', () => {
    const html = exportHtml(makeConvo());
    expect(html).toContain('const x = 1;');
    expect(html).toContain('data-lang="ts"');
  });

  it('escapes HTML-special characters so source content cannot inject markup', () => {
    // Construct directly so the special chars reach the exporter verbatim
    // (the normalizer would otherwise strip stray angle brackets).
    const conv: Conversation = {
      schemaVersion: 1,
      id: ulid(),
      source: { platform: 'chatgpt', url: '', capturedAt: new Date().toISOString() },
      messages: [
        {
          id: ulid(),
          role: 'assistant',
          content: 'if (a < b && c > d) {}',
          blocks: [{ kind: 'code', language: 'js', code: 'if (a < b && c > d) { x = "<script>" }' }],
          approxTokens: 12,
        },
      ],
      stats: { messageCount: 1, approxTokens: 12, truncated: false },
    };
    const html = exportHtml(conv);
    expect(html).toContain('a &lt; b &amp;&amp; c &gt; d');
    expect(html).toContain('&lt;script&gt;');
    // crucially, no live script tag from the conversation content
    expect(html).not.toContain('<script>');
  });

  it('each template yields distinct CSS keyed on its body class', () => {
    const outputs = TEMPLATES.map((t) => exportHtml(makeConvo(), { template: t }));
    for (let i = 0; i < TEMPLATES.length; i++) {
      expect(outputs[i]).toContain(`class="body"`.replace('body', `tpl-${TEMPLATES[i]}`));
    }
    // outputs are not all identical
    expect(new Set(outputs).size).toBe(TEMPLATES.length);
  });

  it('honors a custom document title', () => {
    const html = exportHtml(makeConvo(), { title: 'My Export' });
    expect(html).toContain('<title>My Export</title>');
  });
});
