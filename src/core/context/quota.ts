/**
 * Claude usage-quota model (the EXACT meter).
 *
 * Claude exposes the signed-in user's own usage at
 *   GET /api/organizations/{orgId}/usage
 * returning two rolling windows (`five_hour`, `seven_day`), each with a
 * `utilization` and a `resets_at`. This module is the pure parser + math for
 * that data: NO DOM, NO chrome.*, NO fetch. The content script does the
 * same-origin credentialed fetch and feeds the raw JSON here.
 *
 * The endpoint is undocumented and WILL change, so parseUsageResponse is
 * defensive: any missing field or shape mismatch returns null, and the caller
 * falls back to the tokenizer estimate rather than ever showing a stale or
 * guessed "exact" number.
 *
 * EXACT vs ESTIMATE: `utilization` and `resets_at` are presented to the user as
 * exact. `estimateMessagesLeft` is an approximation and must always be rendered
 * as "about N".
 */

/** One rolling usage window, normalized. */
export interface QuotaWindow {
  /** Fraction of the window consumed, normalized to 0..1. */
  utilization: number;
  /** When the window resets, normalized to epoch milliseconds. */
  resetsAtMs: number;
}

export interface ClaudeQuota {
  /** Primary session window (Claude's 5-hour limit). */
  fiveHour: QuotaWindow;
  /** Weekly window (7-day). */
  sevenDay: QuotaWindow;
  /** Best-effort current model label, for the messages-left estimate. */
  model?: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Normalize a resets_at value that may be an ISO-8601 string OR a unix-epoch
 * number (seconds). Returns epoch ms, or null if unparseable.
 */
export function normalizeResetsAt(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Heuristic: treat as seconds (Claude's number form). Values already in ms
    // (13-digit, ~1e12+) are left as-is so we don't multiply twice.
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Detect the utilization scale across the windows and return a normalizer to
 * 0..1. If any raw value exceeds 1 the API is using 0..100, so divide by 100;
 * otherwise it is already a 0..1 fraction.
 */
function makeUtilizationNormalizer(rawValues: number[]): (u: number) => number {
  const scaleIsPercent = rawValues.some((v) => v > 1);
  return (u: number) => {
    const f = scaleIsPercent ? u / 100 : u;
    return Math.min(1, Math.max(0, f));
  };
}

/**
 * Parse + normalize the /usage response. Returns null on ANY shape mismatch
 * (missing window, non-numeric utilization, unparseable reset) so the caller
 * falls back to the estimate. `model` is threaded through for messages-left.
 */
export function parseUsageResponse(raw: unknown, model?: string): ClaudeQuota | null {
  if (!isObj(raw)) return null;
  const fh = raw.five_hour;
  const sd = raw.seven_day;
  if (!isObj(fh) || !isObj(sd)) return null;

  const fhU = fh.utilization;
  const sdU = sd.utilization;
  if (typeof fhU !== 'number' || !Number.isFinite(fhU)) return null;
  if (typeof sdU !== 'number' || !Number.isFinite(sdU)) return null;

  const fhReset = normalizeResetsAt(fh.resets_at);
  const sdReset = normalizeResetsAt(sd.resets_at);
  if (fhReset === null || sdReset === null) return null;

  const normalize = makeUtilizationNormalizer([fhU, sdU]);
  return {
    fiveHour: { utilization: normalize(fhU), resetsAtMs: fhReset },
    sevenDay: { utilization: normalize(sdU), resetsAtMs: sdReset },
    ...(model ? { model } : {}),
  };
}

/**
 * Empirical per-message burn rates: the APPROXIMATE fraction of a single
 * 5-hour session consumed by one message of the given model.
 *
 * These are NOT published by Anthropic and vary by plan; they are rough,
 * empirical placeholders that make the "about N messages left" projection
 * directional, not precise. They NEED CALIBRATION against real sessions. Keep
 * all such numbers here — never inline a burn-rate magic number elsewhere.
 */
export const MODEL_BURN_RATES: Record<'opus' | 'sonnet' | 'haiku', number> = {
  opus: 1 / 15, // heaviest — ~15 messages per session
  sonnet: 1 / 45, // ~45 messages per session
  haiku: 1 / 120, // lightest — ~120 messages per session
};

/** Fallback when the model can't be matched. */
export const DEFAULT_BURN_RATE = MODEL_BURN_RATES.sonnet;

function burnRateFor(model: string | undefined): number {
  const m = model?.toLowerCase() ?? '';
  if (m.includes('opus')) return MODEL_BURN_RATES.opus;
  if (m.includes('haiku')) return MODEL_BURN_RATES.haiku;
  if (m.includes('sonnet')) return MODEL_BURN_RATES.sonnet;
  return DEFAULT_BURN_RATE;
}

/**
 * Project "about how many more messages" fit in the remaining 5-hour session
 * for the given model. DERIVED ESTIMATE — render only ever as "about N".
 */
export function estimateMessagesLeft(fiveHourUtilization: number, model?: string): number {
  const remaining = Math.max(0, 1 - fiveHourUtilization);
  return Math.max(0, Math.floor(remaining / burnRateFor(model)));
}

/** Format a reset countdown as "Hh Mm" (or "Mm" under an hour). Pure given now. */
export function formatResetCountdown(resetsAtMs: number, nowMs: number): string {
  const totalMin = Math.max(0, Math.round((resetsAtMs - nowMs) / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Read the orgId from a document.cookie string (lastActiveOrg). null if absent. */
export function orgIdFromCookies(cookieString: string): string | null {
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === 'lastActiveOrg') {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value) || null;
      } catch {
        return value || null;
      }
    }
  }
  return null;
}
