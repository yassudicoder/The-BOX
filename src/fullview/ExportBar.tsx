import React, { useMemo, useState } from 'react';
import type { Conversation } from '../types/conversation';
import type { CompressedConversation } from '../pipeline/compress/types';
import type { Warning } from '../core/warnings';
import { exportMarkdown } from '../export/markdown';
import { buildBundle, bundleToJson } from '../export/json';
import { exportHtml, type HtmlTemplate } from '../export/html';

const FOOTER_BTN = 'text-[11px] text-neutral-400 hover:text-neutral-100';
const MINI_INPUT =
  'rounded-md border border-white/5 bg-neutral-950/40 px-2 py-1 text-[11px] text-neutral-100 focus:border-blue-500/60 focus:outline-none';

const TEMPLATE_OPTIONS: { value: HtmlTemplate; label: string }[] = [
  { value: 'highlight', label: 'Highlight' },
  { value: 'dark', label: 'Dark' },
  { value: 'note', label: 'Note' },
];

interface Props {
  conv: Conversation;
  compressed: CompressedConversation;
  warnings: Warning[];
}

/**
 * Export controls for the full-tab workspace. Presentation-layer only — it
 * calls the pure exporters in src/export and triggers a browser download or a
 * print-to-PDF. No business logic, no compression rules.
 *
 * Print-to-PDF is intentionally dependency-free: we open the self-contained
 * HTML export in a new window and invoke the browser's native print dialog,
 * which offers "Save as PDF". No PDF library is bundled.
 */
export function ExportBar({ conv, compressed, warnings }: Props): JSX.Element {
  const defaultName = useMemo(() => sanitizeName(conv.source.title ?? 'conversation'), [conv]);
  const [filename, setFilename] = useState(defaultName);
  const [template, setTemplate] = useState<HtmlTemplate>('highlight');

  const name = (ext: string): string => `${(filename.trim() || defaultName).replace(/\.[a-z0-9]+$/i, '')}.${ext}`;

  function download(file: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPdf(): void {
    const html = exportHtml(conv, { template, title: conv.source.title ?? filename });
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    const fire = () => {
      try {
        w.print();
      } catch {
        /* user can print manually if the auto-call is blocked */
      }
    };
    // Wait for layout/images; onload covers most cases, the timeout is a fallback.
    w.onload = fire;
    w.setTimeout(fire, 400);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">File</span>
        <input
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          spellCheck={false}
          className={`${MINI_INPUT} w-40`}
          aria-label="Export filename"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">Style</span>
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value as HtmlTemplate)}
          className={MINI_INPUT}
          aria-label="HTML export template"
        >
          {TEMPLATE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <span aria-hidden="true" className="text-neutral-700">·</span>

      <button
        type="button"
        className={FOOTER_BTN}
        onClick={() => download(name('html'), exportHtml(conv, { template, title: conv.source.title ?? filename }), 'text/html')}
      >
        Export HTML
      </button>
      <button type="button" className={FOOTER_BTN} onClick={printPdf}>
        Save as PDF
      </button>
      <button
        type="button"
        className={FOOTER_BTN}
        onClick={() => download(name('md'), exportMarkdown(conv), 'text/markdown')}
      >
        Markdown
      </button>
      <button
        type="button"
        className={FOOTER_BTN}
        onClick={() =>
          download(
            name('json'),
            bundleToJson(buildBundle({ conversation: conv, compressed, warnings })),
            'application/json'
          )
        }
      >
        JSON bundle
      </button>
    </div>
  );
}

function sanitizeName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return cleaned || 'conversation';
}
