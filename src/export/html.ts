import type { Block, Conversation, Message, Role } from '../types/conversation';

/**
 * Self-contained HTML export of a captured conversation.
 *
 * Pure and framework-agnostic (no DOM, no React, no chrome.* APIs) — it only
 * builds a string, like the markdown/json exporters next to it. The output is
 * a single .html file with all CSS inlined, so:
 *   - it doubles as the print-to-PDF source (open + window.print()), giving us
 *     "PDF export" with zero dependencies;
 *   - images are embedded inline via their existing src (data: URIs travel
 *     with the file). We never fetch remote images — that would breach the
 *     local-only / no-network invariant — so a remote https image stays a
 *     reference, which we note honestly in the export.
 *
 * Three visual templates are offered. They differ only in CSS; the document
 * structure is identical so they all print cleanly.
 */
export type HtmlTemplate = 'highlight' | 'dark' | 'note';

export interface HtmlExportOptions {
  template?: HtmlTemplate;
  /** Document title; defaults to the conversation title. */
  title?: string;
}

export function exportHtml(conv: Conversation, options: HtmlExportOptions = {}): string {
  const template = options.template ?? 'highlight';
  const title = options.title ?? conv.source.title ?? 'Conversation';
  const css = TEMPLATE_CSS[template];

  const head = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${css}</style>`,
    '</head>',
    `<body class="tpl-${template}">`,
  ].join('\n');

  const body = [
    renderHeader(conv, title),
    `<main class="messages">`,
    ...conv.messages.map(renderMessage),
    `</main>`,
    renderFooter(),
  ].join('\n');

  return `${head}\n${body}\n</body>\n</html>\n`;
}

function renderHeader(conv: Conversation, title: string): string {
  const s = conv.source;
  const meta: string[] = [];
  meta.push(metaPair('Source', displayPlatform(s.platform)));
  if (s.model) meta.push(metaPair('Model', s.model));
  meta.push(metaPair('Captured', formatTimestamp(s.capturedAt)));
  meta.push(
    metaPair('Size', `${conv.stats.messageCount} messages · ~${conv.stats.approxTokens.toLocaleString()} tokens`)
  );
  if (s.url) meta.push(metaPair('URL', `<a href="${escapeAttr(s.url)}">${escapeHtml(s.url)}</a>`));

  return [
    `<header class="doc-header">`,
    `<h1>${escapeHtml(title)}</h1>`,
    `<dl class="meta">${meta.join('')}</dl>`,
    conv.stats.truncated
      ? `<p class="truncated-note">⚠ This capture may be incomplete (the source view was truncated).</p>`
      : '',
    `</header>`,
  ].join('\n');
}

function metaPair(label: string, valueHtml: string): string {
  return `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`;
}

function renderMessage(m: Message): string {
  const blocks = m.blocks.length > 0 ? m.blocks.map(renderBlock).join('\n') : renderPlainText(m.content);
  const stamp = m.createdAt ? `<time datetime="${escapeAttr(m.createdAt)}">${escapeHtml(formatTimestamp(m.createdAt))}</time>` : '';
  return [
    `<article class="msg msg-${m.role}">`,
    `<div class="msg-head"><span class="role">${escapeHtml(roleLabel(m.role))}</span>${stamp}</div>`,
    `<div class="msg-body">${blocks}</div>`,
    `</article>`,
  ].join('\n');
}

function renderBlock(b: Block): string {
  switch (b.kind) {
    case 'text':
      return renderPlainText(b.markdown);
    case 'code': {
      const lang = b.language ? ` data-lang="${escapeAttr(b.language)}"` : '';
      const label = b.language ? `<span class="code-lang">${escapeHtml(b.language)}</span>` : '';
      return `<div class="code-wrap">${label}<pre${lang}><code>${escapeHtml(b.code)}</code></pre></div>`;
    }
    case 'artifact': {
      const heading = b.title ? escapeHtml(b.title) : 'Artifact';
      const lang = b.language ? `<span class="code-lang">${escapeHtml(b.language)}</span>` : '';
      return [
        `<figure class="artifact">`,
        `<figcaption>${escapeHtml(heading)}${lang}</figcaption>`,
        `<pre><code>${escapeHtml(b.content)}</code></pre>`,
        `</figure>`,
      ].join('');
    }
    case 'math':
      return `<div class="math">${escapeHtml(b.tex)}</div>`;
    case 'image': {
      const alt = escapeAttr(b.alt ?? '');
      if (!b.src) return `<div class="image-missing">[image${b.alt ? `: ${escapeHtml(b.alt)}` : ''}]</div>`;
      const remote = /^https?:/i.test(b.src);
      const note = remote ? `<span class="image-remote-note">remote image — not embedded</span>` : '';
      return `<figure class="image"><img src="${escapeAttr(b.src)}" alt="${alt}" loading="lazy" />${note}</figure>`;
    }
    case 'tool_call':
      return `<div class="tool tool-call"><span class="tool-label">tool call: ${escapeHtml(b.name)}</span><pre><code>${escapeHtml(b.payload)}</code></pre></div>`;
    case 'tool_result':
      return `<div class="tool tool-result"><span class="tool-label">tool result</span><pre><code>${escapeHtml(b.payload)}</code></pre></div>`;
    default: {
      // Exhaustiveness guard: if a new Block kind is added, this errors at compile time.
      const _never: never = b;
      return _never;
    }
  }
}

function renderPlainText(text: string): string {
  if (!text.trim()) return '';
  return `<div class="text">${escapeHtml(text)}</div>`;
}

function renderFooter(): string {
  return `<footer class="doc-footer">Exported with Continue AI — local-only, no data left your browser.</footer>`;
}

function roleLabel(role: Role): string {
  switch (role) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    case 'tool':
      return 'Tool';
    default:
      return role;
  }
}

function displayPlatform(p: string): string {
  switch (p) {
    case 'chatgpt':
      return 'ChatGPT';
    case 'claude':
      return 'Claude';
    case 'gemini':
      return 'Gemini';
    default:
      return p;
  }
}

/**
 * Best-effort human-readable timestamp. Kept dependency-free: if the value
 * isn't a parseable ISO date we return it unchanged rather than guessing.
 */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/**
 * Per-template CSS. Shared base rules first, then template-specific overrides
 * keyed on the body class. Print rules keep PDF output clean (page breaks
 * don't slice through a message; backgrounds preserved).
 */
const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:0}
.doc-header{padding:32px 40px 16px}
.doc-header h1{margin:0 0 12px;font-size:24px;font-weight:650;letter-spacing:-.01em}
.meta{margin:0;display:grid;gap:2px}
.meta-row{display:flex;gap:8px;font-size:12.5px}
.meta dt{min-width:72px;opacity:.6}
.meta dd{margin:0}
.truncated-note{font-size:12.5px;margin:10px 0 0}
.messages{padding:8px 40px 40px;display:flex;flex-direction:column;gap:18px}
.msg{border-radius:12px;padding:14px 18px;break-inside:avoid;page-break-inside:avoid}
.msg-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px}
.role{font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.05em}
.msg-head time{font-size:11px;opacity:.5}
.text{white-space:pre-wrap;word-wrap:break-word}
.code-wrap{position:relative;margin:10px 0}
.code-lang{display:inline-block;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;opacity:.6;margin-bottom:2px}
pre{margin:0;overflow:auto;border-radius:8px;padding:12px 14px;font:12.5px/1.55 'SF Mono',SFMono-Regular,Menlo,Consolas,monospace}
.artifact{margin:10px 0;border-radius:8px;overflow:hidden}
.artifact figcaption{font-size:11.5px;font-weight:600;padding:6px 12px;display:flex;gap:8px;align-items:center}
.image img{max-width:100%;border-radius:8px;display:block}
.image-remote-note,.image-missing{font-size:11px;opacity:.55}
.math{font-family:'SF Mono',Menlo,Consolas,monospace;padding:8px 12px;border-radius:6px;margin:8px 0;font-size:13px}
.tool{margin:8px 0;border-radius:8px;padding:8px 12px;font-size:12.5px}
.tool-label{font-size:11px;font-weight:600;opacity:.7;display:block;margin-bottom:4px}
.doc-footer{padding:16px 40px 40px;font-size:11px;opacity:.45}
a{color:inherit}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.doc-footer{opacity:.6}}
`;

const HIGHLIGHT_CSS = `
.tpl-highlight{background:#fafaf9;color:#1c1917}
.tpl-highlight .msg-user{background:#fff7ed;border:1px solid #fed7aa}
.tpl-highlight .msg-assistant{background:#fff;border:1px solid #e7e5e4}
.tpl-highlight .msg-system,.tpl-highlight .msg-tool{background:#f5f5f4;border:1px solid #e7e5e4}
.tpl-highlight .role{color:#ea580c}
.tpl-highlight pre{background:#1c1917;color:#fafaf9}
.tpl-highlight .artifact{border:1px solid #e7e5e4}
.tpl-highlight .artifact figcaption{background:#f5f5f4}
.tpl-highlight .math,.tpl-highlight .tool{background:#f5f5f4}
`;

const DARK_CSS = `
.tpl-dark{background:#0a0a0a;color:#e5e5e5}
.tpl-dark .msg-user{background:#171717;border:1px solid #262626}
.tpl-dark .msg-assistant{background:#0f0f0f;border:1px solid #1f1f1f}
.tpl-dark .msg-system,.tpl-dark .msg-tool{background:#141414;border:1px solid #262626}
.tpl-dark .role{color:#60a5fa}
.tpl-dark pre{background:#000;color:#e5e5e5;border:1px solid #1f1f1f}
.tpl-dark .artifact{border:1px solid #262626}
.tpl-dark .artifact figcaption{background:#171717}
.tpl-dark .math,.tpl-dark .tool{background:#141414}
.tpl-dark a{color:#93c5fd}
`;

const NOTE_CSS = `
.tpl-note{background:#fffdf7;color:#3a3226;font-family:Georgia,'Iowan Old Style',serif}
.tpl-note .doc-header{border-bottom:2px solid #e9dcc3}
.tpl-note .msg{border-radius:4px}
.tpl-note .msg-user{background:#fff;border:1px solid #e9dcc3;border-left:3px solid #c2924a}
.tpl-note .msg-assistant{background:#fffdf7;border:1px solid #ece3d0}
.tpl-note .msg-system,.tpl-note .msg-tool{background:#f8f2e6;border:1px solid #ece3d0}
.tpl-note .role{color:#a16207}
.tpl-note pre{background:#2d2a24;color:#f5efe2;font-family:'SF Mono',Menlo,Consolas,monospace}
.tpl-note .artifact figcaption{background:#f8f2e6}
.tpl-note .math,.tpl-note .tool{background:#f8f2e6}
`;

const TEMPLATE_CSS: Record<HtmlTemplate, string> = {
  highlight: BASE_CSS + HIGHLIGHT_CSS,
  dark: BASE_CSS + DARK_CSS,
  note: BASE_CSS + NOTE_CSS,
};
