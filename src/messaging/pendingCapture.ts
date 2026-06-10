/**
 * Hand-off flag between the in-page capture button and the side panel.
 *
 * The button can't talk to the side panel directly, and it can't be sure the
 * panel is open yet. So the background writes this flag to chrome.storage.local
 * after opening the panel; the panel reads it on mount and via
 * storage.onChanged, then runs its normal capture flow against the given tab.
 *
 * Framework-agnostic and dependency-free so both the background service worker
 * and the panel can import it.
 */
export const PENDING_CAPTURE_KEY = 'capture:pending';

export interface PendingCapture {
  tabId: number;
  /** Epoch ms when the flag was written. Used to ignore stale flags. */
  at: number;
}

/** How long a pending flag is considered actionable before it's ignored. */
export const PENDING_CAPTURE_TTL_MS = 15_000;

export function isPendingFresh(p: PendingCapture | undefined | null, now: number): p is PendingCapture {
  if (!p || typeof p.tabId !== 'number' || typeof p.at !== 'number') return false;
  const age = now - p.at;
  return age >= 0 && age <= PENDING_CAPTURE_TTL_MS;
}
