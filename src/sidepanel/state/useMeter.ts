import { useCallback, useEffect, useState } from 'react';
import {
  loadSettings,
  saveSettings,
  normalizeSettings,
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  type Settings,
} from '../../messaging/settings';
import {
  meterUsageKey,
  meterQuotaKey,
  type MeterUsage,
  type MeterQuota,
} from '../../messaging/meterUsage';
import type { Plan } from '../../core/context/meter';

interface MeterHook {
  settings: Settings;
  /** Live context-window estimate for the panel's active tab, or null if none. */
  usage: MeterUsage | null;
  /** Live EXACT Claude quota for the active tab, or null if none/unavailable. */
  quota: MeterQuota | null;
  setEnabled(enabled: boolean): void;
  setPlan(plan: Plan): void;
  dismissNudge(): void;
}

/**
 * Side-panel state for the context meter: reads the opt-in settings and the
 * latest usage reading the background stored, and keeps both live via
 * storage.onChanged. Usage is scoped to the panel's active tab so a reading from
 * another tab never bleeds in.
 */
export function useMeter(): MeterHook {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [usage, setUsage] = useState<MeterUsage | null>(null);
  const [quota, setQuota] = useState<MeterQuota | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  // Settings: load once and keep live, independent of which tab is active.
  useEffect(() => {
    void loadSettings().then(setSettings);
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setActiveTabId(tab?.id ?? null));
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'local' && changes[SETTINGS_KEY]) {
        setSettings(normalizeSettings(changes[SETTINGS_KEY].newValue));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // Readings: read ONLY this tab's per-tab keys (context estimate + exact
  // quota). Show nothing until the active tab id is known (no stale flash) and
  // never react to other tabs' readings.
  useEffect(() => {
    if (activeTabId === null) {
      setUsage(null);
      setQuota(null);
      return;
    }
    const usageK = meterUsageKey(activeTabId);
    const quotaK = meterQuotaKey(activeTabId);
    let cancelled = false;
    const read = async (): Promise<void> => {
      const got = await chrome.storage.local.get([usageK, quotaK]);
      if (cancelled) return;
      setUsage((got[usageK] as MeterUsage | undefined) ?? null);
      setQuota((got[quotaK] as MeterQuota | undefined) ?? null);
    };
    void read();
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'local' && (changes[usageK] || changes[quotaK])) void read();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [activeTabId]);

  const setEnabled = useCallback((enabled: boolean) => {
    void saveSettings({ contextMeterEnabled: enabled }).then(setSettings);
  }, []);
  const setPlan = useCallback((plan: Plan) => {
    void saveSettings({ plan }).then(setSettings);
  }, []);
  const dismissNudge = useCallback(() => {
    void saveSettings({ meterNudgeDismissed: true }).then(setSettings);
  }, []);

  return { settings, usage, quota, setEnabled, setPlan, dismissNudge };
}
