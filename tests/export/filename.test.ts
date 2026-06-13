import { describe, it, expect } from 'vitest';
import { sanitizeExportName } from '../../src/export/filename';

describe('sanitizeExportName', () => {
  it('keeps a plain title intact', () => {
    expect(sanitizeExportName('My chat')).toBe('My-chat');
  });

  it('strips filesystem-illegal characters', () => {
    expect(sanitizeExportName('a/b:c*?"<>|d')).toBe('abcd');
  });

  it('collapses runs of whitespace to single dashes', () => {
    expect(sanitizeExportName('  hello   world  ')).toBe('hello-world');
  });

  it('caps the length at 60 characters', () => {
    const long = 'x'.repeat(100);
    expect(sanitizeExportName(long)).toHaveLength(60);
  });

  it('falls back to "conversation" when nothing usable remains', () => {
    expect(sanitizeExportName('   ')).toBe('conversation');
    expect(sanitizeExportName('/:*?')).toBe('conversation');
    expect(sanitizeExportName('')).toBe('conversation');
  });
});
