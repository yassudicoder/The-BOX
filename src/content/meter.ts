/**
 * Opt-in live context-meter content script.
 *
 * Injected ONLY while the user has enabled the meter (the background
 * dynamically registers/unregisters it), so when the feature is off this code
 * never runs and behaviour is identical to v1.0.0.
 *
 * It rides the L1 seam only: it reads the currently-MOUNTED messages via the
 * adapter and estimates the rest from turn indices. It NEVER scrolls the page
 * and NEVER triggers L2 recovery. A debounced MutationObserver recounts on
 * change; counting is suspended whenever the tab is hidden. Only an integer
 * token estimate is ever sent — never message content.
 */
import { resolveAdapter } from '../adapters/base/AdapterRegistry';
import { send } from '../messaging/bus';
import { loadSettings, SETTINGS_KEY, normalizeSettings } from '../messaging/settings';
import { emptyUsage, estimateUsage, updateUsage, type UsageState } from '../core/context/usage';
import { samplesFromRaw, detectHardWall } from './meterSamples';

const DEBOUNCE_MS = 600;
const SINGLETON_FLAG = '__continueAiMeterRunning';

function boot(): void {
  // Top frame only; never double-run.
  if (window.top !== window.self) return;
  const w = window as unknown as Record<string, boolean>;
  if (w[SINGLETON_FLAG]) return;
  w[SINGLETON_FLAG] = true;

  const adapter = resolveAdapter(new URL(location.href));
  if (!adapter) return;
  const platform = adapter.platform;
  if (platform !== 'chatgpt' && platform !== 'claude' && platform !== 'gemini') return;

  let usage: UsageState = emptyUsage();
  let timer: number | undefined;
  let stopped = false;

  const recount = (): void => {
    if (stopped || document.visibilityState === 'hidden') return;
    try {
      usage = updateUsage(usage, samplesFromRaw(adapter.collect(document)));
      const est = estimateUsage(usage);
      void send({
        type: 'CONTEXT_USAGE',
        platform,
        usedTokens: est.estimatedTotalTokens,
        seenTurns: est.seenTurns,
        expectedTurns: est.expectedTurns,
        hardWall: detectHardWall(document, platform),
      }).catch(() => {
        /* background asleep/unreachable — next debounce retries */
      });
    } catch {
      /* selectors missed / transient DOM — skip this tick */
    }
  };

  const schedule = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(recount, DEBOUNCE_MS);
  };

  const root = document.querySelector('main') ?? document.body;
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') schedule();
  };
  // Self-disable if the user turns the meter off without reloading the page.
  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ): void => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    if (!normalizeSettings(changes[SETTINGS_KEY].newValue).contextMeterEnabled) stop();
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    chrome.storage.onChanged.removeListener(onStorage);
    if (timer !== undefined) window.clearTimeout(timer);
    w[SINGLETON_FLAG] = false;
  };

  document.addEventListener('visibilitychange', onVisibility);
  chrome.storage.onChanged.addListener(onStorage);

  // First reading once, then on every (debounced) change.
  void loadSettings().then((s) => {
    if (s.contextMeterEnabled) recount();
    else stop();
  });
}

boot();
