import { Link } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

interface FooterProps {
  /** ISO 8601 UTC of the latest successful scrape, or null when unknown. */
  lastScrapedAt: string | null;
  /** False on the About page itself, where an About link would point at the page it's on. */
  showAbout?: boolean;
}

/** Formats an ISO timestamp as e.g. "Aug 23, 2026"; null on a bad/empty value. */
function formatScrapedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * The app's quiet chrome, at the bottom of every page: the About link and the light/dark switch
 * (both lived in a sticky top bar until 2026-09-23 — the bar went, since the only control worth
 * pinning on a player page is its "Compare to" lens), plus dataset freshness when known. The
 * freshness chip alone hides when the scrape time is unknown (before the API exposes `/meta`, or
 * a failed fetch), so it never surfaces an error or an empty line. (The unofficial · data-from-ESPN
 * attribution lives in the About page's "The data" section.)
 */
export function Footer({ lastScrapedAt, showAbout = true }: FooterProps) {
  const asOf = formatScrapedAt(lastScrapedAt);

  return (
    <footer className="foot">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        {/* The same info icon the old top bar had (user's call over an "About ARC" text chip), in the
            theme switch's square so the two read as a pair. */}
        {showAbout && (
          <Link to="/about" className="theme-toggle" aria-label="About ARC" title="About ARC">
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
          </Link>
        )}
        <ThemeToggle />
      </div>
      {asOf && (
        <span className="foot-chip text-muted">
          Data current as of <time dateTime={lastScrapedAt ?? undefined}>{asOf}</time>
        </span>
      )}
    </footer>
  );
}
