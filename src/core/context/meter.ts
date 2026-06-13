import type { SourcePlatform } from '../../types/conversation';

/**
 * Context-meter model — the pure "how full is this conversation's context
 * window?" math. Framework-agnostic: NO DOM, NO chrome.*, NO React. The live
 * counter (content layer), the badge (background) and the meter UI (side panel)
 * all consume these functions; the numbers here are the single source of truth
 * for the denominator, thresholds, and copy.
 *
 * Everything is an ESTIMATE. Real tokenizers differ per model (Claude's isn't
 * public) and vendors change context windows without notice, so every number is
 * surfaced with "~" and an "estimated" tooltip in the UI. These constants are
 * deliberately easy to edit.
 */

/** User-declared plan, used to pick a conservative denominator. */
export type Plan = 'free' | 'plus' | 'pro';

export const PLANS: Plan[] = ['free', 'plus', 'pro'];

export type MeterLevel = 'green' | 'amber' | 'red';

/** Threshold ratios between levels (used / window). */
export const AMBER_AT = 0.6;
export const RED_AT = 0.85;

/**
 * Conservative approximate context windows (tokens) per platform × plan. These
 * are intentionally cautious — better to warn a little early than to imply
 * headroom that isn't there. Edit freely as plans/models change.
 *
 * Claude's window is large and roughly plan-independent; its hard wall is
 * surfaced by Claude's own in-product warning, which we detect separately and
 * treat as 100% (see the Claude adapter). Gemini is panel-only (no badge).
 */
const PLATFORM_WINDOWS: Record<SourcePlatform, Record<Plan, number>> = {
  chatgpt: { free: 8_000, plus: 32_000, pro: 128_000 },
  claude: { free: 200_000, plus: 200_000, pro: 200_000 },
  gemini: { free: 32_000, plus: 1_000_000, pro: 1_000_000 },
};

/**
 * Model-specific overrides when we can confidently read the model name from the
 * page. Keys are matched case-insensitively as substrings of the detected model
 * label, longest key first, so "gpt-4o-mini" beats "gpt-4o".
 */
const MODEL_WINDOWS: Array<{ match: string; window: number }> = [
  { match: 'gpt-4o-mini', window: 128_000 },
  { match: 'gpt-4o', window: 128_000 },
  { match: 'gpt-4.1', window: 1_000_000 },
  { match: 'gpt-4-turbo', window: 128_000 },
  { match: 'gpt-4', window: 8_192 },
  { match: 'gpt-3.5', window: 16_385 },
  { match: 'o1', window: 200_000 },
  { match: 'o3', window: 200_000 },
  { match: 'claude', window: 200_000 },
  { match: 'gemini 1.5', window: 1_000_000 },
  { match: 'gemini 2', window: 1_000_000 },
];

export interface ResolveWindowInput {
  platform: SourcePlatform;
  plan: Plan;
  /** Model label read from the page, if any (e.g. "GPT-4o", "Claude 3.5 Sonnet"). */
  model?: string;
}

export interface ResolvedWindow {
  window: number;
  /** Where the number came from, for the "estimated" tooltip. */
  basis: 'model' | 'plan-default';
}

/**
 * Resolve the denominator: prefer a confidently-matched model window, else the
 * conservative platform×plan default.
 */
export function resolveContextWindow(input: ResolveWindowInput): ResolvedWindow {
  const model = input.model?.toLowerCase().trim();
  if (model) {
    const hit = [...MODEL_WINDOWS]
      .sort((a, b) => b.match.length - a.match.length)
      .find((m) => model.includes(m.match));
    if (hit) return { window: hit.window, basis: 'model' };
  }
  return { window: PLATFORM_WINDOWS[input.platform][input.plan], basis: 'plan-default' };
}

export interface MeterReading {
  /** used / window, clamped to [0, 1]. */
  ratio: number;
  /** Rounded percentage 0..100 for display. */
  percent: number;
  level: MeterLevel;
  /** True when the platform reported its own hard length warning (forces 100%). */
  atHardWall: boolean;
}

/**
 * Map a used/window pair to a meter reading. `hardWall` (Claude's own warning)
 * forces a full red reading regardless of the estimate.
 */
export function readMeter(usedTokens: number, windowTokens: number, hardWall = false): MeterReading {
  if (hardWall) {
    return { ratio: 1, percent: 100, level: 'red', atHardWall: true };
  }
  const safeWindow = Math.max(1, windowTokens);
  const ratio = Math.min(1, Math.max(0, usedTokens / safeWindow));
  const level: MeterLevel = ratio >= RED_AT ? 'red' : ratio >= AMBER_AT ? 'amber' : 'green';
  return { ratio, percent: Math.round(ratio * 100), level, atHardWall: false };
}

export interface MeterCopy {
  /** One-liner for the badge tooltip / meter heading. */
  short: string;
  /** Fuller explanation for the side-panel meter. */
  long: string;
  /** Whether to surface the one-click Transfer call-to-action (red states). */
  showTransferCta: boolean;
}

/**
 * Per-platform, per-level copy. ChatGPT speaks to silent forgetting; Claude to a
 * hard wall; Gemini stays calm (panel-only, no badge). All phrased as estimates.
 */
export function meterCopy(platform: SourcePlatform, level: MeterLevel): MeterCopy {
  if (level === 'green') {
    return { short: 'Plenty of room', long: 'This conversation is comfortably within its estimated context window.', showTransferCta: false };
  }
  if (level === 'amber') {
    return {
      short: 'Getting long',
      long: 'Getting long — response quality may start to drop as the model has more to keep in mind.',
      showTransferCta: false,
    };
  }
  // red
  switch (platform) {
    case 'claude':
      return {
        short: 'Near the limit',
        long: "You're close to Claude's hard length limit — it may refuse to continue soon. Transfer recommended.",
        showTransferCta: true,
      };
    case 'chatgpt':
      return {
        short: 'Near the limit',
        long: 'The chat is long enough that older messages are likely being forgotten. Transfer recommended to keep the full context.',
        showTransferCta: true,
      };
    case 'gemini':
      return {
        short: 'Near the limit',
        long: 'This conversation is approaching its estimated context window. Transfer recommended.',
        showTransferCta: true,
      };
  }
}

/** Badge background colors per level (hex, for chrome.action.setBadgeBackgroundColor). */
export const LEVEL_BADGE_COLOR: Record<MeterLevel, string> = {
  green: '#16a34a',
  amber: '#d97706',
  red: '#dc2626',
};
