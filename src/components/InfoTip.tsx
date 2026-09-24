import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface InfoTipProps {
  /** The visible term (e.g. "GP"). */
  label: string;
  /** Plain-language explanation shown on hover/focus. */
  tip: string;
  /**
   * Keyboard-focusable (and in the a11y tree via aria-describedby) by default. Pass false
   * only when the InfoTip lives inside an `aria-hidden` visual: a focusable element inside
   * aria-hidden is an axe `aria-hidden-focus` failure. Sighted mouse users still get the hover
   * tooltip; keyboard/AT users simply don't reach the hidden visual.
   */
  focusable?: boolean;
}

// Only ONE tooltip is open at a time. A module-level registry holds the open tip's id;
// opening any InfoTip records its id and notifies the others, which re-render closed.
// (The old pure-CSS :hover approach let several wide bubbles stay open and overlap as
// the pointer moved across adjacent headers.)
let openId: string | null = null;
const subscribers = new Set<() => void>();
function setOpenTip(id: string | null) {
  openId = id;
  subscribers.forEach((notify) => notify());
}

/** Gap between the trigger and the bubble, px. */
const GAP = 6;
/** The bubble never comes closer than this to a viewport edge. */
const EDGE = 8;
/** Leaving the trigger closes the bubble after this long — time for the pointer to cross the gap
    into the bubble, which must stay hoverable (WCAG 1.4.13). */
const CLOSE_DELAY_MS = 120;

type Box = { top: number; bottom: number; left: number; width: number; height: number };

/**
 * Where the bubble goes, in VIEWPORT coordinates, from the trigger's box: above the trigger,
 * centered on it; below it when the space above is less than the bubble + gap + edge margin;
 * slid sideways so it never comes within EDGE of a viewport side. Pure, unit-tested.
 */
export function placeBubble(trigger: Box, bubble: { width: number; height: number }, viewportWidth: number): { top: number; left: number } {
  let top = trigger.top - bubble.height - GAP;
  if (top < EDGE) top = trigger.bottom + GAP;
  const left = Math.max(EDGE, Math.min(trigger.left + trigger.width / 2 - bubble.width / 2, viewportWidth - bubble.width - EDGE));
  return { top: Math.round(top), left: Math.round(left) };
}

/**
 * A term with a hover/focus tooltip explaining it. Keyboard-focusable and linked via
 * aria-describedby so screen-reader and keyboard users get the explanation too, not just
 * mouse users. Tap opens it on a phone; tap-outside, Escape, blur and pointer-leave close it.
 *
 * WHERE THE BUBBLE LIVES, and why (2026-09-24): it is rendered through a portal at the end of
 * the page's `<main>` (so it stays inside the landmark — axe's `region` rule flagged it at the end
 * of <body>) as an ordinary **absolutely positioned** element, placed from the trigger's
 * rectangle. Three placements were ruled out by measurement:
 *  - a child of the trigger: on phones the heatmap sits in a horizontal scroll wrapper, and a
 *    box that scrolls one way clips the other, so header bubbles were swallowed whole;
 *  - the top layer (`popover` + CSS anchor positioning): elegant, but iOS 26 Safari tints its
 *    toolbars from any top-layer / fixed element and turned the bottom bar black whenever a tip
 *    opened — a transparent popover shell with a painted child didn't help (WebKit bug, no known
 *    workaround), so no top layer and no `position: fixed`;
 *  - hence absolute in the document: Safari's sampler ignores flow content, nothing clips it, and
 *    it scrolls with the page like the thing it points at.
 * The bubble is a React child of the trigger (events bubble in the React tree) but not a DOM
 * child, so "outside" means outside both.
 */
export function InfoTip({ label, tip, focusable = true }: InfoTipProps) {
  const id = useId();
  const [, rerender] = useState(0);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const notify = () => rerender((n) => n + 1);
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
      if (openId === id) setOpenTip(null); // don't leave a dangling open id on unmount
    };
  }, [id]);

  const open = openId === id;
  const cancelClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const show = () => {
    cancelClose();
    setOpenTip(id);
  };
  const close = () => {
    cancelClose();
    if (openId === id) setOpenTip(null);
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(close, CLOSE_DELAY_MS);
  };

  // Place the bubble once it is displayed (layout effect: before paint, so it never flashes at
  // 0,0). Being absolute, it then moves with the content, so scrolling needs no handling.
  // Re-placed on resize. Self-correcting: set page coordinates, measure where the box actually
  // landed, and shift by the difference — so it doesn't matter which ancestor is the containing
  // block (<main> today; a positioned wrapper tomorrow would otherwise silently offset it).
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!open || !el) return;
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t) return;
      const want = placeBubble(t, el.getBoundingClientRect(), window.innerWidth);
      el.style.top = `${want.top + window.scrollY}px`;
      el.style.left = `${want.left + window.scrollX}px`;
      const got = el.getBoundingClientRect();
      const dy = Math.round(want.top - got.top);
      const dx = Math.round(want.left - got.left);
      if (dy || dx) {
        el.style.top = `${want.top + window.scrollY + dy}px`;
        el.style.left = `${want.left + window.scrollX + dx}px`;
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // A tap / click anywhere outside the trigger and the bubble closes it — the phone has no
  // pointer-leave. Escape closes it too, for a pointer-only open (focus isn't on the trigger).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !bubbleRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => cancelClose, []);

  // Always rendered (hidden when closed) so `aria-describedby` has something to point at. The
  // portal target is the page's <main> landmark (falling back to <body>), browser only.
  const bubble = (
    <span
      ref={bubbleRef}
      role="tooltip"
      id={id}
      className={"infotip-bubble infotip-floating" + (open ? " is-open" : "")}
      onMouseEnter={cancelClose}
      onMouseLeave={closeSoon}
    >
      {tip}
    </span>
  );

  return (
    <span
      ref={triggerRef}
      className="infotip"
      // Focus affordances only when focusable: inside an aria-hidden visual they'd be an
      // aria-hidden-focus violation, so there we keep mouse-hover only.
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={closeSoon}
      onClick={show} // a tap on a phone (no hover); on desktop a click on a hovered term is a no-op
      onFocus={focusable ? show : undefined}
      onBlur={focusable ? close : undefined}
    >
      {label}
      {typeof document !== "undefined" ? createPortal(bubble, document.getElementById("main") ?? document.body) : bubble}
    </span>
  );
}
