import { Spinner } from "./Spinner";

/** Minimal centered message for loading / error / not-found states. A loading notice
 *  (no back action) is a polite status; anything with a back action is an assertive alert. */
export function Notice({ title, detail, onBack }: { title: string; detail?: string; onBack?: () => void }) {
  const isError = onBack != null;
  return (
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "48px 20px", textAlign: "center" }}>
      {/* The live-region role goes on this inner wrapper, NOT on <main>: role="status"/"alert"
          isn't an allowed role for <main> and would drop the main landmark (a11y audit 2026-08-27).
          The <h1> gives these loading/error/not-found screens a real page heading. */}
      <div role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"}>
        {!isError && (
          <div style={{ marginBottom: 14 }}>
            <Spinner />
          </div>
        )}
        <h1 style={{ fontSize: "var(--fs-lg)", margin: "0 0 8px" }}>{title}</h1>
        {detail && (
          <p className="text-muted" style={{ fontSize: "var(--fs-sm)", wordBreak: "break-word" }}>
            {detail}
          </p>
        )}
        {onBack && (
          <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={onBack}>
            ← All players
          </button>
        )}
      </div>
    </main>
  );
}
