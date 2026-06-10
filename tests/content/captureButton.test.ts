import { describe, it, expect, vi } from 'vitest';
import { createCaptureButton, FAB_HOST_ID } from '../../src/content/captureButton';

function button(handle: { host: HTMLElement }): HTMLButtonElement {
  const btn = handle.host.shadowRoot?.querySelector('button');
  if (!btn) throw new Error('button not found in shadow root');
  return btn as HTMLButtonElement;
}

describe('createCaptureButton', () => {
  it('creates a host with the well-known id and an open shadow root', () => {
    const handle = createCaptureButton({ onClick: () => {} });
    expect(handle.host.id).toBe(FAB_HOST_ID);
    expect(handle.host.shadowRoot).toBeTruthy();
  });

  it('renders an accessible button (aria-label) inside the shadow root', () => {
    const handle = createCaptureButton({ onClick: () => {} });
    const btn = button(handle);
    expect(btn.getAttribute('aria-label')).toMatch(/capture/i);
  });

  it('fixes the host to the viewport corner with a maximal z-index', () => {
    const handle = createCaptureButton({ onClick: () => {} });
    expect(handle.host.style.position).toBe('fixed');
    expect(handle.host.style.zIndex).toBe('2147483647');
  });

  it('invokes onClick when the button is clicked', () => {
    const onClick = vi.fn();
    const handle = createCaptureButton({ onClick });
    button(handle).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('setBusy disables the button and swaps the label, then restores it', () => {
    const handle = createCaptureButton({ onClick: () => {}, label: 'Continue AI' });
    const btn = button(handle);
    const txt = handle.host.shadowRoot?.querySelector('.txt');
    expect(txt?.textContent).toBe('Continue AI');

    handle.setBusy(true);
    expect(btn.disabled).toBe(true);
    expect(txt?.textContent).toBe('Capturing…');

    handle.setBusy(false);
    expect(btn.disabled).toBe(false);
    expect(txt?.textContent).toBe('Continue AI');
  });

  it('destroy removes the host from the DOM', () => {
    const handle = createCaptureButton({ onClick: () => {} });
    document.body.appendChild(handle.host);
    expect(document.getElementById(FAB_HOST_ID)).toBeTruthy();
    handle.destroy();
    expect(document.getElementById(FAB_HOST_ID)).toBeNull();
  });
});
