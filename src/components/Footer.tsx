interface FooterProps {
  /** ISO 8601 UTC of the latest successful scrape, or null when unknown. */
  lastScrapedAt: string | null;
}

/** Formats an ISO timestamp as e.g. "Aug 23, 2026"; null on a bad/empty value. */
function formatScrapedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * A quiet global footer showing dataset freshness. Renders nothing when the
 * scrape time is unknown (e.g. before the API exposes `/meta`, or a failed
 * fetch), so it never surfaces an error or an empty line. (The unofficial ·
 * data-from-ESPN attribution lives in the About page's "The data" section.)
 */
export function Footer({ lastScrapedAt }: FooterProps) {
  const asOf = formatScrapedAt(lastScrapedAt);
  if (!asOf) return null;

  return (
    <footer
      style={{
        width: "100%",
        maxWidth: "var(--app-width)",
        marginLeft: "auto",
        marginRight: "auto",
        padding: "0 var(--space-5) var(--space-6)",
      }}
    >
      {/* A small bordered chip echoing the nav's About / theme boxes, so it reads
          as part of the app chrome rather than a separated page footer. */}
      <span
        className="text-muted"
        style={{
          display: "inline-block",
          fontSize: "var(--fs-xs)",
          letterSpacing: "0.02em",
          padding: "var(--space-2) var(--space-3)",
          border: "1px solid var(--color-divider)",
        }}
      >
        Data current as of <time dateTime={lastScrapedAt ?? undefined}>{asOf}</time>
      </span>
    </footer>
  );
}
