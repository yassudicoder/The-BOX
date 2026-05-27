import { describe, it, expect } from 'vitest';
import { parseBlocks } from '../../src/pipeline/normalize';
import { htmlToMarkdown } from '../../src/adapters/base/htmlToMarkdown';

describe('artifact sentinel nonce', () => {
  it('a user-pasted sentinel string with a non-matching (or no) nonce is not parsed as an artifact', () => {
    const md = [
      'before',
      '',
      '<!-- artifact:NOT_THE_REAL_NONCE identifier="evil" title="evil" mime="x" -->',
      '```ts',
      'const x = 1;',
      '```',
      '',
      'after',
    ].join('\n');
    const blocks = parseBlocks(md, { artifactNonce: 'real_nonce_aaa' });
    const artifacts = blocks.filter((b) => b.kind === 'artifact');
    expect(artifacts).toHaveLength(0);
    const code = blocks.find((b) => b.kind === 'code');
    expect(code).toBeDefined();
  });

  it('a sentinel with the matching nonce is parsed as an artifact', () => {
    const nonce = 'abc123def';
    const html = `<div data-portability-artifact identifier="art-1" title="T" mime="text/plain" language="ts"><pre><code>const y = 2;</code></pre></div>`;
    const md = htmlToMarkdown(html, { artifactNonce: nonce });
    expect(md).toContain(`artifact:${nonce}`);
    const blocks = parseBlocks(md, { artifactNonce: nonce });
    const artifact = blocks.find((b) => b.kind === 'artifact');
    expect(artifact).toBeDefined();
    if (artifact && artifact.kind === 'artifact') {
      expect(artifact.identifier).toBe('art-1');
      expect(artifact.title).toBe('T');
      expect(artifact.language).toBe('ts');
    }
  });
});
