import { Spinner } from "./Spinner";

interface NoticeProps {
  title: string;
  detail?: string;
  /** An error or not-found (role=alert) rather than a loading status (role=status, with the spinner). */
  error?: boolean;
}

/** The player page's loading / error / not-found message, drawn inside PlayerLayout's frame under the
 *  top row — which stays for every state (user, 2026-09-26), so its "All players" is the way back and
 *  the notice has no button of its own. Loading is a polite status; an error is an assertive alert. */
export function Notice({ title, detail, error = false }: NoticeProps) {
  return (
    // The live-region role goes on this wrapper, NOT on <main>: role="status"/"alert" isn't an
    // allowed role for <main> and would drop the main landmark (a11y audit 2026-08-27). The <h1>
    // gives these screens a real page heading.
    <div
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      style={{ textAlign: "center", paddingTop: "var(--space-8)" }}
    >
      <h1 style={{ fontSize: "var(--fs-lg)", margin: "0 0 var(--space-2)" }}>{title}</h1>
      {/* The word first, the indicator under it (user's call, 2026-09-24 — it sat above the word),
          with a little more air between them (user, 2026-09-26: 24 → 32px). */}
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
