/**
 * Pure positioning helpers for the HelpTip bubble.
 *
 * Hand-rolled (instead of pulling in a positioning library) because we have
 * ~14 static help tips, the panel is narrow, and the placement rules are
 * simple: prefer below, flip above when there's no room, clamp into the
 * viewport horizontally. Split out as a pure function so the placement
 * math is testable without rendering.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  /** bottom = top + height; convenience for callers using DOMRect. */
  bottom?: number;
}

export interface ClampInput {
  /** Bounding rect of the trigger button, in viewport coords. */
  trigger: Rect;
  /** Measured bubble rect (intrinsic size when free of constraints). */
  bubble: Rect;
  viewport: { width: number; height: number };
  /** Min margin from viewport edges. */
  margin?: number;
  /** Vertical gap between trigger and bubble. */
  gap?: number;
  /** Hard cap on bubble width regardless of viewport. */
  maxBubbleWidth?: number;
}

export interface ClampedPosition {
  top: number;
  left: number;
  maxWidth: number;
  placement: 'above' | 'below';
}

/**
 * Computes a clamped, flipped tooltip position for a fixed-positioned
 * bubble. All coordinates are in viewport (window) space — caller applies
 * them as inline `style` on a `position: fixed` element.
 */
export function clampTooltipPosition({
  trigger,
  bubble,
  viewport,
  margin = 8,
  gap = 6,
  maxBubbleWidth = 260,
}: ClampInput): ClampedPosition {
  const triggerBottom = trigger.bottom ?? trigger.top + trigger.height;

  // Effective max width: cap to constant, then clamp into available
  // viewport width (less margins).
  const maxWidth = Math.min(
    maxBubbleWidth,
    Math.max(0, viewport.width - margin * 2)
  );

  // Vertical: prefer below, flip above if there isn't room.
  const spaceBelow = viewport.height - triggerBottom - gap - margin;
  const spaceAbove = trigger.top - gap - margin;
  let placement: 'above' | 'below' = 'below';
  let top: number;
  if (bubble.height <= spaceBelow) {
    top = triggerBottom + gap;
  } else if (bubble.height <= spaceAbove) {
    placement = 'above';
    top = trigger.top - gap - bubble.height;
  } else {
    // Neither side fits perfectly; choose the side with more room and
    // pin to the margin if it would overflow.
    if (spaceBelow >= spaceAbove) {
      top = Math.max(margin, triggerBottom + gap);
    } else {
      placement = 'above';
      top = Math.max(margin, trigger.top - gap - bubble.height);
    }
  }

  // Horizontal: try to align bubble's left edge with the trigger; clamp
  // into the viewport on both sides. Use the bubble's measured width or
  // the cap, whichever is smaller, so a too-wide measurement still fits.
  const effectiveWidth = Math.min(bubble.width, maxWidth);
  let left = trigger.left;
  if (left + effectiveWidth > viewport.width - margin) {
    left = viewport.width - margin - effectiveWidth;
  }
  if (left < margin) left = margin;

  return { top, left, maxWidth, placement };
}
