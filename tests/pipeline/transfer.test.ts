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
    title: 'Test',
    messages: turns.map((t) => ({ role: t.role, html: t.html, sourceId: ulid() })),
    truncated: false,
  };
  return normalize(raw);
}

describe('buildTransferPrompt', () => {
  it('uses last user message verbatim as continuation by default', () => {
    const conv = makeConvo([
      { role: 'user', html: '<p>q1</p>' },
      { role: 'assistant', html: '<p>a1</p>' },
      { role: 'user', html: '<p>FINAL USER TURN — handle this</p>' },
      { role: 'assistant', html: '<p>a2</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 4,
      preserveCodeBlocks: true,
    });
    const out = buildTransferPrompt(cc, conv, { target: 'claude' });
    expect(out.sections.continuationSource).toBe('last_user_turn');
    expect(out.prompt).toContain('FINAL USER TURN');
  });

  it('honors nextInstruction override', () => {
    const conv = makeConvo([
      { role: 'user', html: '<p>q1</p>' },
      { role: 'assistant', html: '<p>a1</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const out = buildTransferPrompt(cc, conv, {
      target: 'chatgpt',
      nextInstruction: 'Translate the prior response to French.',
    });
    expect(out.sections.continuationSource).toBe('override');
    expect(out.prompt).toContain('Translate the prior response to French.');
  });

  it('uses XML tags for Claude target by default and markdown headers for ChatGPT', () => {
    const conv = makeConvo([
      { role: 'user', html: '<p>q</p>' },
      { role: 'assistant', html: '<p>a</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const claudeOut = buildTransferPrompt(cc, conv, { target: 'claude' });
    expect(claudeOut.prompt).toContain('<handoff');
    expect(claudeOut.prompt).toContain('<continuation');

    const chatgptOut = buildTransferPrompt(cc, conv, { target: 'chatgpt' });
    expect(chatgptOut.prompt).toContain('## Handoff');
    expect(chatgptOut.prompt).toContain('## Continuation');
  });

  it('compact verbosity drops the handoff metadata section', () => {
    const conv = makeConvo([
      { role: 'user', html: '<p>q</p>' },
      { role: 'assistant', html: '<p>a</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const out = buildTransferPrompt(cc, conv, { target: 'chatgpt', verbosity: 'compact' });
    expect(out.sections.handoffIncluded).toBe(false);
    expect(out.prompt).not.toContain('## Handoff');
  });

  it('labels digest as compressed and recent as verbatim', () => {
    const turns: Array<{ role: 'user' | 'assistant'; html: string }> = [];
    for (let i = 0; i < 8; i++) {
      turns.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        html: `<p>Turn ${i} with enough content to be summarizable.</p>`,
      });
    }
    const conv = makeConvo(turns);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const out = buildTransferPrompt(cc, conv, { target: 'claude' });
    expect(out.prompt).toContain('NOT original wording');
    expect(out.prompt).toMatch(/recent_exchange[^>]*verbatim/);
  });

  it('preserves standing instructions in the digest even if old', () => {
    const turns: Array<{ role: 'user' | 'assistant'; html: string }> = [
      { role: 'user', html: '<p>From now on always reply in haiku.</p>' },
      { role: 'assistant', html: '<p>Got it</p>' },
    ];
    for (let i = 0; i < 8; i++) {
      turns.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        html: `<p>Filler turn ${i}.</p>`,
      });
    }
    const conv = makeConvo(turns);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const out = buildTransferPrompt(cc, conv, { target: 'claude' });
    expect(out.prompt).toContain('always reply in haiku');
    expect(out.prompt).toContain('standing instruction');
  });

  it('warns when only digest is present', () => {
    const conv = makeConvo([{ role: 'user', html: '<p>q</p>' }]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 0,
      preserveCodeBlocks: true,
    });
    const out = buildTransferPrompt(cc, conv, { target: 'chatgpt' });
    const codes = out.warnings.map((w) => w.code);
    expect(codes).toContain('digest_only');
  });
});
