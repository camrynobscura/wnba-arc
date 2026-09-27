import { useRef } from "react";
import { Link } from "react-router-dom";
import { useArrivalFocus } from "../pageArrival";
import { photoUrl } from "../data/stats";
import type { PlayerSummary } from "../data/api";
import type { FeaturedPlayer } from "../data/featured";
import { PlayerPhoto } from "./PlayerPhoto";
import { teamTintByName } from "../data/teams";
import { PlayerSearch } from "./PlayerSearch";
import { playerPath } from "../lib/routes";

interface SelectViewProps {
  /** Hand-curated players shown instantly from static data (no API wait). */
  featured: FeaturedPlayer[];
  /** Full roster from the API — null until it loads. Powers search + team names. */
  players: PlayerSummary[] | null;
  /** Set if the roster fetch failed; search is then unavailable but featured still show. */
  listError: string | null;
  /** A search result was chosen (the featured list is plain links). */
  onPick: (espn: string) => void;
}

export function SelectView({ featured, players, listError, onPick }: SelectViewProps) {
  // The heading takes focus when the landing page arrives by a page change (pageArrival.ts).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useArrivalFocus(headingRef);
  return (
    <main id="main" className="view-main" style={{ padding: "var(--space-10) var(--space-5)" }}>
      <h1 ref={headingRef} tabIndex={-1} className="page-heading" style={{ fontSize: "var(--fs-3xl)", marginBottom: "var(--space-3)" }}>
        How far from normal is this season?
      </h1>
      <p className="text-muted" style={{ fontSize: "var(--fs-base)", marginBottom: "var(--space-6)" }}>
        Pick a WNBA player. See how any season compares to the rest of their own career, and to the league that year.
      </p>

      <PlayerSearch variant="hero" players={players} listError={listError} onPick={onPick} />

      <div style={{ marginTop: "var(--space-8)" }}>
        <h2
          className="text-muted"
          style={{ fontSize: "var(--fs-sm)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "var(--space-2)" }}
        >
          Featured players
        </h2>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            columnGap: "var(--space-6)",
            borderTop: "2px solid var(--color-divider)",
          }}
        >
          {featured.map((f) => (
            <li key={f.espn}>
              {/* A link, not a button: it goes to a page, so it opens in a new tab, copies as a link and
                  is announced as one (craftsmanship review 1.1, 2026-09-26). The path needs no roster —
                  the roster only adds an id on a name collision, and none of the featured collide. */}
              <Link
                to={playerPath(f.name, f.espn, players)}
                className="row-hover"
                style={{
                  textAlign: "left",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  padding: "var(--space-4) var(--space-4)",
                  borderBottom: "1px solid var(--color-divider)",
                  textDecoration: "none",
                }}
              >
                <PlayerPhoto src={photoUrl(f.espn)} name={f.name} size={40} tint={teamTintByName(f.team)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-heading" style={{ fontSize: "var(--fs-base)" }}>{f.name}</div>
                  <div className="text-muted" style={{ fontSize: "var(--fs-xs)" }}>
                    {[f.team, f.pos].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-neutral-600)" strokeWidth="1.75">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
