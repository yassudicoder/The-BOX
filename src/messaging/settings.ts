import type { Plan } from '../core/context/meter';

/**
 * User settings persisted in chrome.storage.local (local-only, never synced).
 *
 * The context meter is OFF by default: with `contextMeterEnabled: false` the
 * content script starts no observers and behaves exactly like v1.0.0. Only when
 * the user opts in does the live counter run.
 */
export const SETTINGS_KEY = 'settings';

export interface Settings {
  /** Master switch for the live context meter (observer + badge). Default OFF. */
  contextMeterEnabled: boolean;
  /** User-declared plan, used to pick a conservative context-window denominator. */
  plan: Plan;
  /** Whether the one-time "turn on the meter?" nudge has been dismissed/answered. */
  meterNudgeDismissed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  contextMeterEnabled: false,
  plan: 'free',
  meterNudgeDismissed: false,
};

/** Coerce an unknown stored blob into a complete Settings (defaults fill gaps). */
export function normalizeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  return {
    contextMeterEnabled:
      typeof s.contextMeterEnabled === 'boolean'
        ? s.contextMeterEnabled
        : DEFAULT_SETTINGS.contextMeterEnabled,
    plan: s.plan === 'plus' || s.plan === 'pro' || s.plan === 'free' ? s.plan : DEFAULT_SETTINGS.plan,
    meterNudgeDismissed:
      typeof s.meterNudgeDismissed === 'boolean'
        ? s.meterNudgeDismissed
        : DEFAULT_SETTINGS.meterNudgeDismissed,
  };
}

/** Read the current settings, filling defaults. Safe outside an extension context. */
export async function loadSettings(): Promise<Settings> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return { ...DEFAULT_SETTINGS };
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(got[SETTINGS_KEY]);
}

/** Merge a patch into stored settings and persist. Returns the new settings. */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  }
  return next;
}
