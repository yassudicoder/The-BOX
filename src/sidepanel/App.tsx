import React, { useEffect, useState } from 'react';
import type { Platform } from '../types/conversation';
import type { Msg } from '../messaging/contracts';
import { useSidepanel } from './state/store';
import { listTransferTargets } from '../pipeline/transfer/adapters';
import { Timeline } from './components/Timeline';
import { ComposeControls } from './components/ComposeControls';
import { TokenBar } from './components/TokenBar';
import { WarningStack } from './components/WarningBanner';
import { exportMarkdown } from '../export/markdown';
import { buildBundle, bundleToJson } from '../export/json';

export function App(): JSX.Element {
  const status = useSidepanel((s) => s.status);
  const error = useSidepanel((s) => s.error);
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

  const setStatus = useSidepanel((s) => s.setStatus);
  const setError = useSidepanel((s) => s.setError);
  const setConversation = useSidepanel((s) => s.setConversation);
  const setTarget = useSidepanel((s) => s.setTarget);
  const setRecent = useSidepanel((s) => s.setRecentTurnsVerbatim);
  const setTargetTokens = useSidepanel((s) => s.setTargetTokens);
  const setNext = useSidepanel((s) => s.setNextInstruction);

  const [showDebug, setShowDebug] = useState(false);
  const [titleClicks, setTitleClicks] = useState(0);

  useEffect(() => {
    document.title = 'AI Conversation Portability';
  }, []);

  async function capture(): Promise<void> {
    setStatus('capturing');
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('no active tab');
      const reply: Msg = await chrome.runtime.sendMessage({
        type: 'EXTRACT_REQUEST',
        tabId: tab.id,
      });
      if (reply.type === 'EXTRACT_RESULT') {
        setConversation(reply.conversation);
      } else if (reply.type === 'EXTRACT_ERROR') {
        setError(`${reply.reason}${reply.detail ? `: ${reply.detail}` : ''}`);
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  function openFullView(): void {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/fullview/index.html') });
  }

  function downloadFile(name: string, content: string): void {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-sm">
      <header>
        <h1
          className="cursor-default select-none text-base font-semibold"
          onClick={() => {
            const next = titleClicks + 1;
            setTitleClicks(next);
            if (next >= 5) setShowDebug(true);
          }}
        >
          Conversation Portability
        </h1>
        <p className="text-xs text-neutral-400">Phase 5 — provenance-first transfer.</p>
      </header>

      <button
        onClick={capture}
        disabled={status === 'capturing'}
        className="rounded bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {status === 'capturing' ? 'Capturing…' : 'Capture current conversation'}
      </button>

      {error && (
        <p className="rounded border border-red-700 bg-red-950 p-2 text-xs text-red-200">
          {error}
        </p>
      )}

      {conv && compressed && (
        <>
          <fieldset className="grid grid-cols-2 gap-2 rounded border border-neutral-800 p-2 text-xs">
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
              <span className="text-neutral-400">Keep last K turns</span>
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
              <span className="text-neutral-400">
                Continuation (blank = last user message verbatim)
              </span>
              <textarea
                value={nextInstruction}
                onChange={(e) => setNext(e.target.value)}
                rows={2}
                className="rounded bg-neutral-900 px-2 py-1"
              />
            </label>
          </fieldset>

          <ComposeControls />

          {budget && <TokenBar totals={totals} budget={budget} />}

          <WarningStack warnings={warnings} />

          <details open className="rounded border border-neutral-800">
            <summary className="cursor-pointer p-2 text-xs text-neutral-400">
              Timeline ({compressed.messages.length} messages)
            </summary>
            <div className="max-h-96 overflow-auto p-2">
              <Timeline source={conv} compressed={compressed} />
            </div>
          </details>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Transfer prompt (editable)</span>
              <div className="flex gap-2">
                <button className="text-blue-400 underline" onClick={openFullView}>
                  open full view
                </button>
                <button
                  className="text-blue-400 underline"
                  onClick={() => navigator.clipboard.writeText(prompt)}
                >
                  copy
                </button>
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => {
                // Editing the prompt directly is a power-user override; we
                // don't propagate it back into compressed state.
                useSidepanel.setState({ prompt: e.target.value });
              }}
              className="min-h-48 rounded bg-neutral-900 p-2 font-mono text-xs"
            />
          </section>

          <section className="flex flex-wrap gap-2 text-xs">
            <button
              className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-900"
              onClick={() => downloadFile('conversation.md', exportMarkdown(conv))}
            >
              Export markdown
            </button>
            <button
              className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-900"
              onClick={() =>
                downloadFile(
                  'bundle.json',
                  bundleToJson(
                    buildBundle({
                      conversation: conv,
                      compressed,
                      warnings,
                    })
                  )
                )
              }
            >
              Export JSON bundle
            </button>
          </section>
        </>
      )}

      {showDebug && conv?.extractionLog && (
        <section className="rounded border border-amber-800 bg-amber-950/40 p-2 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <strong>extraction log</strong>
            <button
              className="text-amber-300 underline"
              onClick={() => navigator.clipboard.writeText(JSON.stringify(conv.extractionLog, null, 2))}
            >
              copy
            </button>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-amber-100">
            {JSON.stringify(conv.extractionLog, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
