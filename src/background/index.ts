/// <reference types="chrome" />
import { register, startListening, sendToTab } from '../messaging/bus';
import type { Conversation } from '../types/conversation';
import type { Msg } from '../messaging/contracts';
import { getStrategy } from '../pipeline/compress';
import { buildTransferPrompt, defaultTransferOptions } from '../pipeline/transfer';

const SUPPORTED_HOST_SUFFIXES = ['chat.openai.com', 'chatgpt.com', 'claude.ai'];
const CONTENT_SCRIPT_FILE = 'content-script.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[bg] sidePanel setup failed', err));
});

register('EXTRACT_REQUEST', async (msg) => {
  const reply = await extractWithInject(msg.tabId);
  if (!reply) {
    return { type: 'EXTRACT_ERROR', reason: 'unknown', detail: 'no reply from content script' };
  }
  if (reply.type === 'EXTRACT_RESULT') {
    await persist(reply.conversation);
  }
  return reply;
});

register('BUILD_TRANSFER', async (msg) => {
  const conv = await load(msg.conversationId);
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

startListening();

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

async function persist(conv: Conversation): Promise<void> {
  const key = `conv:${conv.id}`;
  await chrome.storage.local.set({ [key]: conv });
  const indexRaw = await chrome.storage.local.get('conv:index');
  const index: string[] = (indexRaw['conv:index'] as string[]) ?? [];
  if (!index.includes(conv.id)) {
    index.unshift(conv.id);
    await chrome.storage.local.set({ 'conv:index': index.slice(0, 200) });
  }
}

async function load(id: string): Promise<Conversation | null> {
  const key = `conv:${id}`;
  const raw = await chrome.storage.local.get(key);
  return (raw[key] as Conversation | undefined) ?? null;
}
