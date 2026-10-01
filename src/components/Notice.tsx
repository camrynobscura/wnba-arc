import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useArrivalFocus } from "../pageArrival";
import { Spinner } from "./Spinner";

interface NoticeProps {
  title: string;
  detail?: string;
  /** An error or not-found (role=alert) rather than a loading status (role=status, with the spinner). */
  error?: boolean;
  /** Links to pick from, when the address names more than one player: a page of its own, not a status. */
  choices?: NoticeChoice[];
}

export interface NoticeChoice {
  to: string;
  label: ReactNode;
}

/** The player page's loading, error, not-found or which-player message, drawn inside PlayerLayout's frame
 *  under the top row, which stays for every state: its "All players" is the way back, so the notice has no
 *  button of its own. Loading is a polite status; an error is an assertive alert; a choice is a plain page
 *  with links. */
export function Notice({ title, detail, error = false, choices }: NoticeProps) {
  // An error or a choice is the page a change landed on, so its heading takes focus; "Loading…" isn't: the
  // player's own heading takes it when the page arrives (pageArrival.ts).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useArrivalFocus(headingRef, error || choices != null);
  return (
    // The live-region role goes on this wrapper, not on <main>: role="status" or "alert" isn't allowed on
    // <main> and would drop the main landmark. The <h1> gives these screens a real page heading. A choice
    // is no live region: it isn't news, it's the page.
    <div
      role={error ? "alert" : choices ? undefined : "status"}
      aria-live={error ? "assertive" : choices ? undefined : "polite"}
      style={{ textAlign: "center", paddingTop: "var(--space-8)" }}
    >
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="page-heading"
        style={{ fontSize: "var(--fs-lg)", margin: "0 0 var(--space-2)" }}
      >
        {title}
      </h1>
      {!error && !choices && (
        <div style={{ marginTop: "var(--space-8)" }}>
          <Spinner />
        </div>
      )}
      {detail && (
        <p className="text-muted" style={{ fontSize: "var(--fs-sm)", wordBreak: "break-word" }}>
          {detail}
        </p>
      )}
      {choices && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "var(--space-6) 0 0",
            display: "grid",
            gap: "var(--space-3)",
          }}
        >
          {choices.map((c) => (
            <li key={c.to}>
              <Link to={c.to}>{c.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
