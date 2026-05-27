import type { CompressionPass } from '../types';
import { totalTokens } from '../types';

/**
 * Detect user turns that look like standing instructions. The compression
 * pipeline must preserve these verbatim regardless of position.
 *
 * Heuristics, in plain English:
 *   - Imperative framing: explicit rule markers at sentence start
 *     ("Rule:", "From now on", "Always", "Never", "Do not")
 *   - The phrase has to do work as an instruction, not as conversational
 *     filler. "Always" inside "I've always wondered..." is NOT a rule.
 *   - Long essays (>800 chars) are unlikely to be a single rule.
 *
 * Safe bias: false positives waste a few tokens. False negatives lose
 * rules. We err toward preservation.
 */

interface Matcher {
  regex: RegExp;
  /** True if this regex must hit at sentence start to count. */
  anchorSentenceStart?: boolean;
  /** Description that surfaces in `passes[].notes`. */
  reason: string;
}

const MATCHERS: Matcher[] = [
  { regex: /^\s*(?:rule|constraint|important|note|instruction)s?\s*:/i, anchorSentenceStart: true, reason: 'colon-prefixed rule' },
  { regex: /\bfrom now on\b/i, anchorSentenceStart: false, reason: 'from-now-on phrasing' },
  // Imperative "always" / "never": at start of a sentence, followed by a verb.
  { regex: /(?:^|[.!?]\s+)always\s+\w+/i, anchorSentenceStart: false, reason: 'imperative always' },
  { regex: /(?:^|[.!?]\s+)never\s+\w+/i, anchorSentenceStart: false, reason: 'imperative never' },
  { regex: /(?:^|[.!?]\s+)(?:do not|don't)\s+\w+/i, anchorSentenceStart: false, reason: 'imperative negation' },
  // "Please" softeners that still carry instruction weight.
  { regex: /\b(?:please )?remember (?:that|to)\b/i, anchorSentenceStart: false, reason: 'remember-that/to' },
  // Explicit "going forward".
  { regex: /\b(?:going forward|henceforth)\b/i, anchorSentenceStart: false, reason: 'going-forward phrasing' },
];

/**
 * Conversational disqualifiers — phrases that *look* like instructions but
 * are reminiscing or speculating. If any of these match, we bail out.
 */
const DISQUALIFIERS: RegExp[] = [
  /\bi(?:'ve| have) always\b/i,
  /\bi (?:always|never) (?:wanted|wondered|thought|believed)\b/i,
  /\bwhy (?:do|does) (?:it|that)\b/i,
  /\bdo not know\b/i,
  /\bwouldn't (?:always|ever)\b/i,
];

export interface InstructionMatch {
  matched: boolean;
  reason?: string;
}

export function detectInstruction(text: string): InstructionMatch {
  if (!text) return { matched: false };
  if (text.length > 800) return { matched: false };
  for (const dq of DISQUALIFIERS) {
    if (dq.test(text)) return { matched: false };
  }
  for (const m of MATCHERS) {
    if (m.regex.test(text)) return { matched: true, reason: m.reason };
  }
  return { matched: false };
}

/** Legacy boolean API used by Phase 4 tests. */
export function looksLikeInstruction(text: string): boolean {
  return detectInstruction(text).matched;
}

export const instructionPass: CompressionPass = (cc, src) => {
  const sourceById = new Map(src.messages.map((m) => [m.id, m]));
  const tokens = totalTokens(cc.messages);
  const touched: string[] = [];
  const reasons: string[] = [];

  const messages = cc.messages.map((m) => {
    if (m.role !== 'user') return m;
    if (m.provenance.kind !== 'verbatim') return m;
    const srcMsg = sourceById.get(m.provenance.sourceMessageId);
    if (!srcMsg) return m;
    const hit = detectInstruction(srcMsg.content);
    if (!hit.matched) return m;
    touched.push(m.id);
    if (hit.reason) reasons.push(hit.reason);
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
        pass: 'instructions',
        inputTokens: tokens,
        outputTokens: tokens,
        affectedMessageIds: touched,
        notes:
          touched.length > 0
            ? `${touched.length} user turn(s) flagged: ${[...new Set(reasons)].join(', ')}`
            : undefined,
      },
    ],
  };
};
