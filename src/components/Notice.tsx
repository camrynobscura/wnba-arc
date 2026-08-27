import { Spinner } from "./Spinner";

/** Minimal centered message for loading / error / not-found states. A loading notice
 *  (no back action) is a polite status; anything with a back action is an assertive alert. */
export function Notice({ title, detail, onBack }: { title: string; detail?: string; onBack?: () => void }) {
  const isError = onBack != null;
  return (
    <main
      id="main"
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "48px 20px", textAlign: "center" }}
    >
      {!isError && (
        <div style={{ marginBottom: 14 }}>
          <Spinner />
        </div>
      )}
      <p className="text-heading" style={{ fontSize: 18, marginBottom: 8 }}>
        {title}
      </p>
      {detail && (
        <p className="text-muted" style={{ fontSize: 13, wordBreak: "break-word" }}>
          {detail}
        </p>
      )}
      {onBack && (
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={onBack}>
          ← All players
        </button>
      )}
    </main>
  );
}
