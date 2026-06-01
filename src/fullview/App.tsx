import React, { useEffect, useState } from 'react';
import type { Conversation } from '../types/conversation';
import { useSidepanel } from '../sidepanel/state/store';
import { listTransferTargets } from '../pipeline/transfer/adapters';
import type { Platform } from '../types/conversation';
import { Timeline } from '../sidepanel/components/Timeline';
import { ComposeControls } from '../sidepanel/components/ComposeControls';
import { TokenBar } from '../sidepanel/components/TokenBar';
import { WarningStack } from '../sidepanel/components/WarningBanner';
import { CopyButton } from '../sidepanel/components/CopyButton';
import { exportMarkdown } from '../export/markdown';
import { buildBundle, bundleToJson } from '../export/json';

const INPUT_CLASS =
  'rounded-md border border-white/5 bg-neutral-950/40 px-3 py-2 text-[13px] text-neutral-100 placeholder:text-neutral-500 focus:border-blue-500/60 focus:outline-none';

const FOOTER_BTN =
  'text-[11px] text-neutral-400 hover:text-neutral-100';

/**
 * Full-tab workspace for large conversations. Two-column layout:
 *   - left: timeline (scrollable, takes the height)
 *   - right: sticky controls — compose, token bar, warnings, prompt textarea,
 *            export. Copy button stays visible at the top while scrolling.
 *
 * Hydrates state from chrome.storage by loading the most recent conversation
 * the side panel persisted, so the user can pop open a tab and pick up where
 * they left off without re-capturing.
 */
export function Workspace(): JSX.Element {
  const conv = useSidepanel((s) => s.conv);
  const compressed = useSidepanel((s) => s.compressed);
  const target = useSidepanel((s) => s.target);
  const recentTurnsVerbatim = useSidepanel((s) => s.recentTurnsVerbatim);
  const targetTokens = useSidepanel((s) => s.targetTokens);
  const nextInstruction = useSidepanel((s) => s.nextInstruction);
  const prompt = useSidepanel((s) => s.prompt);
  const totals = useSidepanel((s) => s.totals);
  const budget = useSidepanel((s) => s.budget);
  const warnings = useSidepanel((s) => s.warnings);
  const setConversation = useSidepanel((s) => s.setConversation);
  const setTarget = useSidepanel((s) => s.setTarget);
  const setRecent = useSidepanel((s) => s.setRecentTurnsVerbatim);
  const setTargetTokens = useSidepanel((s) => s.setTargetTokens);
  const setNext = useSidepanel((s) => s.setNextInstruction);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (conv || hydrated) return;
    void (async () => {
      const idxRaw = await chrome.storage.local.get('conv:index');
      const index = (idxRaw['conv:index'] as string[] | undefined) ?? [];
      if (index.length === 0) {
        setHydrated(true);
        return;
      }
      const latestId = index[0];
      const raw = await chrome.storage.local.get(`conv:${latestId}`);
      const c = raw[`conv:${latestId}`] as Conversation | undefined;
      if (c) setConversation(c);
      setHydrated(true);
    })();
  }, [conv, hydrated, setConversation]);

  function downloadFile(name: string, content: string): void {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!conv || !compressed) {
    return (
      <div className="flex h-screen items-center justify-center px-6 text-center text-[13px] text-neutral-400">
        {hydrated
          ? 'No captured conversation. Open the side panel on a supported page and click Capture.'
          : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-[1fr_440px] divide-x divide-white/5 bg-neutral-950 text-neutral-100">
      <main className="flex flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex items-baseline justify-between gap-4 bg-neutral-950/95 px-6 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-tight text-neutral-100">
              {conv.source.title ?? 'Conversation'}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-500">
              {conv.source.platform} · {conv.stats.messageCount} msgs · ~{conv.stats.approxTokens.toLocaleString()} tokens
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              className={FOOTER_BTN}
              onClick={() => downloadFile('conversation.md', exportMarkdown(conv))}
            >
              Export markdown
            </button>
            <span aria-hidden="true" className="text-neutral-700">·</span>
            <button
              type="button"
              className={FOOTER_BTN}
              onClick={() =>
                downloadFile(
                  'bundle.json',
                  bundleToJson(
                    buildBundle({ conversation: conv, compressed, warnings })
                  )
                )
              }
            >
              Export JSON bundle
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto px-6 py-4">
          <Timeline source={conv} compressed={compressed} />
        </div>
      </main>

      <aside className="flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 space-y-3 bg-neutral-950/95 px-5 py-4 backdrop-blur">
          {budget && <TokenBar totals={totals} budget={budget} compact />}
          <WarningStack warnings={warnings} />
          <CopyButton text={prompt} />
        </div>
        <div className="flex-1 overflow-auto px-5 pb-6">
          <div className="space-y-5">
            <section className="space-y-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                Continuation
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-neutral-400">
                  What should the next AI do? <span className="text-neutral-500">(optional)</span>
                </span>
                <textarea
                  value={nextInstruction}
                  onChange={(e) => setNext(e.target.value)}
                  rows={3}
                  placeholder="Blank repeats your last message"
                  className={INPUT_CLASS}
                />
              </label>
            </section>

            <section className="space-y-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                Settings
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] text-neutral-400">Target</span>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value as Platform)}
                    className={INPUT_CLASS}
                  >
                    {listTransferTargets().map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] text-neutral-400">Keep last N turns word-for-word</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={recentTurnsVerbatim}
                    onChange={(e) => setRecent(Number(e.target.value))}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="text-[12px] text-neutral-400">Target prompt size (tokens)</span>
                  <input
                    type="number"
                    min={500}
                    step={500}
                    value={targetTokens}
                    onChange={(e) => setTargetTokens(Number(e.target.value))}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
              <ComposeControls />
            </section>

            <section className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                Transfer prompt
              </div>
              <textarea
                value={prompt}
                onChange={(e) => useSidepanel.setState({ prompt: e.target.value })}
                className="min-h-64 w-full rounded-md border border-white/5 bg-neutral-950/40 p-3 font-mono text-[12px] leading-relaxed text-neutral-200 focus:border-blue-500/60 focus:outline-none"
              />
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
