import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { normalize } from '../../src/pipeline/normalize';
import { structuralStrategy } from '../../src/pipeline/compress';
import {
  buildTransferPrompt,
  emptyCompose,
} from '../../src/pipeline/transfer';
import {
  listTransferTargets,
  resolveTransferAdapter,
} from '../../src/pipeline/transfer/adapters';
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

describe('transfer adapters registry', () => {
  it('exposes claude, chatgpt, gemini', () => {
    const ids = listTransferTargets().map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['claude', 'chatgpt', 'gemini']));
  });
  it('each adapter declares a sectionOrder and defaults', () => {
    for (const a of listTransferTargets()) {
      expect(a.sectionOrder.length).toBeGreaterThan(0);
      expect(a.defaults).toBeDefined();
    }
  });
});

describe('per-target output', () => {
  const conv = makeConvo([
    { role: 'user', html: '<p>q</p>' },
    { role: 'assistant', html: '<p>a</p>' },
  ]);
  const cc = structuralStrategy.compress(conv, {
    targetTokens: 5000,
    recentTurnsVerbatim: 2,
    preserveCodeBlocks: true,
  });

  it('claude wraps sections in XML tags', () => {
    const out = buildTransferPrompt(cc, conv, { target: 'claude' });
    expect(out.prompt).toContain('<handoff');
    expect(out.prompt).toContain('<continuation');
  });

  it('chatgpt uses markdown headers', () => {
    const out = buildTransferPrompt(cc, conv, { target: 'chatgpt' });
    expect(out.prompt).toContain('## Handoff');
    expect(out.prompt).toContain('## Continuation');
  });

  it('gemini leads with the continuation per its sectionOrder', () => {
    const out = buildTransferPrompt(cc, conv, { target: 'gemini' });
    // The intro line precedes anything else; the first heading after it
    // should be the gemini-specific "Your task" heading.
    const introLength = out.prompt.indexOf('\n\n');
    const tail = out.prompt.slice(introLength);
    const taskIdx = tail.indexOf('## Your task');
    const handoffIdx = tail.indexOf('## Context metadata');
    expect(taskIdx).toBeGreaterThan(-1);
    expect(taskIdx).toBeLessThan(handoffIdx);
  });
});

describe('compose state', () => {
  const conv = makeConvo([
    { role: 'user', html: '<p>From now on always use brief replies.</p>' },
    { role: 'assistant', html: '<p>ok</p>' },
    { role: 'user', html: '<p>actual question</p>' },
    { role: 'assistant', html: '<p>actual answer</p>' },
  ]);
  const cc = structuralStrategy.compress(conv, {
    targetTokens: 5000,
    recentTurnsVerbatim: 2,
    preserveCodeBlocks: true,
  });

  it('toggling off `instructions` removes the standing-instruction message body from output', () => {
    const compose = emptyCompose();
    compose.sectionToggles.instructions = false;
    const out = buildTransferPrompt(cc, conv, { target: 'chatgpt' }, compose);
    // The instruction may still appear in the auto-derived topic line of
    // the handoff; what matters is that no message body is rendered for it.
    expect(out.prompt).not.toContain('_(standing instruction)_');
  });

  it('toggling off everything produces a blocker warning', () => {
    const compose = emptyCompose();
    compose.sectionToggles.digest = false;
    compose.sectionToggles.recent = false;
    const out = buildTransferPrompt(cc, conv, { target: 'chatgpt' }, compose);
    const blockers = out.warnings.filter((w) => w.severity === 'blocker');
    expect(blockers.map((w) => w.code)).toContain('all_dropped_by_compose');
  });

  it('excludedMessageIds skip a specific message', () => {
    const target = cc.messages[1]!;
    const compose = emptyCompose();
    compose.excludedMessageIds = new Set([target.id]);
    const out = buildTransferPrompt(cc, conv, { target: 'chatgpt' }, compose);
    expect(out.prompt).not.toContain(target.content);
  });
});

describe('default options come from the adapter, not the orchestrator', () => {
  it('claude default useXmlTags is true; chatgpt default is false', () => {
    expect(resolveTransferAdapter('claude').defaults.useXmlTags).toBe(true);
    expect(resolveTransferAdapter('chatgpt').defaults.useXmlTags).toBe(false);
  });
});
