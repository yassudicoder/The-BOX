import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ulid } from 'ulid';
import { TrimNotice } from '../../src/sidepanel/components/TrimNotice';
import {
  BUDGET_CEILING,
  formatBudget,
  nextBudgetTier,
} from '../../src/sidepanel/components/TrimNotice.helpers';
import type { Conversation, Message } from '../../src/types/conversation';
import type {
  CompressedConversation,
  CompressedMessage,
} from '../../src/pipeline/compress/types';

/**
 * Build a minimal Conversation + CompressedConversation pair with `dropped`
 * budget-dropped messages, each shadowing a real source message that
 * supplies the originalTokens count for the notice's "(~X tokens)" figure.
 */
function makeFixture({
  dropped,
  originalTokensEach = 200,
}: {
  dropped: number;
  originalTokensEach?: number;
}): { compressed: CompressedConversation; source: Conversation } {
  const sourceMessages: Message[] = [];
  const compressedMessages: CompressedMessage[] = [];
  for (let i = 0; i < dropped; i++) {
    const srcId = ulid();
    sourceMessages.push({
      id: srcId,
      role: 'user',
      content: 'x'.repeat(originalTokensEach * 4),
      blocks: [{ kind: 'text', markdown: 'x' }],
      approxTokens: originalTokensEach,
    });
    compressedMessages.push({
      id: ulid(),
      role: 'user',
      content: '',
      blocks: [],
      approxTokens: 0,
      provenance: {
        kind: 'dropped',
        sourceMessageId: srcId,
        reason: 'token budget',
      },
    });
  }
  const source: Conversation = {
    schemaVersion: 1,
    id: ulid(),
    source: {
      platform: 'claude',
      url: 'https://claude.ai/x',
      capturedAt: new Date().toISOString(),
    },
    messages: sourceMessages,
    stats: {
      messageCount: sourceMessages.length,
      approxTokens: dropped * originalTokensEach,
      truncated: false,
    },
  };
  const compressed: CompressedConversation = {
    schemaVersion: 1,
    id: ulid(),
    sourceConversationId: source.id,
    strategyId: 'structural',
    createdAt: new Date().toISOString(),
    targetTokens: 8000,
    messages: compressedMessages,
    stats: {
      originalMessageCount: sourceMessages.length,
      keptVerbatimCount: 0,
      summarizedCount: 0,
      droppedCount: dropped,
      syntheticCount: 0,
      originalTokens: dropped * originalTokensEach,
      compressedTokens: 0,
    },
    passes: [],
  };
  return { compressed, source };
}

function renderHtml(props: React.ComponentProps<typeof TrimNotice>): string {
  // React inserts <!-- --> comment delimiters between adjacent JSX text and
  // expression children; strip them so substring assertions read naturally
  // ("Increase to 32K" instead of "Increase to <!-- -->32K").
  return renderToString(React.createElement(TrimNotice, props)).replace(
    /<!--\s*-->/g,
    ''
  );
}

describe('nextBudgetTier', () => {
  it.each([
    [4_000, 8_000],
    [8_000, 16_000],
    [16_000, 32_000],
    [32_000, 64_000],
    [64_000, 128_000],
    [128_000, null],
    [200_000, null],
  ] as const)('nextBudgetTier(%d) → %s', (current, expected) => {
    expect(nextBudgetTier(current)).toBe(expected);
  });
});

describe('formatBudget', () => {
  it.each([
    [500, '500'],
    [8_000, '8K'],
    [32_000, '32K'],
    [128_000, '128K'],
  ] as const)('formatBudget(%d) → %s', (n, expected) => {
    expect(formatBudget(n)).toBe(expected);
  });

  it('BUDGET_CEILING is 128K', () => {
    expect(BUDGET_CEILING).toBe(128_000);
  });
});

describe('TrimNotice rendering', () => {
  it('renders nothing when no budget-driven drops exist', () => {
    const { compressed, source } = makeFixture({ dropped: 0 });
    const html = renderHtml({
      compressed,
      source,
      currentBudget: 32_000,
      onIncreaseBudget: () => {},
    });
    expect(html).toBe('');
  });

  it('renders count, original tokens, and current budget when drops exist', () => {
    const { compressed, source } = makeFixture({
      dropped: 5,
      originalTokensEach: 200,
    });
    const html = renderHtml({
      compressed,
      source,
      currentBudget: 16_000,
      onIncreaseBudget: () => {},
    });
    expect(html).toContain('5 older messages set aside');
    expect(html).toContain('1,000 tokens');
    expect(html).toContain('16K');
  });

  it('singularizes "older message" when count is 1', () => {
    const { compressed, source } = makeFixture({ dropped: 1 });
    const html = renderHtml({
      compressed,
      source,
      currentBudget: 8_000,
      onIncreaseBudget: () => {},
    });
    expect(html).toContain('1 older message set aside');
    expect(html).not.toContain('older messages set');
  });

  it('includes the "Why was this trimmed?" expand affordance', () => {
    const { compressed, source } = makeFixture({ dropped: 3 });
    const html = renderHtml({
      compressed,
      source,
      currentBudget: 16_000,
      onIncreaseBudget: () => {},
    });
    expect(html).toContain('Why was this trimmed?');
    // The explanation content is in the DOM (collapsed by <details>) so it
    // appears in the rendered HTML; this is the toggle revealing content
    // test in the form available without a real browser.
    expect(html).toContain('keep the prompt within budget');
  });

  it('does not surface internal pipeline vocabulary', () => {
    const { compressed, source } = makeFixture({ dropped: 3 });
    const html = renderHtml({
      compressed,
      source,
      currentBudget: 16_000,
      onIncreaseBudget: () => {},
    }).toLowerCase();
    expect(html).not.toContain('digest');
    expect(html).not.toContain('provenance');
    expect(html).not.toContain('salience');
    expect(html).not.toContain('k turns');
  });

  it('renders "Increase to <next tier>" button when below ceiling', () => {
    const { compressed, source } = makeFixture({ dropped: 3 });
    const html = renderHtml({
      compressed,
      source,
      currentBudget: 16_000,
      onIncreaseBudget: () => {},
    });
    expect(html).toContain('Increase to 32K');
  });

  it('uses the agreed tier ladder for the suggestion label', () => {
    const { compressed, source } = makeFixture({ dropped: 3 });
    const cases: Array<[number, string]> = [
      [8_000, 'Increase to 16K'],
      [16_000, 'Increase to 32K'],
      [32_000, 'Increase to 64K'],
      [64_000, 'Increase to 128K'],
    ];
    for (const [current, expectedLabel] of cases) {
      const html = renderHtml({
        compressed,
        source,
        currentBudget: current,
        onIncreaseBudget: () => {},
      });
      expect(html).toContain(expectedLabel);
    }
  });

  it('omits the Increase button at the ceiling', () => {
    const { compressed, source } = makeFixture({ dropped: 3 });
    const html = renderHtml({
      compressed,
      source,
      currentBudget: BUDGET_CEILING,
      onIncreaseBudget: () => {},
    });
    expect(html).not.toContain('Increase to');
  });

  it('omits the Increase button beyond the ceiling', () => {
    const { compressed, source } = makeFixture({ dropped: 3 });
    const html = renderHtml({
      compressed,
      source,
      currentBudget: 200_000,
      onIncreaseBudget: () => {},
    });
    expect(html).not.toContain('Increase to');
  });
});

describe('TrimNotice interaction', () => {
  it('fires onIncreaseBudget when the Increase button is clicked', () => {
    const onIncrease = vi.fn();
    const { compressed, source } = makeFixture({ dropped: 3 });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
      root.render(
        React.createElement(TrimNotice, {
          compressed,
          source,
          currentBudget: 16_000,
          onIncreaseBudget: onIncrease,
        })
      );
    });
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('Increase to 32K');
    button?.click();
    expect(onIncrease).toHaveBeenCalledTimes(1);
    flushSync(() => root.unmount());
    container.remove();
  });
});
