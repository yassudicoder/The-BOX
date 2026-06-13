import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { normalize } from '../../src/pipeline/normalize';
import { structuralStrategy } from '../../src/pipeline/compress';
import { buildTransferPrompt } from '../../src/pipeline/transfer';
import { exportMarkdown } from '../../src/export/markdown';
import { buildBundle } from '../../src/export/json';
import type { Conversation } from '../../src/types/conversation';
import type { RawConversation } from '../../src/types/raw';

function makeConvo(truncated: boolean): Conversation {
  const raw: RawConversation = {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/test',
    title: 'Test',
    messages: [
      { role: 'user', html: '<p>q1</p>', sourceId: ulid() },
      { role: 'assistant', html: '<p>a1</p>', sourceId: ulid() },
    ],
    truncated,
  };
  return normalize(raw);
}

function compress(conv: Conversation) {
  return structuralStrategy.compress(conv, {
    targetTokens: 5000,
    recentTurnsVerbatim: 4,
    preserveCodeBlocks: true,
  });
}

describe('incomplete-capture flag is surfaced everywhere', () => {
  it('transfer prompt: emits extraction_partial warning AND embeds a note when truncated', () => {
    const conv = makeConvo(true);
    const out = buildTransferPrompt(compress(conv), conv, { target: 'claude' });
    expect(out.warnings.map((w) => w.code)).toContain('extraction_partial');
    expect(out.prompt.toLowerCase()).toContain('may be incomplete');
  });

  it('transfer prompt: clean capture has no extraction_partial warning or note', () => {
    const conv = makeConvo(false);
    const out = buildTransferPrompt(compress(conv), conv, { target: 'claude' });
    expect(out.warnings.map((w) => w.code)).not.toContain('extraction_partial');
    expect(out.prompt.toLowerCase()).not.toContain('may be incomplete');
  });

  it('markdown export: includes an incomplete note only when truncated', () => {
    expect(exportMarkdown(makeConvo(true)).toLowerCase()).toContain('may be incomplete');
    expect(exportMarkdown(makeConvo(false)).toLowerCase()).not.toContain('may be incomplete');
  });

  it('json bundle: carries the truncated fact on the conversation', () => {
    const bundle = buildBundle({ conversation: makeConvo(true) });
    expect(bundle.conversation.stats.truncated).toBe(true);
  });
});
