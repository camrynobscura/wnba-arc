import { photoUrl } from "../data/stats";
import type { PlayerSummary } from "../data/api";
import type { FeaturedPlayer } from "../data/featured";
import { PlayerPhoto } from "./PlayerPhoto";
import { PlayerSearch } from "./PlayerSearch";

interface SelectViewProps {
  /** Hand-curated players shown instantly from static data (no API wait). */
  featured: FeaturedPlayer[];
  /** Full roster from the API — null until it loads. Powers search + team names. */
  players: PlayerSummary[] | null;
  /** Set if the roster fetch failed; search is then unavailable but featured still show. */
  listError: string | null;
  onPick: (espn: string) => void;
}

export function SelectView({ featured, players, listError, onPick }: SelectViewProps) {
  return (
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "var(--space-10) var(--space-5) var(--space-10)" }}>
      <h1 style={{ fontSize: "var(--fs-3xl)", marginBottom: "var(--space-3)" }}>How far from normal is this season?</h1>
      <p className="text-muted" style={{ fontSize: "var(--fs-base)", marginBottom: "var(--space-6)" }}>
        Pick a current WNBA player. See how any of their seasons sits above or below their own baseline — or the league.
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
              <button
                className="btn-reset row-hover"
                style={{
                  textAlign: "left",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  padding: "var(--space-4) var(--space-4)",
                  borderBottom: "1px solid var(--color-divider)",
                }}
                onClick={() => onPick(f.espn)}
              >
                <PlayerPhoto src={photoUrl(f.espn)} name={f.name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-heading" style={{ fontSize: "var(--fs-base)" }}>{f.name}</div>
                  <div className="text-muted" style={{ fontSize: "var(--fs-xs)" }}>
                    {[f.team, f.pos].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-neutral-600)" strokeWidth="1.75">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
