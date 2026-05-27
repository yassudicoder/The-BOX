import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { normalize } from '../../src/pipeline/normalize';
import { structuralStrategy } from '../../src/pipeline/compress';
import {
  detectAssistantRuleProposal,
  isShortConfirmation,
} from '../../src/pipeline/compress/passes/assistantRules';
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

describe('detectAssistantRuleProposal', () => {
  it('matches durable workflow proposals', () => {
    expect(detectAssistantRuleProposal("I'll always include test plans.")).toBe(true);
    expect(detectAssistantRuleProposal('Going forward, I\'ll respect the 80-char limit.')).toBe(
      true
    );
    expect(detectAssistantRuleProposal('Got it, I\'ll use snake_case throughout.')).toBe(true);
  });

  it('does not match ordinary acknowledgements', () => {
    expect(detectAssistantRuleProposal('Sure, here is the answer.')).toBe(false);
    expect(detectAssistantRuleProposal("That's a great question.")).toBe(false);
  });
});

describe('isShortConfirmation', () => {
  it('accepts common confirmations', () => {
    expect(isShortConfirmation('ok')).toBe(true);
    expect(isShortConfirmation('great')).toBe(true);
    expect(isShortConfirmation('thanks')).toBe(true);
    expect(isShortConfirmation('sounds good')).toBe(true);
  });
  it('rejects non-confirmations', () => {
    expect(isShortConfirmation('no, actually let\'s do X')).toBe(false);
    expect(isShortConfirmation('I disagree')).toBe(false);
  });
});

describe('assistantRulesPass', () => {
  it('preserves an assistant rule when the next user turn is a short confirmation', () => {
    const conv = makeConvo([
      { role: 'user', html: '<p>Pls keep replies brief.</p>' },
      {
        role: 'assistant',
        html: '<p>Got it, I\'ll always reply in one paragraph.</p>',
      },
      { role: 'user', html: '<p>thanks</p>' },
      { role: 'assistant', html: '<p>great</p>' },
      { role: 'user', html: '<p>so anyway</p>' },
      { role: 'assistant', html: '<p>(many tokens of filler)</p>' },
      { role: 'user', html: '<p>and another thing</p>' },
      { role: 'assistant', html: '<p>okay</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const assistantRule = cc.messages[1]!;
    expect(assistantRule.provenance.kind).toBe('verbatim');
    if (assistantRule.provenance.kind === 'verbatim') {
      expect(assistantRule.provenance.reason).toBe('instruction');
    }
  });

  it('does not preserve when the next user turn rejects or pivots', () => {
    const conv = makeConvo([
      { role: 'user', html: '<p>What do you think?</p>' },
      {
        role: 'assistant',
        html: '<p>Going forward, I\'ll always use semicolons.</p>',
      },
      {
        role: 'user',
        html:
          '<p>no, actually let\'s avoid semicolons — they break the style guide.</p>',
      },
      { role: 'assistant', html: '<p>understood</p>' },
      { role: 'user', html: '<p>continue</p>' },
      { role: 'assistant', html: '<p>more content</p>' },
    ]);
    const cc = structuralStrategy.compress(conv, {
      targetTokens: 5000,
      recentTurnsVerbatim: 2,
      preserveCodeBlocks: true,
    });
    const proposal = cc.messages[1]!;
    if (proposal.provenance.kind === 'verbatim') {
      expect(proposal.provenance.reason).not.toBe('instruction');
    }
  });
});
