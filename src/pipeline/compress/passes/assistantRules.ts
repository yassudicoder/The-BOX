import type { CompressionPass } from '../types';
import { totalTokens } from '../types';

/**
 * Preserve assistant turns that establish a durable workflow rule, when
 * the next user turn appears to confirm or continue using it.
 *
 * Pattern looked for, intentionally narrow:
 *   1. Assistant says: "I'll always X", "Going forward I'll X",
 *      "From now on I'll X", "Got it, I'll X".
 *   2. The very next user turn is short (≤ 200 chars) and confirms
 *      ("ok", "great", "perfect", "thanks", "yes", "sounds good") OR
 *      simply continues the workflow without rejecting the rule.
 *
 * Conservative on purpose. The downside of a missed assistant rule is
 * less severe than a missed user rule (the user can re-state it). The
 * downside of false positives — a chatty assistant message marked as a
 * standing rule — is wasted tokens, not lost behavior.
 */

const PROPOSAL_PATTERNS: RegExp[] = [
  /\b(?:i'?ll|i will) (?:always|from now on|going forward) \w+/i,
  /\b(?:from now on|going forward|henceforth),? i'?ll \w+/i,
  /\bgot it[,.]? i'?ll \w+/i,
];

const SHORT_CONFIRMATION = /^(?:ok(?:ay)?|great|perfect|thanks|thank you|yes|sounds good|cool|got it|sgtm|lgtm)[!.,]?$/i;

export interface AssistantRuleMatch {
  matched: boolean;
  /** True only if the next user message looks like a confirmation. */
  confirmed?: boolean;
}

export function detectAssistantRuleProposal(text: string): boolean {
  if (!text || text.length > 400) return false;
  return PROPOSAL_PATTERNS.some((p) => p.test(text));
}

export function isShortConfirmation(text: string): boolean {
  if (!text) return false;
  return SHORT_CONFIRMATION.test(text.trim());
}

export const assistantRulesPass: CompressionPass = (cc, src) => {
  const sourceById = new Map(src.messages.map((m) => [m.id, m]));
  const tokens = totalTokens(cc.messages);
  const touched: string[] = [];

  const messages = cc.messages.map((m, i) => {
    if (m.role !== 'assistant') return m;
    if (m.provenance.kind !== 'verbatim') return m;
    const srcMsg = sourceById.get(m.provenance.sourceMessageId);
    if (!srcMsg) return m;
    if (!detectAssistantRuleProposal(srcMsg.content)) return m;

    // Look ahead for the next user message in the compressed sequence.
    let nextUser: typeof m | null = null;
    for (let j = i + 1; j < cc.messages.length; j++) {
      const candidate = cc.messages[j]!;
      if (candidate.role === 'user') {
        nextUser = candidate;
        break;
      }
    }
    if (!nextUser) return m;
    const nextSrc =
      nextUser.provenance.kind === 'synthetic'
        ? null
        : sourceById.get(nextUser.provenance.sourceMessageId);
    if (!nextSrc || !isShortConfirmation(nextSrc.content)) return m;

    touched.push(m.id);
    return {
      ...m,
      provenance: { ...m.provenance, reason: 'instruction' as const },
    };
  });

  return {
    ...cc,
    messages,
    passes: [
      ...cc.passes,
      {
        pass: 'assistantRules',
        inputTokens: tokens,
        outputTokens: tokens,
        affectedMessageIds: touched,
        notes:
          touched.length > 0
            ? `${touched.length} assistant rule(s) preserved (user-confirmed)`
            : undefined,
      },
    ],
  };
};
