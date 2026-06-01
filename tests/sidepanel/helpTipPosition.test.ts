import { describe, it, expect } from 'vitest';
import {
  clampTooltipPosition,
  type ClampInput,
  type Rect,
} from '../../src/sidepanel/components/HelpTip.helpers';

function rect(top: number, left: number, width: number, height: number): Rect {
  return { top, left, width, height, bottom: top + height };
}

const VIEWPORT_NARROW = { width: 380, height: 700 };
const DEFAULTS: Partial<ClampInput> = { margin: 8, gap: 6, maxBubbleWidth: 260 };

describe('clampTooltipPosition: vertical placement', () => {
  it('places below the trigger when there is room', () => {
    const result = clampTooltipPosition({
      ...DEFAULTS,
      trigger: rect(100, 50, 20, 20),
      bubble: rect(0, 0, 240, 60),
      viewport: VIEWPORT_NARROW,
    });
    expect(result.placement).toBe('below');
    // top = triggerBottom (120) + gap (6) = 126
    expect(result.top).toBe(126);
  });

  it('flips above the trigger when there is no room below', () => {
    const result = clampTooltipPosition({
      ...DEFAULTS,
      trigger: rect(650, 50, 20, 20),
      bubble: rect(0, 0, 240, 100),
      viewport: VIEWPORT_NARROW,
    });
    expect(result.placement).toBe('above');
    // top = triggerTop (650) - gap (6) - bubbleHeight (100) = 544
    expect(result.top).toBe(544);
  });

  it('picks the side with more room when neither side fits', () => {
    // Trigger near top, bubble is enormous — neither side fits cleanly.
    const result = clampTooltipPosition({
      ...DEFAULTS,
      trigger: rect(50, 50, 20, 20),
      bubble: rect(0, 0, 240, 800),
      viewport: VIEWPORT_NARROW,
    });
    expect(result.placement).toBe('below');
    expect(result.top).toBeGreaterThanOrEqual(8);
  });
});

describe('clampTooltipPosition: horizontal clamping', () => {
  it('aligns to the trigger left when it fits', () => {
    const result = clampTooltipPosition({
      ...DEFAULTS,
      trigger: rect(100, 50, 20, 20),
      bubble: rect(0, 0, 200, 60),
      viewport: VIEWPORT_NARROW,
    });
    expect(result.left).toBe(50);
  });

  it('clamps into the viewport when trigger is near the right edge', () => {
    // 380px viewport, 8px margin, measured bubble width 240. Right limit =
    // 380 - 8 = 372. Bubble must end at or before 372, so left ≤ 132.
    // (maxWidth is the CSS cap, possibly larger than the measured width;
    // the clamp uses the measured width to position the bubble.)
    const measuredWidth = 240;
    const result = clampTooltipPosition({
      ...DEFAULTS,
      trigger: rect(100, 350, 20, 20),
      bubble: rect(0, 0, measuredWidth, 60),
      viewport: VIEWPORT_NARROW,
    });
    expect(result.left).toBe(132);
    expect(result.left + measuredWidth).toBeLessThanOrEqual(VIEWPORT_NARROW.width - 8);
  });

  it('clamps to the left margin if trigger is past the left edge', () => {
    const result = clampTooltipPosition({
      ...DEFAULTS,
      trigger: rect(100, -50, 20, 20),
      bubble: rect(0, 0, 200, 60),
      viewport: VIEWPORT_NARROW,
    });
    expect(result.left).toBe(8);
  });
});

describe('clampTooltipPosition: maxWidth', () => {
  it('caps to maxBubbleWidth (260) on wide viewports', () => {
    const result = clampTooltipPosition({
      ...DEFAULTS,
      trigger: rect(100, 200, 20, 20),
      bubble: rect(0, 0, 600, 60),
      viewport: { width: 1200, height: 800 },
    });
    expect(result.maxWidth).toBe(260);
  });

  it('further clamps maxWidth to fit narrow viewports (less margins)', () => {
    // Viewport 200px wide, 8px margins → maxWidth ≤ 184.
    const result = clampTooltipPosition({
      ...DEFAULTS,
      trigger: rect(100, 0, 20, 20),
      bubble: rect(0, 0, 600, 60),
      viewport: { width: 200, height: 600 },
    });
    expect(result.maxWidth).toBe(200 - 8 * 2);
  });

  it('never returns a negative maxWidth, even on impossibly narrow viewports', () => {
    const result = clampTooltipPosition({
      ...DEFAULTS,
      trigger: rect(100, 0, 20, 20),
      bubble: rect(0, 0, 100, 60),
      viewport: { width: 10, height: 600 },
    });
    expect(result.maxWidth).toBeGreaterThanOrEqual(0);
  });
});

describe('clampTooltipPosition: default-DOMRect-shape inputs (no bottom field)', () => {
  it('computes triggerBottom from top + height when bottom is omitted', () => {
    const result = clampTooltipPosition({
      ...DEFAULTS,
      // No `bottom` field on the trigger rect — mirrors how a partial mock
      // might be supplied. Helper should fall back to top + height.
      trigger: { top: 100, left: 50, width: 20, height: 20 },
      bubble: { top: 0, left: 0, width: 200, height: 60 },
      viewport: VIEWPORT_NARROW,
    });
    expect(result.placement).toBe('below');
    expect(result.top).toBe(126);
  });
});
