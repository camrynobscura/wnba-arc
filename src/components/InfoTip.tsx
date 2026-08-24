import { useEffect, useId, useState } from "react";

interface InfoTipProps {
  /** The visible term (e.g. "GP"). */
  label: string;
  /** Plain-language explanation shown on hover/focus. */
  tip: string;
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
export function InfoTip({ label, tip }: InfoTipProps) {
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
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={() => setOpenTip(id)}
      onMouseLeave={close}
      onFocus={() => setOpenTip(id)}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      {label}
      <span role="tooltip" id={id} className={"infotip-bubble" + (open ? " is-open" : "")}>
        {tip}
      </span>
    </span>
  );
}
