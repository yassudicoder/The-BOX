import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { structuralStrategy } from '../../src/pipeline/compress';
import { normalize } from '../../src/pipeline/normalize';
import type { Conversation } from '../../src/types/conversation';
import type { RawConversation } from '../../src/types/raw';

function makeConvo(turns: Array<{ role: 'user' | 'assistant'; html: string }>): Conversation {
  const raw: RawConversation = {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/test',
    messages: turns.map((t) => ({ role: t.role, html: t.html, sourceId: ulid() })),
    truncated: false,
  };
  return normalize(raw);
}

describe('structuralStrategy', () => {
  it('returns a non-destructive CompressedConversation with provenance for every message', () => {
    const conv = makeConvo([
      { role: 'user', html: '<p>q1</p>' },
      { role: 'assistant', html: '<p>Certainly! Here is a1.</p>' },
      { role: 'user', html: '<p>q2</p>' },
      { role: 'assistant', html: '<p>a2 body</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 10_000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    expect(cc.sourceConversationId).toBe(conv.id);
    expect(cc.messages).toHaveLength(4);
    for (const m of cc.messages) {
      expect(m.provenance).toBeDefined();
      if (m.provenance.kind !== 'synthetic') {
        expect('sourceMessageId' in m.provenance).toBe(true);
      }
    }
    expect(cc.passes.map((p) => p.pass)).toEqual([
      'boilerplate',
      'recency',
      'instructions',
      'assistantRules',
      'salience',
      'truncate',
    ]);
  });

  it('strips assistant filler and records the boilerplate pass touching that message', () => {
    const conv = makeConvo([
      { role: 'user', html: '<p>q</p>' },
      { role: 'assistant', html: '<p>Certainly! The answer is 42.</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 10_000,
      recentTurnsVerbatim: 4,
      preserveCodeBlocks: true,
    });
    const assistant = cc.messages[1]!;
    expect(assistant.content.toLowerCase().startsWith('certainly')).toBe(false);
    const bp = cc.passes.find((p) => p.pass === 'boilerplate')!;
    expect(bp.affectedMessageIds).toContain(assistant.id);
  });

  it('summarizes older turns and keeps the recent window verbatim', () => {
    const turns: Array<{ role: 'user' | 'assistant'; html: string }> = [];
    for (let i = 0; i < 8; i++) {
      turns.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        html: `<p>This is turn number ${i}. It has some real content that the salience pass should summarize down to a single line.</p>`,
      });
    }
    const conv = makeConvo(turns);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 10_000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    // Last 2 are verbatim.
    expect(cc.messages[6]?.provenance.kind).toBe('verbatim');
    expect(cc.messages[7]?.provenance.kind).toBe('verbatim');
    // Earlier ones are summarized.
    expect(cc.messages[0]?.provenance.kind).toBe('summarized');
    expect(cc.messages[3]?.provenance.kind).toBe('summarized');
  });

  it('preserves code blocks in summarized turns when preserveCodeBlocks=true', () => {
    const conv = makeConvo([
      {
        role: 'assistant',
        html:
          '<p>here is some code:</p><pre><code class="language-ts">const x = 1;</code></pre>',
      },
      { role: 'user', html: '<p>thanks</p>' },
      { role: 'assistant', html: '<p>welcome</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 10_000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const m0 = cc.messages[0]!;
    expect(m0.provenance.kind).toBe('summarized');
    expect(m0.blocks.some((b) => b.kind === 'code')).toBe(true);
    expect(m0.content).toMatch(/const x = 1/);
  });

  it('truncate pass drops oldest non-verbatim first when over budget', () => {
    const fat = '<p>' + 'word '.repeat(400) + '</p>';
    const conv = makeConvo([
      { role: 'user', html: fat },
      { role: 'assistant', html: fat },
      { role: 'user', html: fat },
      { role: 'assistant', html: fat },
      { role: 'user', html: '<p>recent q</p>' },
      { role: 'assistant', html: '<p>recent a</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 50,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: false,
    });
    // Recent window untouched.
    expect(cc.messages[4]?.provenance.kind).toBe('verbatim');
    expect(cc.messages[5]?.provenance.kind).toBe('verbatim');
    // Some older message was dropped.
    const droppedCount = cc.messages.filter((m) => m.provenance.kind === 'dropped').length;
    expect(droppedCount).toBeGreaterThan(0);
  });

  it('is deterministic on identical input modulo ids/timestamps', () => {
    const conv = makeConvo([
      { role: 'user', html: '<p>q</p>' },
      { role: 'assistant', html: '<p>a</p>' },
    ]);
    const a = structuralStrategy.compress(conv, {
      targetTokens: 10_000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const b = structuralStrategy.compress(conv, {
      targetTokens: 10_000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    expect(a.messages.map((m) => m.content)).toEqual(b.messages.map((m) => m.content));
    expect(a.messages.map((m) => m.provenance.kind)).toEqual(
      b.messages.map((m) => m.provenance.kind)
    );
  });
});
