import React, { useEffect, useState } from 'react';
import type { Conversation } from '../../types/conversation';
import type { CompressedConversation } from '../../pipeline/compress/types';
import type { Warning } from '../../core/warnings';
import { exportMarkdown } from '../../export/markdown';
import { buildBundle, bundleToJson } from '../../export/json';
import { exportHtml } from '../../export/html';
import { exportPdf } from '../../export/pdf';
import { renderShareImage } from '../../export/shareImage';
import { sanitizeExportName } from '../../export/filename';

/**
 * Compact "Save a copy" row for the side panel.
 *
 * Quiet, secondary one-click chips that download the captured conversation in a
 * given format — PDF, HTML, Image, Markdown, JSON. Transfer (the Copy button)
 * stays the only primary action; this is deliberately understated.
 *
 * Presentation-layer only: it calls the pure exporters in src/export and
 * triggers a local download. No compression rules, no network. The styled HTML
 * template and image style are fixed to the default here; the full-tab
 * workspace (ExportBar) keeps the template/filename controls for power users.
 *
 * The last-used format is remembered across sessions (chrome.storage.local) and
 * shown with a subtle marker, so the format you reach for is easy to spot.
 */

type Format = 'pdf' | 'html' | 'image' | 'md' | 'json';

/** Storage key for the most recently used export format. */
export const LAST_FORMAT_KEY = 'export:lastFormat';

const FORMATS: { id: Format; label: string; title: string }[] = [
  { id: 'pdf', label: 'PDF', title: 'Save as PDF' },
  { id: 'html', label: 'HTML', title: 'Save as a styled web page' },
  { id: 'image', label: 'Image', title: 'Save as a long share image (PNG)' },
  { id: 'md', label: 'MD', title: 'Save as Markdown' },
  { id: 'json', label: 'JSON', title: 'Save the full structured bundle' },
];

const isFormat = (v: unknown): v is Format => FORMATS.some((f) => f.id === v);

interface Props {
  conv: Conversation;
  compressed: CompressedConversation;
  warnings: Warning[];
}

export function SaveCopyRow({ conv, compressed, warnings }: Props): JSX.Element {
  const [last, setLast] = useState<Format | null>(null);
  const [busy, setBusy] = useState<Format | null>(null);

  useEffect(() => {
    let cancelled = false;
    void chrome.storage.local.get(LAST_FORMAT_KEY).then((got) => {
      const v = got[LAST_FORMAT_KEY];
      if (!cancelled && isFormat(v)) setLast(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const base = sanitizeExportName(conv.source.title ?? 'conversation');
  const title = conv.source.title ?? base;
  const fileName = (ext: string): string => `${base}.${ext}`;

  function remember(fmt: Format): void {
    setLast(fmt);
    void chrome.storage.local.set({ [LAST_FORMAT_KEY]: fmt });
  }

  function downloadBlob(file: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadText(file: string, content: string, mime: string): void {
    downloadBlob(file, new Blob([content], { type: mime }));
  }

  async function run(fmt: Format): Promise<void> {
    if (busy) return;
    try {
      switch (fmt) {
        case 'pdf':
          downloadBlob(
            fileName('pdf'),
            new Blob([exportPdf(conv, { title })], { type: 'application/pdf' })
          );
          break;
        case 'html':
          downloadText(
            fileName('html'),
            exportHtml(conv, { template: 'highlight', title }),
            'text/html'
          );
          break;
        case 'image': {
          setBusy('image');
          const blob = await renderShareImage(conv, { template: 'highlight' });
          if (blob) downloadBlob(fileName('png'), blob);
          break;
        }
        case 'md':
          downloadText(fileName('md'), exportMarkdown(conv), 'text/markdown');
          break;
        case 'json':
          downloadText(
            fileName('json'),
            bundleToJson(buildBundle({ conversation: conv, compressed, warnings })),
            'application/json'
          );
          break;
      }
      remember(fmt);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md bg-neutral-900/40 px-3 py-2">
      <span className="mr-0.5 inline-flex items-center gap-1.5 text-[11px] text-neutral-400">
        <span aria-hidden="true" className="text-neutral-500">⤓</span>
        Save a copy
      </span>
      {FORMATS.map((f) => {
        const isBusy = busy === f.id;
        const isLast = last === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => void run(f.id)}
            disabled={busy !== null}
            title={isLast ? `${f.title} · last used` : f.title}
            aria-label={f.title}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 ${
              isLast
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                : 'border-white/10 text-neutral-300 hover:border-white/20 hover:bg-white/5 hover:text-neutral-100'
            }`}
          >
            {isBusy ? '…' : f.label}
          </button>
        );
      })}
    </div>
  );
}
