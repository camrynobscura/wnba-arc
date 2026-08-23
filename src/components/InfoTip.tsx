import { useId } from "react";

interface InfoTipProps {
  /** The visible term (e.g. "GP"). */
  label: string;
  /** Plain-language explanation shown on hover/focus. */
  tip: string;
}

/**
 * A term with a hover/focus tooltip explaining it. Keyboard-focusable and linked via
 * aria-describedby so screen-reader and keyboard users get the explanation too, not just
 * mouse users. Show/hide is CSS-driven (see `.infotip` in theme.css).
 */
export function InfoTip({ label, tip }: InfoTipProps) {
  const id = useId();
  return (
    <span className="infotip" tabIndex={0} aria-describedby={id}>
      {label}
      <span role="tooltip" id={id} className="infotip-bubble">
        {tip}
      </span>
    </span>
  );
}
