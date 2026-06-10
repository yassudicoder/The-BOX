/**
 * Lightweight content script that injects the in-page capture button.
 *
 * Declared in the manifest's content_scripts for the three capture-capable
 * hosts, so it auto-runs on those pages. Deliberately tiny — it does NOT
 * bundle the extraction pipeline. On click it asks the background to open the
 * side panel and flag a pending capture; the heavy extractor is still injected
 * on demand by the background, exactly as before.
 */
import { createCaptureButton, FAB_HOST_ID } from './captureButton';
import type { Msg } from '../messaging/contracts';

function mount(): void {
  // Top frame only — never inject inside embedded iframes.
  if (window.top !== window.self) return;
  if (document.getElementById(FAB_HOST_ID)) return;

  const fab = createCaptureButton({
    onClick: async () => {
      fab.setBusy(true);
      try {
        // The side panel takes over from here (it picks up the pending flag
        // and runs the capture). We just kick it off.
        (await chrome.runtime.sendMessage({ type: 'CAPTURE_AND_OPEN' })) as Msg | undefined;
      } catch {
        // Background unreachable (e.g. extension reloaded) — nothing to do but
        // let the user retry.
      }
      // Revert the button shortly; the panel owns the real progress UI.
      window.setTimeout(() => fab.setBusy(false), 2500);
    },
  });

  (document.documentElement ?? document.body).appendChild(fab.host);
}

if (document.documentElement) {
  mount();
} else {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
}
