/// <reference types="chrome" />
import { register, startListening, sendToTab } from '../messaging/bus';
import type { Msg } from '../messaging/contracts';
import { getStrategy } from '../pipeline/compress';
import { buildTransferPrompt, defaultTransferOptions } from '../pipeline/transfer';
import {
  chromeLocalDriver,
  loadConversation,
  persistConversation,
  sweepOrphans,
} from './storage';
import { PENDING_CAPTURE_KEY, type PendingCapture } from '../messaging/pendingCapture';
import {
  loadSettings,
  normalizeSettings,
  SETTINGS_KEY,
} from '../messaging/settings';
import {
  meterUsageKey,
  meterQuotaKey,
  type MeterUsage,
  type MeterQuota,
} from '../messaging/meterUsage';
import {
  resolveContextWindow,
  readMeter,
  LEVEL_BADGE_COLOR,
  type MeterReading,
} from '../core/context/meter';

const SUPPORTED_HOST_SUFFIXES = ['chatgpt.com', 'claude.ai', 'gemini.google.com'];
const SUPPORTED_MATCHES = [
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
];
const CONTENT_SCRIPT_FILE = 'content-script.js';
const METER_SCRIPT_ID = 'context-meter';
const METER_SCRIPT_FILE = 'meter-content.js';

const driver = chromeLocalDriver();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[bg] sidePanel setup failed', err));
  // First-run heal: previous versions never evicted blobs when IDs fell
  // off the index cap, so upgrading users may have accumulated orphans
  // that are silently eating quota.
  sweepOrphans(driver).catch((err) => console.error('[bg] orphan sweep on install failed', err));
  // Reconcile the opt-in context-meter injection with the persisted setting.
  void reconcileMeterFromSettings();
});

// Re-register the meter on service-worker start (registration is persistent, so
// this is idempotent) and react to the user toggling the setting.
void reconcileMeterFromSettings();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[SETTINGS_KEY]) return;
  const enabled = normalizeSettings(changes[SETTINGS_KEY].newValue).contextMeterEnabled;
  void reconcileMeter(enabled);
});

// Service workers are ephemeral; onInstalled only fires on install/update.
// Run a sweep once per worker lifetime before any persist so users whose
// service worker restarts mid-day still get the heal applied.
let sweptThisLifetime = false;
async function ensureSwept(): Promise<void> {
  if (sweptThisLifetime) return;
  sweptThisLifetime = true;
  try {
    await sweepOrphans(driver);
  } catch (err) {
    console.error('[bg] orphan sweep failed', err);
  }
}

register('EXTRACT_REQUEST', async (msg) => {
  await ensureSwept();
  const reply = await extractWithInject(msg.tabId);
  if (!reply) {
    return { type: 'EXTRACT_ERROR', reason: 'unknown', detail: 'no reply from content script' };
  }
  if (reply.type === 'EXTRACT_RESULT') {
    const result = await persistConversation(driver, reply.conversation);
    if (!result.ok) {
      return { type: 'EXTRACT_ERROR', reason: result.reason, detail: result.detail };
    }
  }
  return reply;
});

register('BUILD_TRANSFER', async (msg) => {
  const conv = await loadConversation(driver, msg.conversationId);
  if (!conv) {
    return {
      type: 'EXTRACT_ERROR',
      reason: 'unknown',
      detail: `conversation not found: ${msg.conversationId}`,
    };
  }
  const strategy = getStrategy('structural');
  const compressed = strategy.compress(conv, {
    targetTokens: msg.options.targetTokens,
    recentTurnsVerbatim: msg.options.recentTurnsVerbatim,
    preserveCodeBlocks: true,
  });
  const options = {
    ...defaultTransferOptions(msg.target),
    nextInstruction: msg.options.nextInstruction,
  };
  const prompt = buildTransferPrompt(compressed, conv, options);
  return { type: 'BUILD_TRANSFER_RESULT', transferId: prompt.id, prompt: prompt.prompt };
});

register('CAPTURE_AND_OPEN', async (_msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    return { type: 'CAPTURE_OPENED', panelOpened: false, detail: 'no sender tab' };
  }
  // Open the panel FIRST, before any await, so the user gesture that produced
  // the click is still active (chrome.sidePanel.open requires it). If it's
  // rejected, the pending flag below still lets a manual panel-open capture.
  let panelOpened = false;
  try {
    await chrome.sidePanel.open({ tabId });
    panelOpened = true;
  } catch (err) {
    console.warn('[bg] sidePanel.open failed (likely needs a user gesture)', err);
  }
  const pending: PendingCapture = { tabId, at: Date.now() };
  await chrome.storage.local.set({ [PENDING_CAPTURE_KEY]: pending });
  return { type: 'CAPTURE_OPENED', panelOpened };
});

register('CONTEXT_USAGE', async (msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  const settings = await loadSettings();
  if (!settings.contextMeterEnabled) return; // raced with a disable — ignore
  const usage: MeterUsage = {
    tabId,
    platform: msg.platform,
    usedTokens: msg.usedTokens,
    seenTurns: msg.seenTurns,
    expectedTurns: msg.expectedTurns,
    hardWall: msg.hardWall,
    at: Date.now(),
  };
  await chrome.storage.local.set({ [meterUsageKey(tabId)]: usage });
  await updateBadge(tabId);
});

register('CLAUDE_QUOTA', async (msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  const settings = await loadSettings();
  if (!settings.contextMeterEnabled) return;
  if (msg.quota) {
    const stored: MeterQuota = { quota: msg.quota, at: Date.now() };
    await chrome.storage.local.set({ [meterQuotaKey(tabId)]: stored });
  } else {
    // Unavailable / shape changed — drop any prior reading so we never show a
    // stale exact number; the panel + badge fall back to the estimate.
    await chrome.storage.local.remove(meterQuotaKey(tabId));
  }
  await updateBadge(tabId);
});

// A closed tab's per-tab meter readings are dead weight — drop both.
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.local.remove([meterUsageKey(tabId), meterQuotaKey(tabId)]);
});

startListening();

/**
 * Recompute the toolbar badge for a tab from its stored readings. Claude's EXACT
 * quota wins when available (it's the primary, exact meter); otherwise the
 * context-window estimate drives it. Gemini is panel-only (no badge).
 */
async function updateBadge(tabId: number): Promise<void> {
  const settings = await loadSettings();
  if (!settings.contextMeterEnabled) {
    await clearBadge(tabId);
    return;
  }
  const got = await chrome.storage.local.get([meterUsageKey(tabId), meterQuotaKey(tabId)]);
  const usage = got[meterUsageKey(tabId)] as MeterUsage | undefined;
  const quota = got[meterQuotaKey(tabId)] as MeterQuota | undefined;
  if (quota?.quota) {
    // Exact session quota → readMeter against a window of 1 maps the 0..1
    // fraction straight to percent + level.
    await setBadge(tabId, readMeter(quota.quota.fiveHour.utilization, 1));
    return;
  }
  if (!usage || usage.platform === 'gemini') {
    await clearBadge(tabId);
    return;
  }
  const { window: contextWindow } = resolveContextWindow({
    platform: usage.platform,
    plan: settings.plan,
  });
  await setBadge(tabId, readMeter(usage.usedTokens, contextWindow, usage.hardWall));
}

async function setBadge(tabId: number, reading: MeterReading): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: LEVEL_BADGE_COLOR[reading.level] });
    await chrome.action.setBadgeText({ tabId, text: `${reading.percent}%` });
  } catch {
    // Tab may have closed between the message and the badge write.
  }
}

async function clearBadge(tabId: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' });
  } catch {
    /* tab gone */
  }
}

async function reconcileMeterFromSettings(): Promise<void> {
  const settings = await loadSettings();
  await reconcileMeter(settings.contextMeterEnabled);
}

/**
 * Register the opt-in meter content script when enabled (so it auto-injects on
 * supported pages) and inject it into already-open tabs; unregister + clear
 * badges when disabled. Idempotent — safe to call on every worker start.
 */
async function reconcileMeter(enabled: boolean): Promise<void> {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [METER_SCRIPT_ID] });
    const isRegistered = existing.length > 0;
    if (enabled && !isRegistered) {
      await chrome.scripting.registerContentScripts([
        {
          id: METER_SCRIPT_ID,
          js: [METER_SCRIPT_FILE],
          matches: SUPPORTED_MATCHES,
          runAt: 'document_idle',
        },
      ]);
      const tabs = await chrome.tabs.query({ url: SUPPORTED_MATCHES });
      for (const t of tabs) {
        if (t.id != null) {
          chrome.scripting
            .executeScript({ target: { tabId: t.id }, files: [METER_SCRIPT_FILE] })
            .catch(() => {});
        }
      }
    } else if (!enabled && isRegistered) {
      await chrome.scripting.unregisterContentScripts({ ids: [METER_SCRIPT_ID] });
      const tabs = await chrome.tabs.query({ url: SUPPORTED_MATCHES });
      const keys = tabs
        .filter((t) => t.id != null)
        .flatMap((t) => [meterUsageKey(t.id as number), meterQuotaKey(t.id as number)]);
      if (keys.length) await chrome.storage.local.remove(keys);
      for (const t of tabs) if (t.id != null) void clearBadge(t.id);
    }
  } catch (err) {
    console.error('[bg] reconcileMeter failed', err);
  }
}

async function extractWithInject(tabId: number): Promise<Msg | undefined> {
  const payload = { type: 'EXTRACT_REQUEST', tabId } as const;

  const tab = await safeGetTab(tabId);
  if (!tab?.url || !isSupportedUrl(tab.url)) {
    return {
      type: 'EXTRACT_ERROR',
      reason: 'unsupported_platform',
      detail: `tab is not a supported AI host: ${tab?.url ?? '(unknown)'}`,
    };
  }

  if (await ping(tabId)) {
    return sendToTab(tabId, payload);
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
  } catch (err) {
    return {
      type: 'EXTRACT_ERROR',
      reason: 'unknown',
      detail: `injection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const ready = await waitForContentScript(tabId, 15, 100);
  if (!ready) {
    return {
      type: 'EXTRACT_ERROR',
      reason: 'unknown',
      detail: 'content script injected but did not register handlers within 1.5s',
    };
  }

  try {
    return await sendToTab(tabId, payload);
  } catch (err) {
    return {
      type: 'EXTRACT_ERROR',
      reason: 'unknown',
      detail: `content script unreachable after ping: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

async function ping(tabId: number): Promise<boolean> {
  try {
    const reply = await sendToTab(tabId, { type: 'PING' });
    return !!reply && reply.type === 'PONG';
  } catch {
    return false;
  }
}

async function waitForContentScript(
  tabId: number,
  maxAttempts: number,
  delayMs: number
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await ping(tabId)) return true;
    await sleep(delayMs);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeGetTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return undefined;
  }
}

function isSupportedUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return SUPPORTED_HOST_SUFFIXES.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
