import type { Msg, MsgOf, MsgType } from './contracts';

type Handler<T extends MsgType> = (
  msg: MsgOf<T>,
  sender: chrome.runtime.MessageSender
) => Promise<Msg | void> | Msg | void;

type AnyHandler = (msg: Msg, sender: chrome.runtime.MessageSender) => Promise<Msg | void> | Msg | void;

const handlers = new Map<MsgType, AnyHandler>();

export function register<T extends MsgType>(type: T, handler: Handler<T>): void {
  handlers.set(type, handler as unknown as AnyHandler);
}

export function startListening(): void {
  chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
    const handler = handlers.get(msg.type);
    if (!handler) return false;
    Promise.resolve(handler(msg, sender))
      .then((result) => sendResponse(result))
      .catch((err) => {
        console.error('[bus] handler error', msg.type, err);
        sendResponse({
          type: 'EXTRACT_ERROR',
          reason: 'unknown',
          detail: err instanceof Error ? err.message : String(err),
        });
      });
    return true; // keep channel open for async response
  });
}

export async function send<T extends MsgType>(msg: MsgOf<T>): Promise<Msg | undefined> {
  return chrome.runtime.sendMessage(msg);
}

export async function sendToTab<T extends MsgType>(
  tabId: number,
  msg: MsgOf<T>
): Promise<Msg | undefined> {
  return chrome.tabs.sendMessage(tabId, msg);
}
