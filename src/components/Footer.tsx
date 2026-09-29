import { Link } from "react-router-dom";
import type { Meta } from "../data/api";
import { ThemeToggle } from "./ThemeToggle";

interface FooterProps {
  /** GET /meta, or null while loading or when the fetch failed. */
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
 * The footer's freshness line: "Stats through <the last completed game>", the sentence a stats site uses.
 * In the playoffs and the offseason it stays on the last regular-season game, which is the point.
 * "Data current as of <run time>" is the fallback for an API that hasn't recorded a game date yet.
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
 * The footer on every page: the About link and the light/dark switch, plus the freshness line when it's
 * known. The line hides before the API answers or when the fetch failed, so it never shows an error or
 * an empty line.
 */
export function Footer({ meta, showAbout = true }: FooterProps) {
  const fresh = freshnessLine(meta);

  return (
    <footer className="foot">
      {fresh && (
        <span className="foot-chip text-muted">
          {fresh.lead} <time dateTime={fresh.dateTime}>{fresh.day}</time>
        </span>
      )}
      {/* margin-left: auto keeps the icons on the right when the chip is hidden. No gap: each icon's hit
          area is 32px wide (theme.css .icon-btn), so the two glyphs sit 15px apart and read as a pair. */}
      <div style={{ display: "flex", alignItems: "center", marginLeft: "auto" }}>
        {/* Named by its `title` alone: an aria-label with the same text was read twice, as the name and
            again as the description. */}
        {showAbout && (
          <Link to="/about" className="icon-btn" title="About Arc">
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
