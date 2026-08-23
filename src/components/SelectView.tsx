import { useMemo, useState } from "react";
import { photoUrl } from "../data/stats";
import type { PlayerSummary } from "../data/api";
import type { FeaturedPlayer } from "../data/featured";
import { PlayerPhoto } from "./PlayerPhoto";
import { Spinner } from "./Spinner";

interface SelectViewProps {
  /** Hand-curated players shown instantly from static data (no API wait). */
  featured: FeaturedPlayer[];
  /** Full roster from the API — null until it loads. Powers search + team names. */
  players: PlayerSummary[] | null;
  /** Set if the roster fetch failed; search is then unavailable but featured still show. */
  listError: string | null;
  onPick: (espn: string) => void;
}

/** Fold to a comparable form: strip diacritics, punctuation, and spaces (so "aja" matches "A'ja"). */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/** Reset styles so a <button> can act as a full-width list row without button chrome. */
const rowButtonReset: React.CSSProperties = {
  appearance: "none",
  background: "transparent",
  border: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  width: "100%",
  cursor: "pointer",
};

export function SelectView({ featured, players, listError, onPick }: SelectViewProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = fold(query);
    if (!q || !players) return [];
    return players.filter((p) => fold(p.name).includes(q) || fold(p.team ?? "").includes(q));
  }, [players, query]);

  const q = fold(query);
  const showDrop = q.length > 0 && filtered.length > 0;
  // Roster still loading while the user is already typing.
  const searchPending = q.length > 0 && players == null && !listError;
  const noMatches = q.length > 0 && players != null && filtered.length === 0;

  // Announced to screen readers as the search state changes (the dropdown appearing
  // is otherwise silent).
  const searchStatus = searchPending
    ? "Loading roster…"
    : showDrop
      ? `${filtered.length} ${filtered.length === 1 ? "result" : "results"}`
      : noMatches
        ? "No matching players"
        : "";

  return (
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "36px 20px 36px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 10 }}>How far from normal is this season?</h1>
      <p className="text-muted" style={{ fontSize: 15, marginBottom: 28 }}>
        Pick a current WNBA player. See how any of her seasons sits above or below her own baseline — or the league.
      </p>

      <div style={{ position: "relative" }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-neutral-600)",
            display: "flex",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </div>
        <input
          className="input"
          aria-label="Search players or teams"
          style={{ paddingLeft: 38, height: 48, fontSize: 16 }}
          placeholder={players ? "Search a player or team…" : "Loading roster for search…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {showDrop && (
          <div
            className="elev-md"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 54,
              zIndex: 10,
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
            }}
          >
            {filtered.map((p) => (
              <button
                key={p.espn}
                className="btn btn-block"
                style={{
                  justifyContent: "flex-start",
                  border: 0,
                  borderBottom: "1px solid var(--color-divider)",
                  padding: "12px 14px",
                  gap: 12,
                  marginTop: 0,
                }}
                onClick={() => onPick(p.espn)}
              >
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                <span
                  className="text-muted"
                  style={{ fontFamily: "var(--font-body)", fontSize: 12, marginLeft: "auto" }}
                >
                  {[p.team, p.pos].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Screen-reader announcement of the search state (visually hidden). */}
      <p role="status" aria-live="polite" className="sr-only">
        {searchStatus}
      </p>

      {searchPending && (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <Spinner /> Loading full roster…
        </p>
      )}
      {listError && (
        <p role="alert" className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Couldn't load the full roster — search is unavailable, but featured players still work.
        </p>
      )}

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
                className="row-hover"
                style={{
                  ...rowButtonReset,
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
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 16 }}>{f.name}</div>
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
