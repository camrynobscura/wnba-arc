import { useRef } from "react";
import { Link } from "react-router-dom";
import { useArrivalFocus } from "../pageArrival";
import type { PlayerSummary } from "../data/api";
import type { FeaturedPlayer } from "../data/featured";
import { PlayerPhoto } from "./PlayerPhoto";
import { teamTintByName } from "../data/teams";
import { PlayerSearch } from "./PlayerSearch";
import { MetaLine } from "./MetaLine";
import { joinMeta, positionPart } from "../lib/playerMeta";
import { playerPath } from "../lib/routes";

interface SelectViewProps {
  /** Hand-picked players, shown at once from static data (no API wait). */
  featured: FeaturedPlayer[];
  /** Every player from the API; null until it loads. */
  players: PlayerSummary[] | null;
  /** The player list failed to load: search is unavailable (and so is every player page, which needs it). */
  listFailed: boolean;
  /** A search result was chosen (the featured list is plain links). */
  onPick: (espn: string) => void;
}

export function SelectView({ featured, players, listFailed, onPick }: SelectViewProps) {
  // The heading takes focus when the landing page arrives by a page change (pageArrival.ts).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useArrivalFocus(headingRef);
  return (
    <main id="main" className="view-main" style={{ padding: "var(--space-10) var(--space-5)" }}>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="page-heading"
        style={{ fontSize: "var(--fs-3xl)", marginBottom: "var(--space-3)" }}
      >
        WNBA Arc
      </h1>
      <p className="text-muted" style={{ fontSize: "var(--fs-base)", marginBottom: "var(--space-5)" }}>
        Breakout season or slump? Choose a player to see a heatmap of their stats over the years, measuring each season
        against the averages from their career, the league, or players at their position.
      </p>

      <PlayerSearch variant="hero" players={players} listFailed={listFailed} onPick={onPick} />

      <div style={{ marginTop: "var(--space-5)" }}>
        <h2
          className="text-muted"
          style={{
            fontSize: "var(--fs-md)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "var(--space-2)",
          }}
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
              {/* The path needs no player list: the list only adds an id on a name clash, and none of the
                  featured players clash. */}
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
                <PlayerPhoto espn={f.espn} name={f.name} size={40} tint={teamTintByName(f.team)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-heading" style={{ fontSize: "var(--fs-lg)", lineHeight: 1.2 }}>
                    {f.name}
                  </div>
                  <div className="text-muted" style={{ fontSize: "var(--fs-xs)" }}>
                    <MetaLine text={joinMeta([f.team, positionPart(f.pos)])} />
                  </div>
                </div>
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-neutral-600)"
                  strokeWidth="1.75"
                >
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
