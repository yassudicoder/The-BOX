import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../src/adapters/claude/ClaudeAdapter';
import { normalize } from '../../src/pipeline/normalize';
import { loadFixture } from '../helpers/loadFixture';

const adapter = new ClaudeAdapter();
const ctx = {
  signal: new AbortController().signal,
  scrollToLoadAll: async () => {},
};

describe('ClaudeAdapter', () => {
  it('matches claude.ai only', () => {
    expect(adapter.matches(new URL('https://claude.ai/chat/abc'))).toBe(true);
    expect(adapter.matches(new URL('https://chat.openai.com/'))).toBe(false);
  });

  it('extracts alternating user/assistant turns', async () => {
    const doc = loadFixture('claude/basic.html', 'https://claude.ai/chat/test');
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

  it('rewrites Claude artifact cards into Artifact blocks', async () => {
    const doc = loadFixture('claude/with-artifact.html', 'https://claude.ai/chat/test');
    const raw = await adapter.extract({ ...ctx, doc });
    const conv = normalize(raw);
    const assistant = conv.messages[1]!;
    const artifact = assistant.blocks.find((b) => b.kind === 'artifact');
    expect(artifact).toBeDefined();
    if (artifact && artifact.kind === 'artifact') {
      expect(artifact.identifier).toBe('art-counter');
      expect(artifact.title).toBe('Counter component');
      expect(artifact.language).toBe('tsx');
      expect(artifact.mimeType).toBe('application/vnd.ant.react');
      expect(artifact.content).toContain('useState');
    }
  });
});
