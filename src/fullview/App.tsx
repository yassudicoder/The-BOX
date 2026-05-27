import React, { useEffect, useState } from 'react';
import type { Conversation } from '../types/conversation';
import { useSidepanel } from '../sidepanel/state/store';
import { listTransferTargets } from '../pipeline/transfer/adapters';
import type { Platform } from '../types/conversation';
import { Timeline } from '../sidepanel/components/Timeline';
import { ComposeControls } from '../sidepanel/components/ComposeControls';
import { TokenBar } from '../sidepanel/components/TokenBar';
import { WarningStack } from '../sidepanel/components/WarningBanner';
import { exportMarkdown } from '../export/markdown';
import { buildBundle, bundleToJson } from '../export/json';

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
      <div className="flex h-screen items-center justify-center text-sm text-neutral-400">
        {hydrated
          ? 'No captured conversation. Open the side panel on a supported page and click Capture.'
          : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-[1fr_420px] divide-x divide-neutral-800">
      <main className="flex flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex items-baseline justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2 text-sm">
          <div>
            <span className="font-semibold">{conv.source.title ?? 'Conversation'}</span>
            <span className="ml-2 text-xs text-neutral-400">
              {conv.source.platform} · {conv.stats.messageCount} msgs · ~{conv.stats.approxTokens} tokens
            </span>
          </div>
          <div className="flex gap-2 text-xs">
            <button
              className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-900"
              onClick={() => downloadFile('conversation.md', exportMarkdown(conv))}
            >
              Markdown
            </button>
            <button
              className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-900"
              onClick={() =>
                downloadFile(
                  'bundle.json',
                  bundleToJson(
                    buildBundle({ conversation: conv, compressed, warnings })
                  )
                )
              }
            >
              JSON bundle
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4">
          <Timeline source={conv} compressed={compressed} />
        </div>
      </main>

      <aside className="flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 space-y-2 border-b border-neutral-800 bg-neutral-950 p-3 text-xs">
          {budget && <TokenBar totals={totals} budget={budget} />}
          <WarningStack warnings={warnings} />
        </div>
        <div className="flex-1 overflow-auto p-3">
          <div className="space-y-3 text-xs">
            <fieldset className="grid grid-cols-2 gap-2 rounded border border-neutral-800 p-2">
              <label className="flex flex-col gap-1">
                <span className="text-neutral-400">Target</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value as Platform)}
                  className="rounded bg-neutral-900 px-2 py-1"
                >
                  {listTransferTargets().map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-neutral-400">Keep last K</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={recentTurnsVerbatim}
                  onChange={(e) => setRecent(Number(e.target.value))}
                  className="rounded bg-neutral-900 px-2 py-1"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-neutral-400">Target tokens</span>
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={targetTokens}
                  onChange={(e) => setTargetTokens(Number(e.target.value))}
                  className="rounded bg-neutral-900 px-2 py-1"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-neutral-400">Continuation (blank = last user turn)</span>
                <textarea
                  value={nextInstruction}
                  onChange={(e) => setNext(e.target.value)}
                  rows={3}
                  className="rounded bg-neutral-900 px-2 py-1"
                />
              </label>
            </fieldset>

            <ComposeControls />

            <section>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-neutral-400">Transfer prompt</span>
                <button
                  className="text-blue-400 underline"
                  onClick={() => navigator.clipboard.writeText(prompt)}
                >
                  copy
                </button>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => useSidepanel.setState({ prompt: e.target.value })}
                className="min-h-64 w-full rounded bg-neutral-900 p-2 font-mono text-xs"
              />
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
