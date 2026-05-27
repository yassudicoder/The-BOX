import type { Adapter, AdapterProbe, ExtractContext } from '../base/Adapter';
import type { Platform, Role } from '../../types/conversation';
import { ExtractionError, type RawConversation, type RawMessage } from '../../types/raw';
import { $, $$, fingerprintClasses, textOf } from '../../utils/dom';
import { SELECTORS, SELECTOR_VERSION } from './selectors';

export class ChatGPTAdapter implements Adapter {
  readonly platform: Platform = 'chatgpt';

  matches(url: URL): boolean {
    return url.hostname === 'chat.openai.com' || url.hostname === 'chatgpt.com';
  }

  async extract(ctx: ExtractContext): Promise<RawConversation> {
    await ctx.scrollToLoadAll();
    if (ctx.signal.aborted) throw new ExtractionError('unknown', 'aborted');

    const doc = ctx.doc;
    const messageEls = $$(doc, SELECTORS.message);
    if (messageEls.length === 0) {
      throw new ExtractionError('selectors_missed', 'no [data-message-author-role] elements found');
    }

    const messages: RawMessage[] = [];
    for (const el of messageEls) {
      const role = normalizeRole(el.getAttribute(SELECTORS.roleAttr));
      if (!role) continue;
      const content = pickContentElement(el);
      if (!content) continue;
      const html = content.innerHTML.trim();
      if (!html) continue;
      const sourceId = el.getAttribute(SELECTORS.messageIdAttr) ?? undefined;
      messages.push({ role, html, sourceId });
    }

    if (messages.length === 0) {
      throw new ExtractionError('selectors_missed', 'role elements found but no content extracted');
    }

    // Heuristic: if the first message is assistant, we likely missed the
    // initial user prompt due to virtualization.
    const truncated = messages[0]?.role === 'assistant';

    return {
      platform: 'chatgpt',
      url: doc.location?.href ?? '',
      title: textOf($(doc, SELECTORS.title)) || undefined,
      model: inferModel(doc),
      messages,
      truncated,
    };
  }

  probe(doc: Document): AdapterProbe {
    const root = $(doc, 'main') ?? doc.body;
    const selectorHits: Record<string, boolean> = {
      message: $$(doc, SELECTORS.message).length > 0,
      conversationRoot: $(doc, SELECTORS.conversationRoot) !== null,
    };
    return {
      version: SELECTOR_VERSION,
      selectorHits,
      domFingerprint: fingerprintClasses(root),
    };
  }
}

function normalizeRole(raw: string | null): Role | null {
  switch (raw) {
    case 'user':
    case 'assistant':
    case 'system':
    case 'tool':
      return raw;
    default:
      return null;
  }
}

function pickContentElement(messageEl: Element): Element | null {
  // Prefer the markdown-rendered subtree; fall back to the whitespace-pre block
  // (used for plain-text user prompts), then to the element itself.
  return (
    messageEl.querySelector('.markdown') ??
    messageEl.querySelector('.whitespace-pre-wrap') ??
    messageEl
  );
}

function inferModel(doc: Document): string | undefined {
  // Best-effort: ChatGPT puts the model in a header button label.
  const btn = doc.querySelector('button[aria-label*="Model"], header button');
  const label = btn?.textContent?.trim();
  return label && label.length < 40 ? label : undefined;
}
