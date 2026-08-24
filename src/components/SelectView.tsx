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
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "36px 20px 36px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 10 }}>How far from normal is this season?</h1>
      <p className="text-muted" style={{ fontSize: 15, marginBottom: 28 }}>
        Pick a current WNBA player. See how any of their seasons sits above or below their own baseline — or the league.
      </p>

      <PlayerSearch variant="hero" players={players} listError={listError} onPick={onPick} />

      <div style={{ marginTop: 34 }}>
        <h2
          className="text-muted"
          style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}
        >
          Featured players
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            columnGap: 24,
            borderTop: "2px solid var(--color-divider)",
          }}
        >
          {featured.map((f) => {
            return (
              <button
                key={f.espn}
                className="btn-reset row-hover"
                style={{
                  textAlign: "left",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 4px",
                  borderBottom: "1px solid var(--color-divider)",
                }}
                onClick={() => onPick(f.espn)}
              >
                <PlayerPhoto src={photoUrl(f.espn)} name={f.name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-heading" style={{ fontSize: 16 }}>{f.name}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {[f.team, f.pos].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-neutral-600)" strokeWidth="1.75">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
