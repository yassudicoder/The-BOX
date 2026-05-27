import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { normalize } from '../../src/pipeline/normalize';
import { structuralStrategy } from '../../src/pipeline/compress';
import { viewOf, statusOf, labelOf } from '../../src/core/provenance';
import type { Conversation } from '../../src/types/conversation';
import type { RawConversation } from '../../src/types/raw';

function makeConvo(turns: Array<{ role: 'user' | 'assistant'; html: string }>): Conversation {
  const raw: RawConversation = {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/x',
    messages: turns.map((t) => ({ role: t.role, html: t.html, sourceId: ulid() })),
    truncated: false,
  };
  return normalize(raw);
}

describe('provenance view', () => {
  it('maps every CompressedMessage to a ProvenanceView with non-null status and label', () => {
    const turns: Array<{ role: 'user' | 'assistant'; html: string }> = [];
    for (let i = 0; i < 8; i++) {
      turns.push({ role: i % 2 === 0 ? 'user' : 'assistant', html: `<p>turn ${i} content</p>` });
    }
    const conv = makeConvo(turns);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 4000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    for (const m of cc.messages) {
      const v = viewOf(m, conv, cc);
      expect(v.status).toBeDefined();
      expect(v.label).toBeDefined();
      expect(v.label).toBe(labelOf(statusOf(m.provenance)));
    }
  });

  it('attributes the pass that produced the provenance', () => {
    const turns: Array<{ role: 'user' | 'assistant'; html: string }> = [
      { role: 'user', html: '<p>From now on, always answer briefly.</p>' },
      { role: 'assistant', html: '<p>ok</p>' },
      { role: 'user', html: '<p>more</p>' },
      { role: 'assistant', html: '<p>more</p>' },
    ];
    const conv = makeConvo(turns);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 4000,
      recentTurnsVerbatim: 1,
      preserveCodeBlocks: true,
    });
    const instr = cc.messages[0]!;
    const view = viewOf(instr, conv, cc);
    expect(view.status).toBe('instruction');
    expect(view.attributedPass).toBe('instructions');
  });

  it('reports negative tokenDelta for summarized messages', () => {
    const turns: Array<{ role: 'user' | 'assistant'; html: string }> = [
      { role: 'user', html: '<p>' + 'word '.repeat(200) + '</p>' },
      { role: 'assistant', html: '<p>thanks</p>' },
      { role: 'user', html: '<p>more</p>' },
      { role: 'assistant', html: '<p>more</p>' },
    ];
    const conv = makeConvo(turns);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 4000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const summarized = cc.messages.find(
      (m) => m.provenance.kind === 'summarized'
    )!;
    const view = viewOf(summarized, conv, cc);
    expect(view.tokenDelta).not.toBeNull();
    expect(view.tokenDelta!).toBeLessThan(0);
  });
});
