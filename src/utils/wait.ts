export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitFor(
  predicate: () => Element | null,
  opts: { timeoutMs?: number; intervalMs?: number; root?: Document | ShadowRoot } = {}
): Promise<Element> {
  const { timeoutMs = 5000, intervalMs = 50 } = opts;
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const found = predicate();
    if (found) return found;
    await sleep(intervalMs);
  }
  throw new Error(`waitFor: timed out after ${timeoutMs}ms`);
}

/**
 * Waits until the DOM has been idle (no mutations) for `quietMs` continuous
 * milliseconds, up to `timeoutMs` total. Used after triggering scrolls so
 * virtualized lists can finish materializing.
 */
export async function waitForDomIdle(
  target: Element,
  opts: { quietMs?: number; timeoutMs?: number } = {}
): Promise<void> {
  const { quietMs = 300, timeoutMs = 4000 } = opts;
  return new Promise((resolve) => {
    let lastMutation = performance.now();
    const observer = new MutationObserver(() => {
      lastMutation = performance.now();
    });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    const start = performance.now();
    const check = (): void => {
      const now = performance.now();
      if (now - lastMutation >= quietMs || now - start >= timeoutMs) {
        observer.disconnect();
        resolve();
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}
