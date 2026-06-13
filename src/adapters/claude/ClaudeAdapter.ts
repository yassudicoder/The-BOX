import type { Adapter, AdapterProbe, ExtractContext } from '../base/Adapter';
import type { Platform, Role } from '../../types/conversation';
import { ExtractionError, type RawConversation, type RawMessage } from '../../types/raw';
import { $, $$, fingerprintClasses, textOf } from '../../utils/dom';
import { SELECTORS, SELECTOR_VERSION } from './selectors';

export class ClaudeAdapter implements Adapter {
  readonly platform: Platform = 'claude';

  matches(url: URL): boolean {
    return url.hostname === 'claude.ai';
  }

  async extract(ctx: ExtractContext): Promise<RawConversation> {
    await ctx.scrollToLoadAll();
    if (ctx.signal.aborted) throw new ExtractionError('unknown', 'aborted');

    const doc = ctx.doc;
    const messages = this.collect(doc);

    if (messages.length === 0) {
      throw new ExtractionError('selectors_missed', 'no Claude messages located');
    }

    const truncated = messages[0]?.role === 'assistant';

    return {
      platform: 'claude',
      url: doc.location?.href ?? '',
      title: textOf($(doc, SELECTORS.title)) || undefined,
      model: inferModel(doc),
      messages,
      truncated,
    };
  }

  messageElements(doc: Document): Element[] {
    return $$(doc, `${SELECTORS.userMessage}, ${SELECTORS.assistantMessage}`);
  }

  collect(doc: Document): RawMessage[] {
    return collectMessages(doc);
  }

  probe(doc: Document): AdapterProbe {
    const root = $(doc, 'main') ?? doc.body;
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
      // The turn container carries a unique, stable id (e.g.
      // data-testid="conversation-turn-2"); the inner message nodes only carry
      // CONSTANT testids ("user-message" / "conversation-turn-assistant"), which
      // are useless as identities. Derive per-message ids from turn + role so
      // L2's merge-by-id can actually de-duplicate across re-collections.
      const turnKey = turn.getAttribute('data-testid') ?? turn.id ?? null;
      const userEl = turn.querySelector(SELECTORS.userMessage);
      const assistantEl = turn.querySelector(SELECTORS.assistantMessage);
      if (userEl) out.push(messageFrom(userEl, 'user', turnKey ? `${turnKey}:user` : undefined));
      if (assistantEl) {
        out.push(messageFrom(assistantEl, 'assistant', turnKey ? `${turnKey}:assistant` : undefined));
      }
    }
    if (out.length > 0) return out;
  }

  const flat = $$(doc, `${SELECTORS.userMessage}, ${SELECTORS.assistantMessage}`);
  for (const el of flat) {
    const role: Role = el.matches(SELECTORS.userMessage) ? 'user' : 'assistant';
    // Constant testids are useless as ids; prefer a real element id, else leave
    // it unset and let the merge fall back to content + per-batch ordinal.
    out.push(messageFrom(el, role, el.id || undefined));
  }
  return out;
}

function messageFrom(el: Element, role: Role, sourceId?: string): RawMessage {
  const html = rewriteArtifacts(el).innerHTML.trim();
  return { role, html, sourceId };
}

/**
 * Walk a clone of the message element and rewrite any Claude artifact cards
 * into the normalized form htmlToMarkdown expects:
 *   <div data-portability-artifact identifier=".." title=".." language=".." mime="..">
 *     <pre><code>...</code></pre>
 *   </div>
 * Operates on a clone so we never mutate the host page DOM.
 */
function rewriteArtifacts(el: Element): Element {
  const clone = el.cloneNode(true) as Element;
  const cards = clone.querySelectorAll('[data-testid="artifact-card"]');
  for (const card of Array.from(cards)) {
    const ownerDoc = card.ownerDocument;
    if (!ownerDoc) continue;
    const wrapper = ownerDoc.createElement('div');
    wrapper.setAttribute('data-portability-artifact', '');
    wrapper.setAttribute('identifier', card.getAttribute('data-artifact-id') ?? '');
    wrapper.setAttribute(
      'title',
      card.querySelector('[data-testid="artifact-title"]')?.textContent?.trim() ?? ''
    );
    wrapper.setAttribute('language', card.getAttribute('data-artifact-language') ?? '');
    wrapper.setAttribute('mime', card.getAttribute('data-artifact-mime') ?? '');
    const codeEl = card.querySelector('pre code');
    const pre = ownerDoc.createElement('pre');
    const code = ownerDoc.createElement('code');
    code.textContent = codeEl?.textContent ?? '';
    pre.appendChild(code);
    wrapper.appendChild(pre);
    card.replaceWith(wrapper);
  }
  return clone;
}

function inferModel(doc: Document): string | undefined {
  const btn = doc.querySelector(
    '[data-testid="model-selector-dropdown"], button[aria-label*="model" i]'
  );
  const label = btn?.textContent?.trim();
  return label && label.length < 40 ? label : undefined;
}
