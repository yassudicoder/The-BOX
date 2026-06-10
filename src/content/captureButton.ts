/**
 * Floating capture button injected into the AI chat page.
 *
 * Pure DOM factory — no chrome.* APIs — so it can be unit-tested in happy-dom.
 * The content-script entry (button.ts) wires the onClick to messaging. The
 * button lives inside a Shadow DOM so the host page's CSS can neither break it
 * nor be broken by it.
 */
export const FAB_HOST_ID = 'continue-ai-fab-host';

export interface CaptureButtonHandle {
  /** The host element to append to the page. */
  host: HTMLElement;
  /** Toggle the capturing/disabled state. */
  setBusy(busy: boolean): void;
  /** Remove the button from the page. */
  destroy(): void;
}

export interface CaptureButtonOptions {
  label?: string;
  onClick: () => void;
}

const STYLE = `
:host { all: initial; }
.fab {
  display: inline-flex; align-items: center; gap: 8px;
  font: 600 13px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: #fff; cursor: pointer;
  padding: 10px 14px; border: none; border-radius: 9999px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  box-shadow: 0 6px 20px rgba(37, 99, 235, .35);
  transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.fab:hover { transform: translateY(-1px); box-shadow: 0 8px 26px rgba(37, 99, 235, .45); }
.fab:active { transform: translateY(0); }
.fab:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.fab:disabled { cursor: default; opacity: .75; }
.dot {
  width: 8px; height: 8px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 0 0 rgba(255,255,255,.6);
}
.fab.busy .dot { animation: pulse 1s ease-in-out infinite; }
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(255,255,255,.6); }
  70% { box-shadow: 0 0 0 6px rgba(255,255,255,0); }
  100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
}
@media (prefers-reduced-motion: reduce) {
  .fab { transition: none; }
  .fab.busy .dot { animation: none; }
}
`;

export function createCaptureButton(options: CaptureButtonOptions): CaptureButtonHandle {
  const label = options.label ?? 'Continue AI';

  const host = document.createElement('div');
  host.id = FAB_HOST_ID;
  // Inline positioning on the host so we don't depend on the shadow style for
  // placement, and so `all: initial` inside the shadow can't move it.
  host.style.position = 'fixed';
  host.style.right = '20px';
  host.style.bottom = '20px';
  host.style.zIndex = '2147483647';

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLE;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fab';
  btn.setAttribute('aria-label', 'Capture this conversation with Continue AI');
  btn.setAttribute('title', 'Capture this conversation with Continue AI');

  const dot = document.createElement('span');
  dot.className = 'dot';
  const txt = document.createElement('span');
  txt.className = 'txt';
  txt.textContent = label;
  btn.append(dot, txt);

  btn.addEventListener('click', () => options.onClick());

  shadow.append(style, btn);

  return {
    host,
    setBusy(busy: boolean): void {
      btn.classList.toggle('busy', busy);
      btn.disabled = busy;
      txt.textContent = busy ? 'Capturing…' : label;
    },
    destroy(): void {
      host.remove();
    },
  };
}
