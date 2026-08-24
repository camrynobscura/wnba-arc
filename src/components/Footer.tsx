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
 * fetch), so it never surfaces an error or an empty line.
 */
export function Footer({ lastScrapedAt }: FooterProps) {
  const asOf = formatScrapedAt(lastScrapedAt);
  if (!asOf) return null;

  return (
    <footer
      style={{
        marginTop: "auto",
        width: "100%",
        maxWidth: "var(--app-width)",
        marginLeft: "auto",
        marginRight: "auto",
        padding: "20px",
        borderTop: "1px solid var(--color-divider)",
      }}
    >
      <p className="text-muted" style={{ fontSize: 12, letterSpacing: "0.02em" }}>
        Data current as of {asOf}
      </p>
    </footer>
  );
}
