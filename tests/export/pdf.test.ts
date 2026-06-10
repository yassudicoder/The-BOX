import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import { buildPdf, exportPdf } from '../../src/export/pdf';
import type { Block, Conversation, Message } from '../../src/types/conversation';

function conversation(messages: Message[]): Conversation {
  const approxTokens = messages.reduce((s, m) => s + m.approxTokens, 0);
  return {
    schemaVersion: 1,
    id: ulid(),
    source: {
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/x',
      title: 'PDF export test',
      model: 'gpt-4o',
      capturedAt: '2026-06-10T14:30:00.000Z',
    },
    messages,
    stats: { messageCount: messages.length, approxTokens, truncated: false },
  };
}

function textMsg(role: Message['role'], content: string): Message {
  return { id: ulid(), role, content, blocks: [{ kind: 'text', markdown: content }], approxTokens: 10 };
}

function magic(buf: ArrayBuffer): string {
  return String.fromCharCode(...new Uint8Array(buf).slice(0, 5));
}

describe('exportPdf', () => {
  it('emits valid PDF bytes', () => {
    const buf = exportPdf(conversation([textMsg('user', 'hello'), textMsg('assistant', 'hi')]));
    expect(magic(buf)).toBe('%PDF-');
    expect(buf.byteLength).toBeGreaterThan(500);
  });

  it('paginates a long conversation across multiple pages', () => {
    const many: Message[] = [];
    for (let i = 0; i < 60; i++) {
      many.push(textMsg(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}\n` + 'word '.repeat(40)));
    }
    const doc = buildPdf(conversation(many));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('renders every block kind without throwing', () => {
    const blocks: Block[] = [
      { kind: 'text', markdown: 'plain text' },
      { kind: 'code', language: 'ts', code: 'const x = 1;\nconst y = 2;' },
      { kind: 'artifact', identifier: 'a1', title: 'Doc', language: 'md', mimeType: 'text/markdown', content: '# hi' },
      { kind: 'math', tex: 'E = mc^2' },
      { kind: 'image', alt: 'a chart', src: 'https://example.com/c.png' },
      { kind: 'tool_call', name: 'search', payload: '{"q":"x"}' },
      { kind: 'tool_result', payload: 'result text' },
    ];
    const msg: Message = { id: ulid(), role: 'assistant', content: 'all blocks', blocks, approxTokens: 30 };
    expect(() => exportPdf(conversation([msg]))).not.toThrow();
  });

  it('wraps very long unbroken code without throwing or losing the page', () => {
    const code = 'x'.repeat(4000);
    const msg: Message = {
      id: ulid(),
      role: 'assistant',
      content: code,
      blocks: [{ kind: 'code', language: null, code }],
      approxTokens: 50,
    };
    const doc = buildPdf(conversation([msg]));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
