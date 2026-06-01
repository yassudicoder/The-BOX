import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { clampTooltipPosition, type ClampedPosition } from './HelpTip.helpers';
import { helpAriaLabel } from '../strings';

/**
 * Coordinator: tracks the single currently-open tooltip id across the
 * tree. Opening one closes any other. Provider is optional — without it
 * each tooltip falls back to local state, so isolated uses still work.
 */
interface HelpTipCoord {
  openId: string | null;
  setOpenId: (id: string | null) => void;
}
const HelpTipContext = createContext<HelpTipCoord | null>(null);

export function HelpTipProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo<HelpTipCoord>(() => ({ openId, setOpenId }), [openId]);
  return <HelpTipContext.Provider value={value}>{children}</HelpTipContext.Provider>;
}

interface Props {
  /** User-facing label of the setting, used in the aria-label. */
  label: string;
  /** The body text of the tooltip. */
  text: string;
}

/**
 * Small "?" affordance that reveals a help bubble on hover, keyboard
 * focus, or click. Click pins the bubble open until another click,
 * Escape, or a click outside dismisses it. Bubble clamps into the
 * viewport and flips above the trigger when there's no room below.
 *
 * Accessibility:
 * - Trigger is a real <button> (keyboard focusable, touch-friendly tap
 *   target via padding).
 * - aria-label phrased as a question; aria-describedby links to the
 *   bubble while it's visible; bubble itself has role="tooltip".
 */
export const HelpTip = React.memo(function HelpTip({
  label,
  text,
}: Props): JSX.Element {
  const reactId = useId();
  const ctx = useContext(HelpTipContext);
  const [localOpenId, setLocalOpenId] = useState<string | null>(null);
  const openId = ctx ? ctx.openId : localOpenId;
  const setOpenId = ctx ? ctx.setOpenId : setLocalOpenId;

  const isOpen = openId === reactId;
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<ClampedPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const open = useCallback(() => setOpenId(reactId), [reactId, setOpenId]);
  const close = useCallback(() => {
    setOpenId(null);
    setPinned(false);
  }, [setOpenId]);

  // Reset pinned state if the bubble was preempted by another tooltip
  // opening (coordinator changed openId out from under us).
  useEffect(() => {
    if (!isOpen && pinned) setPinned(false);
  }, [isOpen, pinned]);

  // Click-outside dismiss while pinned.
  useEffect(() => {
    if (!isOpen || !pinned) return;
    function onDocPointerDown(e: PointerEvent): void {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (triggerRef.current?.contains(t)) return;
      if (bubbleRef.current?.contains(t)) return;
      close();
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [isOpen, pinned, close]);

  // Escape dismiss whenever visible.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // Reposition each time the bubble becomes visible. Uses the measured
  // intrinsic size; the bubble has an inline maxWidth that may shrink it
  // further on small viewports.
  useLayoutEffect(() => {
    if (!isOpen) {
      setPos(null);
      return;
    }
    const t = triggerRef.current;
    const b = bubbleRef.current;
    if (!t || !b) return;
    const triggerRect = t.getBoundingClientRect();
    const bubbleRect = b.getBoundingClientRect();
    setPos(
      clampTooltipPosition({
        trigger: triggerRect,
        bubble: bubbleRect,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      })
    );
  }, [isOpen, text]);

  const bubbleId = `${reactId}-bubble`;

  // Hover/focus handlers don't fire if a pin is already in effect; that
  // way a click-pinned tooltip survives a stray mouseleave.
  const handleEnter = useCallback(() => {
    if (!pinned) open();
  }, [pinned, open]);
  const handleLeave = useCallback(() => {
    if (!pinned) close();
  }, [pinned, close]);
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isOpen && pinned) {
        close();
      } else {
        open();
        setPinned(true);
      }
    },
    [isOpen, pinned, open, close]
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={helpAriaLabel(label)}
        aria-describedby={isOpen ? bubbleId : undefined}
        aria-expanded={isOpen}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        onClick={handleClick}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60"
      >
        <span aria-hidden="true">?</span>
      </button>
      {isOpen && (
        <div
          ref={bubbleRef}
          id={bubbleId}
          role="tooltip"
          style={
            pos
              ? {
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  maxWidth: pos.maxWidth,
                }
              : {
                  // First render before measurement: render off-screen so
                  // the layout effect can measure the natural size without
                  // a visible flicker at (0, 0).
                  position: 'fixed',
                  top: -9999,
                  left: -9999,
                  maxWidth: 260,
                  visibility: 'hidden',
                }
          }
          className="z-50 rounded-md border border-white/10 bg-neutral-900/95 px-3 py-2 text-[11px] leading-relaxed text-neutral-200 shadow-md backdrop-blur"
        >
          {text}
        </div>
      )}
    </>
  );
});
