import type { Adapter, AdapterProbe, ExtractContext } from '../base/Adapter';
import type { Platform, Role } from '../../types/conversation';
import { ExtractionError, type RawConversation, type RawMessage } from '../../types/raw';
import { $, $$, fingerprintClasses, textOf } from '../../utils/dom';
import { SELECTORS, SELECTOR_VERSION } from './selectors';

export class GeminiAdapter implements Adapter {
  readonly platform: Platform = 'gemini';

  matches(url: URL): boolean {
    return url.hostname === 'gemini.google.com';
  }

  async extract(ctx: ExtractContext): Promise<RawConversation> {
    await ctx.scrollToLoadAll();
    if (ctx.signal.aborted) throw new ExtractionError('unknown', 'aborted');

    const doc = ctx.doc;
    const messages = collectMessages(doc);

    if (messages.length === 0) {
      throw new ExtractionError('selectors_missed', 'no Gemini messages located');
    }

    const truncated = messages[0]?.role === 'assistant';

    return {
      platform: 'gemini',
      url: doc.location?.href ?? '',
      title: inferTitle(doc),
      model: inferModel(doc),
      messages,
      truncated,
    };
  }

  probe(doc: Document): AdapterProbe {
    const root = $(doc, 'chat-window-content, main') ?? doc.body;
    const selectorHits: Record<string, boolean> = {
      turn: $$(doc, SELECTORS.turn).length > 0,
      assistantMessage: $$(doc, SELECTORS.assistantMessage).length > 0,
      userMessage: $$(doc, SELECTORS.userMessage).length > 0,
    };
    return {
      version: SELECTOR_VERSION,
      selectorHits,
      domFingerprint: fingerprintClasses(root),
    };
  }
}

function collectMessages(doc: Document): RawMessage[] {
  const turns = $$(doc, SELECTORS.turn);
  const out: RawMessage[] = [];
  if (turns.length > 0) {
    for (const turn of turns) {
      const userEl = turn.querySelector(SELECTORS.userMessage);
      const assistantEl = turn.querySelector(SELECTORS.assistantMessage);
      if (userEl) out.push(messageFrom(userEl, 'user', turn.id || undefined));
      if (assistantEl) out.push(messageFrom(assistantEl, 'assistant', turn.id || undefined));
    }
    if (out.length > 0) return out;
  }

  const flat = $$(doc, `${SELECTORS.userMessage}, ${SELECTORS.assistantMessage}`);
  for (const el of flat) {
    const role: Role = el.matches(SELECTORS.userMessage) ? 'user' : 'assistant';
    out.push(messageFrom(el, role));
  }
  return out;
}

function messageFrom(el: Element, role: Role, turnId?: string): RawMessage {
  return {
    role,
    html: cleanMessageHtml(el),
    sourceId: turnId ?? (el.id || undefined),
  };
}

/**
 * Gemini injects `.cdk-visually-hidden` labels like "You said" / "Gemini said"
 * for screen readers. They live inside `.query-text` for user turns, so a raw
 * `innerHTML` read would prepend "You said" to every extracted prompt.
 * Clone first so we never mutate the host page DOM.
 */
function cleanMessageHtml(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const sr of Array.from(clone.querySelectorAll('.cdk-visually-hidden'))) {
    sr.remove();
  }
  return clone.innerHTML.trim();
}

function inferTitle(doc: Document): string | undefined {
  const sidenav = textOf($(doc, SELECTORS.title));
  if (sidenav) return sidenav;
  const title = doc.title?.replace(/\s*-\s*Google Gemini\s*$/i, '').trim();
  return title || undefined;
}

/**
 * Gemini's model picker button carries `aria-label="Open mode picker, currently <Name>"`.
 * Parse the name out; fall back to concatenated label text inside `.logo-pill-label-container`.
 */
function inferModel(doc: Document): string | undefined {
  const btn = doc.querySelector(SELECTORS.modelPickerButton);
  const aria = btn?.getAttribute('aria-label');
  if (aria) {
    const m = /currently\s+(.+?)\s*$/i.exec(aria);
    const name = m?.[1]?.trim();
    if (name && name.length < 40) return name;
  }
  const fallback = textOf($(doc, SELECTORS.modelPickerLabel));
  return fallback && fallback.length < 40 ? fallback : undefined;
}
