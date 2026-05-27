import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { normalize } from '../../src/pipeline/normalize';
import { structuralStrategy } from '../../src/pipeline/compress';
import {
  detectInstruction,
  looksLikeInstruction,
} from '../../src/pipeline/compress/passes/instructions';
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

describe('instruction detection — true positives', () => {
  const positives = [
    'From now on always reply in French',
    'Never use semicolons.',
    'Rule: 80-char line limit',
    'Important: do not invent identifiers.',
    "Remember that we're targeting Node 20.",
    'Going forward, always include a TL;DR at the top.',
    'Note: keep responses under 3 paragraphs.',
    'Constraint: no external dependencies.',
  ];
  for (const text of positives) {
    it(`matches: "${text}"`, () => {
      expect(detectInstruction(text).matched).toBe(true);
    });
  }
});

describe('instruction detection — conversational false-positive guards', () => {
  const negatives = [
    "I've always wondered why people do that.",
    "I always thought of it as a side project.",
    'What is the capital of France?',
    'Can you help me debug this?',
    'I do not know the answer to that.',
    'Why do they always change the API?',
    "I have always loved this kind of problem.",
  ];
  for (const text of negatives) {
    it(`does not match conversational phrase: "${text}"`, () => {
      expect(detectInstruction(text).matched).toBe(false);
    });
  }
});

describe('instruction detection — bounds', () => {
  it('returns reason when matched', () => {
    const hit = detectInstruction('Rule: prefer functional style.');
    expect(hit.matched).toBe(true);
    expect(hit.reason).toBeDefined();
  });
  it('ignores essays', () => {
    const long = 'always be specific. '.repeat(60);
    expect(detectInstruction(long).matched).toBe(false);
  });
  it('legacy boolean API still works', () => {
    expect(looksLikeInstruction('Never edit the lockfile.')).toBe(true);
  });
});

describe('instructionPass via structural strategy', () => {
  it('preserves old user instruction turns verbatim with reason=instruction', () => {
    const turns: Array<{ role: 'user' | 'assistant'; html: string }> = [
      { role: 'user', html: '<p>From now on, always answer in one sentence.</p>' },
      { role: 'assistant', html: '<p>Understood.</p>' },
    ];
    for (let i = 0; i < 8; i++) {
      turns.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        html: `<p>Some intervening turn ${i} with content.</p>`,
      });
    }
    const conv = makeConvo(turns);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const first = cc.messages[0]!;
    expect(first.provenance.kind).toBe('verbatim');
    if (first.provenance.kind === 'verbatim') {
      expect(first.provenance.reason).toBe('instruction');
    }
  });
});
