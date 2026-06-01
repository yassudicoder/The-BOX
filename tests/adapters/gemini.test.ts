import { describe, it, expect } from 'vitest';
import { GeminiAdapter } from '../../src/adapters/gemini/GeminiAdapter';
import { normalize } from '../../src/pipeline/normalize';
import { loadFixture } from '../helpers/loadFixture';

const adapter = new GeminiAdapter();
const ctx = {
  signal: new AbortController().signal,
  scrollToLoadAll: async () => {},
};

describe('GeminiAdapter', () => {
  it('matches gemini.google.com only', () => {
    expect(adapter.matches(new URL('https://gemini.google.com/app'))).toBe(true);
    expect(adapter.matches(new URL('https://aistudio.google.com/'))).toBe(false);
    expect(adapter.matches(new URL('https://claude.ai/'))).toBe(false);
  });

  it('extracts alternating user/assistant turns', async () => {
    const doc = loadFixture('gemini/basic.html', 'https://gemini.google.com/app/abc');
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

  it('attaches the .conversation-container id as sourceId', async () => {
    const doc = loadFixture('gemini/basic.html', 'https://gemini.google.com/app/abc');
    const raw = await adapter.extract({ ...ctx, doc });
    expect(raw.messages[0]?.sourceId).toBe('70eca5bdaf4f3d32');
    expect(raw.messages[2]?.sourceId).toBe('a1b2c3d4e5f60718');
  });

  it('parses the model name from the picker aria-label', async () => {
    const doc = loadFixture('gemini/basic.html', 'https://gemini.google.com/app/abc');
    const raw = await adapter.extract({ ...ctx, doc });
    expect(raw.model).toBe('Gemini Flash-Lite');
  });

  it('reads the sidenav title', async () => {
    const doc = loadFixture('gemini/basic.html', 'https://gemini.google.com/app/abc');
    const raw = await adapter.extract({ ...ctx, doc });
    expect(raw.title).toBe('Explain monads');
  });

  it('strips Gemini screen-reader labels from user prompts', async () => {
    const doc = loadFixture('gemini/basic.html', 'https://gemini.google.com/app/abc');
    const raw = await adapter.extract({ ...ctx, doc });
    expect(raw.messages[0]?.html).not.toMatch(/You said/);
    expect(raw.messages[0]?.html).toMatch(/Explain monads/);
  });

  it('preserves fenced code blocks through normalization', async () => {
    const doc = loadFixture('gemini/basic.html', 'https://gemini.google.com/app/abc');
    const raw = await adapter.extract({ ...ctx, doc });
    const conv = normalize(raw);
    const assistant = conv.messages[3]!;
    const code = assistant.blocks.find((b) => b.kind === 'code');
    expect(code).toBeDefined();
    if (code && code.kind === 'code') {
      expect(code.language).toBe('ts');
      expect(code.code).toContain('type Maybe');
      expect(code.code).toContain("kind: 'none'");
    }
  });
});
