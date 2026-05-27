import TurndownService from 'turndown';
// @ts-expect-error: no types
import { gfm } from 'turndown-plugin-gfm';

export interface HtmlToMarkdownOptions {
  /**
   * Random per-extraction token mixed into the artifact sentinel so that
   * user-pasted text containing the bare sentinel cannot be misparsed as an
   * artifact downstream. Must match the nonce passed to parseBlocks.
   */
  artifactNonce?: string;
}

export function htmlToMarkdown(html: string, opts: HtmlToMarkdownOptions = {}): string {
  return createTurndown(opts.artifactNonce ?? '').turndown(html).trim();
}

function createTurndown(artifactNonce: string): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
  });
  td.use(gfm);

  td.addRule('fencedCodeWithLang', {
    filter: (node) =>
      node.nodeName === 'PRE' &&
      node.firstChild !== null &&
      (node.firstChild as Element).nodeName === 'CODE',
    replacement: (_content, node) => {
      const codeEl = (node as Element).querySelector('code');
      if (!codeEl) return '';
      const lang = detectLanguage(codeEl);
      const code = (codeEl.textContent ?? '').replace(/\n+$/, '');
      const fence = pickFence(code);
      return `\n\n${fence}${lang ?? ''}\n${code}\n${fence}\n\n`;
    },
  });

  td.addRule('artifact', {
    filter: (node) =>
      node.nodeType === 1 &&
      (node as Element).hasAttribute?.('data-portability-artifact'),
    replacement: (_content, node) => {
      const el = node as Element;
      const codeEl = el.querySelector('code');
      const inner = (codeEl?.textContent ?? el.textContent ?? '').replace(/\n+$/, '');
      const lang = el.getAttribute('language') ?? '';
      const title = (el.getAttribute('title') ?? '').replace(/"/g, '\\"');
      const identifier = (el.getAttribute('identifier') ?? '').replace(/"/g, '\\"');
      const mime = (el.getAttribute('mime') ?? '').replace(/"/g, '\\"');
      const fence = pickFence(inner);
      const meta = `<!-- artifact:${artifactNonce} identifier="${identifier}" title="${title}" mime="${mime}" -->`;
      return `\n\n${meta}\n${fence}${lang}\n${inner}\n${fence}\n\n`;
    },
  });

  td.addRule('katex', {
    filter: (node) =>
      node.nodeType === 1 && ((node as Element).classList?.contains('katex') ?? false),
    replacement: (_content, node) => {
      const tex =
        (node as Element).querySelector('annotation[encoding*="tex"]')?.textContent ?? '';
      return tex ? `$${tex}$` : '';
    },
  });

  td.addRule('dropButtons', {
    filter: (node) => node.nodeName === 'BUTTON',
    replacement: () => '',
  });

  return td;
}

function detectLanguage(codeEl: Element): string | null {
  const cls = codeEl.className || '';
  const match = cls.match(/language-([\w+-]+)/);
  if (match && match[1]) return match[1];
  const header = codeEl.closest('pre')?.previousElementSibling;
  if (header) {
    const label = header.textContent?.trim().toLowerCase();
    if (label && /^[a-z0-9+#-]+$/i.test(label) && label.length <= 20) return label;
  }
  return null;
}

export function pickFence(content: string): string {
  let max = 0;
  const re = /`+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[0].length > max) max = m[0].length;
  }
  return '`'.repeat(Math.max(3, max + 1));
}
