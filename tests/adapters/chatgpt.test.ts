import { describe, it, expect } from 'vitest';
import { ChatGPTAdapter } from '../../src/adapters/chatgpt/ChatGPTAdapter';
import { normalize } from '../../src/pipeline/normalize';
import { loadFixture } from '../helpers/loadFixture';

const adapter = new ChatGPTAdapter();
const ctx = {
  signal: new AbortController().signal,
  scrollToLoadAll: async () => {},
};

describe('ChatGPTAdapter', () => {
  it('matches chat.openai.com and chatgpt.com', () => {
    expect(adapter.matches(new URL('https://chat.openai.com/c/abc'))).toBe(true);
    expect(adapter.matches(new URL('https://chatgpt.com/c/abc'))).toBe(true);
    expect(adapter.matches(new URL('https://claude.ai/'))).toBe(false);
  });

  it('extracts user and assistant messages in order with code blocks', async () => {
    const doc = loadFixture('chatgpt/basic.html', 'https://chat.openai.com/c/test');
    const raw = await adapter.extract({ ...ctx, doc });
    expect(raw.messages).toHaveLength(4);
    expect(raw.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(raw.truncated).toBe(false);
  });

  it('handles code blocks with no language tag and detects null language', async () => {
    const doc = loadFixture(
      'chatgpt/no-language-code.html',
      'https://chatgpt.com/c/test'
    );
    const raw = await adapter.extract({ ...ctx, doc });
    const conv = normalize(raw);
    const assistant = conv.messages[1]!;
    const codeBlocks = assistant.blocks.filter((b) => b.kind === 'code');
    expect(codeBlocks).toHaveLength(2);
    expect(codeBlocks[0]?.kind === 'code' && codeBlocks[0].language).toBeNull();
    expect(codeBlocks[1]?.kind === 'code' && codeBlocks[1].language).toBeNull();
  });

  it('preserves nested fences via longer outer fence', async () => {
    const doc = loadFixture(
      'chatgpt/nested-fences.html',
      'https://chatgpt.com/c/test'
    );
    const raw = await adapter.extract({ ...ctx, doc });
    const conv = normalize(raw);
    const assistant = conv.messages[1]!;
    const code = assistant.blocks.find((b) => b.kind === 'code');
    expect(code).toBeDefined();
    expect(code!.kind === 'code' && code!.code.includes('```python')).toBe(true);
    // Outer fence in the rendered markdown must be longer than any inner run.
    expect(assistant.content).toMatch(/````+markdown/);
  });

  it('probe reports selector hits and version', () => {
    const doc = loadFixture('chatgpt/basic.html', 'https://chat.openai.com/c/test');
    const probe = adapter.probe(doc);
    expect(probe.selectorHits.message).toBe(true);
    expect(probe.version).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
