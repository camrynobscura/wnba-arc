import { useRef } from "react";
import { useArrivalFocus } from "../pageArrival";
import { Spinner } from "./Spinner";

interface NoticeProps {
  title: string;
  detail?: string;
  /** An error or not-found (role=alert) rather than a loading status (role=status, with the spinner). */
  error?: boolean;
}

/** The player page's loading, error or not-found message, drawn inside PlayerLayout's frame under the
 *  top row, which stays for every state: its "All players" is the way back, so the notice has no button of
 *  its own. Loading is a polite status; an error is an assertive alert. */
export function Notice({ title, detail, error = false }: NoticeProps) {
  // An error is the page a change landed on, so its heading takes focus; "Loading…" isn't: the player's own
  // heading takes it when the page arrives (pageArrival.ts).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useArrivalFocus(headingRef, error);
  return (
    // The live-region role goes on this wrapper, not on <main>: role="status" or "alert" isn't allowed on
    // <main> and would drop the main landmark. The <h1> gives these screens a real page heading.
    <div
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      style={{ textAlign: "center", paddingTop: "var(--space-8)" }}
    >
      <h1 ref={headingRef} tabIndex={-1} className="page-heading" style={{ fontSize: "var(--fs-lg)", margin: "0 0 var(--space-2)" }}>
        {title}
      </h1>
      {!error && (
        <div style={{ marginTop: "var(--space-8)" }}>
          <Spinner />
        </div>
      )}
      {detail && (
        <p className="text-muted" style={{ fontSize: "var(--fs-sm)", wordBreak: "break-word" }}>
          {detail}
        </p>
      )}
    </div>
  );
}
