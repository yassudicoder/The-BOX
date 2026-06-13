import { useCallback, useEffect, useState } from 'react';
import {
  loadSettings,
  saveSettings,
  normalizeSettings,
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  type Settings,
} from '../../messaging/settings';
import { meterUsageKey, type MeterUsage } from '../../messaging/meterUsage';
import type { Plan } from '../../core/context/meter';

interface MeterHook {
  settings: Settings;
  /** Live usage for the panel's active tab, or null if none/stale. */
  usage: MeterUsage | null;
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

  // Usage: read ONLY this tab's per-tab key. Show nothing until the active tab
  // id is known (no stale flash) and never react to other tabs' readings.
  useEffect(() => {
    if (activeTabId === null) {
      setUsage(null);
      return;
    }
    const key = meterUsageKey(activeTabId);
    let cancelled = false;
    const readUsage = async (): Promise<void> => {
      const got = await chrome.storage.local.get(key);
      if (!cancelled) setUsage((got[key] as MeterUsage | undefined) ?? null);
    };
    void readUsage();
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'local' && changes[key]) void readUsage();
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

  return { settings, usage, setEnabled, setPlan, dismissNudge };
}
