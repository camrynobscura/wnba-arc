import { Link } from "react-router-dom";
import type { Meta } from "../data/api";
import { ThemeToggle } from "./ThemeToggle";

interface FooterProps {
  /** GET /meta, or null while loading / when the fetch failed. */
  meta: Meta | null;
  /** False on the About page itself, where an About link would point at the page it's on. */
  showAbout?: boolean;
}

const DATE_FMT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

/** "YYYY-MM-DD" → "Sep 23, 2026", read as a calendar date (NOT `new Date(iso)`, which would take
    it as UTC midnight and print the day before in the Americas). Null on a bad value. */
function formatDay(ymd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, DATE_FMT);
}

/** ISO timestamp → "Sep 23, 2026"; null on a bad/empty value. */
function formatInstant(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, DATE_FMT);
}

/**
 * The freshness line for the footer chip. "Stats through <date of the last completed game>" is
 * the sentence a stats site uses and the one a reader wants: in-season it's yesterday's games,
 * in the playoffs and the off-season it stays on the last regular-season game — which is the
 * point. The old "Data current as of <run time>" kept saying "yesterday" all winter and read as if
 * something had changed (user, 2026-09-24). That line is the fallback for an API that hasn't
 * recorded a game date yet.
 */
export function freshnessLine(meta: Meta | null): { lead: string; day: string; dateTime: string } | null {
  if (!meta) return null;
  if (meta.statsThrough) {
    const day = formatDay(meta.statsThrough);
    if (day) return { lead: "Stats through", day, dateTime: meta.statsThrough };
  }
  if (meta.lastScrapedAt) {
    const day = formatInstant(meta.lastScrapedAt);
    if (day) return { lead: "Data current as of", day, dateTime: meta.lastScrapedAt };
  }
  return null;
}

/**
 * The app's quiet chrome, at the bottom of every page: the About link and the light/dark switch
 * (both lived in a sticky top bar until 2026-09-23 — the bar went, since the only control worth
 * pinning on a player page is its "Compare to" lens), plus the data-freshness chip when known. The
 * chip alone hides when nothing is known (before the API answers, or a failed fetch), so it never
 * surfaces an error or an empty line. (The unofficial · data-from-ESPN attribution lives in the
 * About page's "The data" section.)
 */
export function Footer({ meta, showAbout = true }: FooterProps) {
  const fresh = freshnessLine(meta);

  return (
    <footer className="foot">
      {/* The freshness chip on the left, the icons on the right (user, 2026-09-26). */}
      {fresh && (
        <span className="foot-chip text-muted">
          {fresh.lead} <time dateTime={fresh.dateTime}>{fresh.day}</time>
        </span>
      )}
      {/* margin-left: auto keeps the icons on the right when the chip is hidden (no /meta yet). No
          gap: each icon's hit area is 32px wide (theme.css .theme-toggle), so the two glyphs sit
          15px apart — a pair (user, 2026-09-26: no boxes; 25px → 17 → 11 → 15, a bigger target for a
          phone). */}
      <div style={{ display: "flex", alignItems: "center", marginLeft: "auto" }}>
        {/* The same info icon the old top bar had (user's call over an "About ARC" text chip), the
            same size and hit area as the theme switch so the two read as a pair. */}
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
    </footer>
  );
}
