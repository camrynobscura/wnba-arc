import { Spinner } from "./Spinner";

interface NoticeProps {
  title: string;
  detail?: string;
  onBack?: () => void;
}

/** Minimal centered message for loading / error / not-found states. A loading notice
 *  (no back action) is a polite status; anything with a back action is an assertive alert. */
export function Notice(props: NoticeProps) {
  return (
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "var(--space-12) var(--space-5)", textAlign: "center" }}>
      <NoticeBody {...props} />
    </main>
  );
}

/** A notice's content without its <main>, for a page that keeps its own frame around it — the
 *  player page's loading state keeps its top row (user, 2026-09-26). */
export function NoticeBody({ title, detail, onBack }: NoticeProps) {
  const isError = onBack != null;
  return (
    // The live-region role goes on this wrapper, NOT on <main>: role="status"/"alert" isn't an
    // allowed role for <main> and would drop the main landmark (a11y audit 2026-08-27). The <h1>
    // gives these loading/error/not-found screens a real page heading.
    <div role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"}>
      <h1 style={{ fontSize: "var(--fs-lg)", margin: "0 0 var(--space-2)" }}>{title}</h1>
      {/* The word first, the indicator under it (user's call, 2026-09-24 — it sat above the word),
          with a little more air between them (user, 2026-09-26: 24 → 32px). */}
      {!isError && (
        <div style={{ marginTop: "var(--space-8)" }}>
          <Spinner />
        </div>
      )}
      {detail && (
        <p className="text-muted" style={{ fontSize: "var(--fs-sm)", wordBreak: "break-word" }}>
          {detail}
        </p>
      )}
      {onBack && (
        <button className="btn btn-ghost" style={{ marginTop: "var(--space-4)" }} onClick={onBack}>
          ← All players
        </button>
      )}
    </div>
  );
}
