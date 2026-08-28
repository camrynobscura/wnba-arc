import { useEffect, useId, useState } from "react";

interface InfoTipProps {
  /** The visible term (e.g. "GP"). */
  label: string;
  /** Plain-language explanation shown on hover/focus. */
  tip: string;
  /**
   * Keyboard-focusable (and in the a11y tree via aria-describedby) by default. Pass false
   * only when the InfoTip lives inside an `aria-hidden` visual (the Career Trend heatmap):
   * a focusable element inside aria-hidden is an axe `aria-hidden-focus` failure, and the
   * tooltip content there is redundant with the accessible stats below. Sighted mouse users
   * still get the hover tooltip; keyboard/AT users simply don't reach the hidden grid.
   */
  focusable?: boolean;
}

// Only ONE tooltip is open at a time. A module-level registry holds the open tip's id;
// opening any InfoTip records its id and notifies the others, which re-render closed.
// (The old pure-CSS :hover approach let several wide bubbles stay open and overlap as
// the pointer moved across adjacent headers — each bubble is a child of its trigger, so
// hovering one bubble kept it open while the next also opened.)
let openId: string | null = null;
const subscribers = new Set<() => void>();
function setOpenTip(id: string | null) {
  openId = id;
  subscribers.forEach((notify) => notify());
}

/**
 * A term with a hover/focus tooltip explaining it. Keyboard-focusable and linked via
 * aria-describedby so screen-reader and keyboard users get the explanation too, not just
 * mouse users. Open/close is JS-driven (see the registry above); Escape dismisses it
 * (WCAG 1.4.13), and the bubble is a child of the trigger so it stays hoverable.
 */
export function InfoTip({ label, tip, focusable = true }: InfoTipProps) {
  const id = useId();
  const [, rerender] = useState(0);

  useEffect(() => {
    const notify = () => rerender((n) => n + 1);
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
      if (openId === id) setOpenTip(null); // don't leave a dangling open id on unmount
    };
  }, [id]);

  const open = openId === id;
  const close = () => {
    if (openId === id) setOpenTip(null);
  };

  return (
    <span
      className="infotip"
      // Focus affordances only when focusable: inside an aria-hidden visual they'd be an
      // aria-hidden-focus violation, so there we keep mouse-hover only.
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable ? id : undefined}
      onMouseEnter={() => setOpenTip(id)}
      onMouseLeave={close}
      onFocus={focusable ? () => setOpenTip(id) : undefined}
      onBlur={focusable ? close : undefined}
      onKeyDown={focusable ? (e) => { if (e.key === "Escape") close(); } : undefined}
    >
      {label}
      <span role="tooltip" id={id} className={"infotip-bubble" + (open ? " is-open" : "")}>
        {tip}
      </span>
    </span>
  );
}
