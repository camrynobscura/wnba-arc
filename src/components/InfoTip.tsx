import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface InfoTipProps {
  label: string;
  /** What a screen reader calls the trigger when the visible term is only a mark: the rank column's
      "—" is "Not ranked". */
  name?: string;
  tip: string;
  /** 0 (the default): its own Tab stop. −1 when a composite widget moves focus to it (the heatmap's
      column headers, reached with the arrow keys) or when the keyboard reaches the same text elsewhere
      (the table's ranks, which the heatmap cell's popover shows). Hover and tap open it either way. */
  tabIndex?: 0 | -1;
  /** The trigger button, for a parent that moves focus to it (the heatmap's arrow keys). */
  triggerRef?: (el: HTMLButtonElement | null) => void;
}

// One tooltip open at a time: a module-level registry holds the open tip's id, and opening one notifies
// the others, which re-render closed.
let openId: string | null = null;
const subscribers = new Set<() => void>();
function setOpenTip(id: string | null) {
  openId = id;
  subscribers.forEach((notify) => notify());
}

/** A tooltip's text as a sentence: a closing period added when it has no end mark. Added here rather
    than in each string because some texts are shared with places where a period would be wrong (the
    rank notes are also the popover's Rank line and part of each cell's spoken name). */
export function asSentence(tip: string): string {
  return /[.!?]$/.test(tip) ? tip : `${tip}.`;
}

/** Gap between the trigger and the bubble, px. */
const GAP = 6;
/** The bubble never comes closer than this to a viewport edge. */
const EDGE = 8;
/** Leaving the trigger closes the bubble after this long: time for the pointer to cross the gap into
    the bubble, which must stay hoverable (WCAG 1.4.13). */
const CLOSE_DELAY_MS = 120;

type Box = { top: number; bottom: number; left: number; width: number; height: number };

/**
 * Where the bubble goes, in VIEWPORT coordinates, from the trigger's box: above the trigger,
 * centered on it; below it when the space above is less than the bubble + gap + edge margin;
 * slid sideways so it never comes within EDGE of a viewport side. Pure, unit-tested.
 */
export function placeBubble(
  trigger: Box,
  bubble: { width: number; height: number },
  viewportWidth: number,
): { top: number; left: number } {
  let top = trigger.top - bubble.height - GAP;
  if (top < EDGE) top = trigger.bottom + GAP;
  const left = Math.max(
    EDGE,
    Math.min(trigger.left + trigger.width / 2 - bubble.width / 2, viewportWidth - bubble.width - EDGE),
  );
  return { top: Math.round(top), left: Math.round(left) };
}

/**
 * A term with a tooltip. The term is a real `<button>` (a toggletip: it opens the explanation), drawn as
 * dotted-underlined text and linked with aria-describedby, so keyboard and screen-reader users get the
 * explanation too. A tap opens it on a phone; a tap outside, Escape, blur or the pointer leaving closes it.
 *
 * The bubble is portaled to the end of the page's <main> (inside the landmark: axe's `region` rule
 * flagged it at the end of <body>) as an absolutely positioned element, placed from the trigger's
 * rectangle. Not a child of the trigger: the phone heatmap's scroller clipped it (a box that scrolls one
 * way clips the other). Not the top layer (`popover`) or `position: fixed`: iOS 26 Safari tints its
 * toolbars from those, and turned the bottom bar black whenever a tip opened. Absolute in the document,
 * nothing clips it and it scrolls with the page. It's a React child of the trigger (events bubble
 * through the React tree) but not a DOM child, so "outside" means outside both.
 */
export function InfoTip({ label, name, tip, tabIndex = 0, triggerRef: exposeTrigger }: InfoTipProps) {
  const id = useId();
  const [, rerender] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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

  // Place the bubble once it's displayed (a layout effect, before paint, so it never flashes at 0,0).
  // Being absolute, it moves with the content, so scrolling needs no handling; resizing re-places it.
  // Self-correcting: set page coordinates, measure where the box landed, and shift by the difference,
  // so it doesn't matter which ancestor is the containing block.
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

  // A tap or click outside the trigger and the bubble closes it (a phone has no pointer-leave). Escape
  // closes it too, for a pointer-only open (focus isn't on the trigger).
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
      {asSentence(tip)}
    </span>
  );

  return (
    <button
      type="button"
      ref={(el) => {
        triggerRef.current = el;
        exposeTrigger?.(el);
      }}
      className="infotip"
      tabIndex={tabIndex}
      aria-label={name}
      aria-describedby={id}
      onMouseEnter={show}
      onMouseLeave={closeSoon}
      onClick={show} // a tap on a phone (no hover); on desktop a click on a hovered term is a no-op
      onFocus={show}
      onBlur={close}
    >
      {label}
      {/* A portal: the bubble is inside the button in the React tree only, not the DOM (see above). */}
      {typeof document !== "undefined"
        ? createPortal(bubble, document.getElementById("main") ?? document.body)
        : bubble}
    </button>
  );
}
