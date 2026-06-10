import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Platform } from '../types/conversation';
import type { Msg } from '../messaging/contracts';
import {
  PENDING_CAPTURE_KEY,
  isPendingFresh,
  type PendingCapture,
} from '../messaging/pendingCapture';
import { useSidepanel } from './state/store';
import { listTransferTargets } from '../pipeline/transfer/adapters';
import { Timeline } from './components/Timeline';
import { ComposeControls } from './components/ComposeControls';
import { TokenBar } from './components/TokenBar';
import { WarningStack } from './components/WarningBanner';
import { CaptureStatus } from './components/CaptureStatus';
import { CopyButton } from './components/CopyButton';
import { TrimNotice } from './components/TrimNotice';
import { nextBudgetTier } from './components/TrimNotice.helpers';
import { HelpTip, HelpTipProvider } from './components/HelpTip';
import { strings } from './strings';
import { exportMarkdown } from '../export/markdown';
import { buildBundle, bundleToJson } from '../export/json';

const INPUT_CLASS =
  'rounded-md border border-white/5 bg-neutral-950/40 px-3 py-2 text-[13px] text-neutral-100 placeholder:text-neutral-500 focus:border-blue-500/60 focus:outline-none';

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
  const storedCount = useSidepanel((s) => s.storedCount);
  const refreshStoredCount = useSidepanel((s) => s.refreshStoredCount);
  const clearStoredCaptures = useSidepanel((s) => s.clearStoredCaptures);

  const [showDebug, setShowDebug] = useState(false);
  const [titleClicks, setTitleClicks] = useState(0);

  // Refs used by the "Increase to <next tier>" action in TrimNotice — when
  // fired we open the Advanced disclosure and select the budget input so the
  // user can see what changed.
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const budgetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Continue AI';
    void refreshStoredCount();
  }, [refreshStoredCount]);

  async function handleClearStored(): Promise<void> {
    // Free the storage without throwing away the user's current in-memory
    // capture — they may want to copy the prompt before reloading.
    await clearStoredCaptures();
    // The action resolved the most likely cause of any visible error banner
    // (storage_full). Clear it so the user sees the cleared state.
    setError(null);
  }

  function handleIncreaseBudget(): void {
    const next = nextBudgetTier(targetTokens);
    if (next === null) return;
    setTargetTokens(next);
    if (advancedRef.current) advancedRef.current.open = true;
    // Defer focus so React's re-render + the <details> open completes first.
    window.setTimeout(() => {
      const el = budgetInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }, 0);
  }

  const runCapture = useCallback(
    async (tabId?: number): Promise<void> => {
      setStatus('capturing');
      setError(null);
      try {
        let id = tabId;
        if (id == null) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          id = tab?.id;
        }
        if (id == null) throw new Error('no active tab');
        const reply: Msg = await chrome.runtime.sendMessage({
          type: 'EXTRACT_REQUEST',
          tabId: id,
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
    },
    [setStatus, setError, setConversation]
  );

  // UI handler: ignores the click event and captures the active tab.
  const capture = useCallback((): void => {
    void runCapture();
  }, [runCapture]);

  // Pick up a capture requested from the in-page button. The background writes
  // a pending flag after opening the panel; we may be freshly mounted (read it
  // once) or already open (react to the storage change).
  useEffect(() => {
    let cancelled = false;
    const consume = async (): Promise<void> => {
      const got = await chrome.storage.local.get(PENDING_CAPTURE_KEY);
      const pending = got[PENDING_CAPTURE_KEY] as PendingCapture | undefined;
      if (!isPendingFresh(pending, Date.now())) return;
      await chrome.storage.local.remove(PENDING_CAPTURE_KEY);
      if (!cancelled) void runCapture(pending.tabId);
    };
    void consume();
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'local' && changes[PENDING_CAPTURE_KEY]?.newValue) void consume();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [runCapture]);

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

  const isCapturing = status === 'capturing';
  const hasResult = conv !== null && compressed !== null;

  return (
    <HelpTipProvider>
      <div className="flex h-full flex-col gap-6 px-4 pt-4 pb-6 text-sm">
        <header className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h1
              className="cursor-default select-none text-[15px] font-semibold tracking-tight text-neutral-100"
              onClick={() => {
                const next = titleClicks + 1;
                setTitleClicks(next);
                if (next >= 5) setShowDebug(true);
              }}
            >
              Continue AI
            </h1>
            {hasResult && (
              <button
                type="button"
                onClick={capture}
                disabled={isCapturing}
                aria-label={isCapturing ? 'Capturing…' : 'Re-capture this page'}
                title={isCapturing ? 'Capturing…' : 'Re-capture this page'}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span aria-hidden="true" className={isCapturing ? 'animate-spin' : ''}>↻</span>
              </button>
            )}
          </div>
          {hasResult && conv && <CaptureStatus conv={conv} />}
        </header>

        {!hasResult && (
          <PreCaptureView onCapture={capture} isCapturing={isCapturing} />
        )}

        {error && (
          <div
            role="alert"
            className="rounded-r-md border-l-2 border-rose-500 bg-rose-500/5 px-3 py-2 text-[12px]"
          >
            <div className="font-medium text-rose-200">Couldn't capture this page</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-neutral-300/90">{error}</div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
              {/* The Advanced > Storage > Clear All control is gated on hasResult,
                  which is false on a fresh-install storage_full hit. Surface a
                  contextual Clear here so the recovery path is one click away
                  from the error itself. */}
              {error.startsWith('storage_full') && (
                <button
                  type="button"
                  onClick={handleClearStored}
                  className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-rose-100 hover:bg-rose-500/20 focus:outline-none focus:ring-1 focus:ring-rose-400/60"
                >
                  Clear stored captures
                  {storedCount !== null && storedCount > 0 ? ` (${storedCount})` : ''}
                </button>
              )}
              {hasResult && (
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-neutral-400 hover:text-neutral-100"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {hasResult && conv && compressed && (
          <>
            {/* Result block — single raised surface, no border. The colored Copy
                button is the only chromatic thing here, so it visually leads. */}
            <section className="flex flex-col gap-3 rounded-lg bg-neutral-900/60 p-4">
              <WarningStack warnings={warnings} />

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-neutral-400">
                  What should the next AI do? <span className="text-neutral-500">(optional)</span>
                </span>
                <textarea
                  value={nextInstruction}
                  onChange={(e) => setNext(e.target.value)}
                  rows={2}
                  placeholder="Blank repeats your last message"
                  className={INPUT_CLASS}
                />
              </label>

              {budget && <TokenBar totals={totals} budget={budget} compact />}

              <CopyButton text={prompt} disabled={!prompt} />

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-neutral-500">
                  <span>Transfer prompt</span>
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-neutral-100"
                    onClick={openFullView}
                  >
                    open full view ↗
                  </button>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => {
                    // Editing the prompt directly is a power-user override; we
                    // don't propagate it back into compressed state.
                    useSidepanel.setState({ prompt: e.target.value });
                  }}
                  className="min-h-32 rounded-md border border-white/5 bg-neutral-950/40 p-3 font-mono text-[12px] leading-relaxed text-neutral-200 focus:border-blue-500/60 focus:outline-none"
                />
              </div>
            </section>

            {/* Budget-driven trim notice — renders nothing unless the prompt
                had to drop older turns to fit the budget. Calm, not an alert. */}
            <TrimNotice
              compressed={compressed}
              source={conv}
              currentBudget={targetTokens}
              onIncreaseBudget={handleIncreaseBudget}
            />

            {/* Disclosure list — flat rows on the canvas, hairline-separated.
                Review and Advanced are visually demoted to "you can poke here
                if you want." */}
            <div className="divide-y divide-white/5 border-y border-white/5">
              <DisclosureRow summary={`Review what's being sent — ${conv.messages.length} messages`}>
                <div className="max-h-72 overflow-auto">
                  <Timeline source={conv} compressed={compressed} debug={showDebug} />
                </div>
              </DisclosureRow>

              <DisclosureRow
                ref={advancedRef}
                summary={strings.advancedSettings}
                subtitle={strings.advancedSettingsSubtitle}
                muted
              >
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                      {strings.settings}
                    </div>
                    {/* Vertical-stacked Settings. Drops the 2-col grid that
                        caused inline labels to wrap at narrow widths. Each
                        input is sized to its content rather than stretched. */}
                    <div className="space-y-4">
                      {/* Target */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">
                          <label
                            htmlFor="target-select"
                            className="cursor-pointer text-[12px] text-neutral-400"
                          >
                            {strings.target}
                          </label>
                          <HelpTip label={strings.target} text={strings.targetTip} />
                        </div>
                        <select
                          id="target-select"
                          value={target}
                          onChange={(e) => setTarget(e.target.value as Platform)}
                          className={`${INPUT_CLASS} max-w-[220px]`}
                        >
                          {listTransferTargets().map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.displayName}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Keep recent messages */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">
                          <label
                            htmlFor="keep-recent-input"
                            className="cursor-pointer text-[12px] text-neutral-400"
                          >
                            {strings.keepRecentMessages}
                          </label>
                          <HelpTip
                            label={strings.keepRecentMessages}
                            text={strings.keepRecentTip}
                          />
                        </div>
                        <input
                          id="keep-recent-input"
                          type="number"
                          min={0}
                          max={20}
                          value={recentTurnsVerbatim}
                          onChange={(e) => setRecent(Number(e.target.value))}
                          className={`${INPUT_CLASS} no-spin w-20`}
                        />
                      </div>

                      {/* Maximum prompt size, with inline "tokens" unit. The
                          input frame is a flex container styled like an
                          input; the real <input> has bg-transparent and the
                          suffix span sits beside it. focus-within drives
                          the focus ring on the container so the visual
                          state matches a single field. */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">
                          <label
                            htmlFor="max-prompt-input"
                            className="cursor-pointer text-[12px] text-neutral-400"
                          >
                            {strings.maxPromptSize}
                          </label>
                          <HelpTip
                            label={strings.maxPromptSize}
                            text={strings.maxPromptSizeTip}
                          />
                        </div>
                        <div className="flex w-44 items-center gap-2 rounded-md border border-white/5 bg-neutral-950/40 px-3 py-2 transition-colors focus-within:border-blue-500/60">
                          <input
                            id="max-prompt-input"
                            ref={budgetInputRef}
                            type="number"
                            min={500}
                            step={500}
                            value={targetTokens}
                            onChange={(e) => setTargetTokens(Number(e.target.value))}
                            aria-describedby="max-prompt-unit"
                            className="no-spin w-full bg-transparent text-[13px] text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                          />
                          <span
                            id="max-prompt-unit"
                            className="shrink-0 text-[11px] text-neutral-500"
                          >
                            {strings.tokensUnit}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <ComposeControls />

                  <div className="space-y-1.5">
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                      {strings.export}
                    </div>
                    <p className="text-[11px] leading-relaxed text-neutral-500">
                      {strings.exportSubtitle}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[12px] text-neutral-300">
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => downloadFile('conversation.md', exportMarkdown(conv))}
                          className="hover:text-neutral-100"
                        >
                          {strings.markdown}
                        </button>
                        <HelpTip
                          label={strings.markdown}
                          text={strings.markdownTip}
                        />
                      </span>
                      <span aria-hidden="true" className="text-neutral-700">·</span>
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
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
                          className="hover:text-neutral-100"
                        >
                          {strings.jsonFile}
                        </button>
                        <HelpTip
                          label={strings.jsonFile}
                          text={strings.jsonFileTip}
                        />
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                        {strings.storage}
                      </div>
                      <HelpTip label={strings.storage} text={strings.storageTip} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[12px] text-neutral-400">
                      <span>
                        {storedCount === null
                          ? strings.capturesStoredLoading
                          : strings.capturesStored(storedCount)}
                      </span>
                      <span aria-hidden="true" className="text-neutral-700">·</span>
                      <button
                        type="button"
                        onClick={handleClearStored}
                        disabled={storedCount === 0 || storedCount === null}
                        className="text-neutral-300 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {strings.clearAll}
                      </button>
                    </div>
                  </div>
                </div>
              </DisclosureRow>
            </div>
          </>
        )}

        {showDebug && conv?.extractionLog && (
          <section className="rounded-md border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-[11px]">
            <div className="mb-1 flex items-center justify-between">
              <strong className="text-amber-200">extraction log</strong>
              <button
                className="text-neutral-400 hover:text-neutral-100"
                onClick={() => navigator.clipboard.writeText(JSON.stringify(conv.extractionLog, null, 2))}
              >
                copy
              </button>
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-amber-100/90">
              {JSON.stringify(conv.extractionLog, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </HelpTipProvider>
  );
}

function PreCaptureView({
  onCapture,
  isCapturing,
}: {
  onCapture: () => void;
  isCapturing: boolean;
}): JSX.Element {
  return (
    <div className="my-4 flex flex-col items-stretch gap-6">
      <p className="px-2 text-center text-[13px] leading-relaxed text-neutral-400">
        Open a conversation on ChatGPT, Claude, or Gemini, then click Capture.
        You'll get a prompt to paste into any of the other AIs to continue
        the conversation there.
      </p>
      <button
        type="button"
        onClick={onCapture}
        disabled={isCapturing}
        className="rounded-md bg-blue-500 px-3 py-3 text-[13px] font-medium text-white transition-colors hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/60 disabled:opacity-50"
      >
        {isCapturing ? 'Capturing…' : 'Capture current conversation'}
      </button>
    </div>
  );
}

interface DisclosureRowProps {
  summary: string;
  /** Optional muted one-liner shown under the summary when expanded. */
  subtitle?: string;
  muted?: boolean;
  children: React.ReactNode;
}

const DisclosureRow = React.forwardRef<HTMLDetailsElement, DisclosureRowProps>(
  function DisclosureRow({ summary, subtitle, muted = false, children }, ref) {
    return (
      <details ref={ref} className="group">
        <summary
          className={`flex cursor-pointer list-none items-center gap-2 px-2 py-2.5 text-[13px] transition-colors hover:bg-white/[0.03] focus-visible:bg-white/5 focus-visible:outline-none ${
            muted ? 'text-neutral-400' : 'text-neutral-200'
          }`}
        >
          <span
            aria-hidden="true"
            className="inline-block w-3 text-[11px] text-neutral-500 transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          <span className="truncate">{summary}</span>
        </summary>
        <div className="px-2 pb-3 pl-7">
          {subtitle && (
            <p className="mb-4 text-[11px] leading-relaxed text-neutral-500">
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </details>
    );
  }
);
