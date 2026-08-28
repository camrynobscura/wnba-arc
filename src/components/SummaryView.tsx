import { photoUrl } from "../data/stats";
import type { PlayerDetail, PlayerSummary, SeasonMissed } from "../data/api";
import { PlayerSearch } from "./PlayerSearch";
import type { HeatmapMode, League, PositionLookup, StatKey } from "../lib/deviation";
import { PlayerPhoto } from "./PlayerPhoto";
import { DeviationHeatmap } from "./DeviationHeatmap";

/** "2019, 2021–2024" — collapse consecutive years into ranges for a compact list. */
function compressYears(years: number[]): string {
  const sorted = [...years].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = sorted[i];
  }
  return parts.join(", ");
}

interface SummaryViewProps {
  player: PlayerDetail;
  league: League;
  positions: PositionLookup | null;
  playerPosition: string | null;
  /** Whether "vs their position" can be offered (position known AND /positions loaded). */
  positionAvailable: boolean;
  mode: HeatmapMode;
  /** Full roster + its load error, for the in-row "search more players" box. */
  players: PlayerSummary[] | null;
  listError: string | null;
  onModeChange: (m: HeatmapMode) => void;
  onGoHome: () => void;
  onOpenCell: (year: number, key: StatKey) => void;
  onPick: (espn: string) => void;
}

export function SummaryView({
  player,
  league,
  positions,
  playerPosition,
  positionAvailable,
  mode,
  players,
  listError,
  onModeChange,
  onGoHome,
  onOpenCell,
  onPick,
}: SummaryViewProps) {
  // Missed (no-data) seasons, grouped by reason so several gaps read as one compact line — the
  // heatmap shows the gaps, but only this note carries *why* (injury / maternity / overseas).
  const missed = player.seasons.filter((s): s is SeasonMissed => !s.played);
  const missedByReason = new Map<string, number[]>();
  for (const m of missed) {
    const reason = (m.reason || "did not play").toLowerCase();
    missedByReason.set(reason, [...(missedByReason.get(reason) ?? []), m.year]);
  }
  const missedGroups = [...missedByReason.entries()];

  return (
    <main id="main" className="view-main">
      {/* Top row: back to all players (left) + jump straight to another player (right). */}
      <div className="view-header">
        <button className="btn btn-ghost" style={{ gap: "var(--space-2)" }} onClick={onGoHome}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>All players</span>
        </button>
        <PlayerSearch variant="compact" players={players} listError={listError} onPick={onPick} />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          paddingBottom: "var(--space-4)",
          marginBottom: "var(--space-4)",
          borderBottom: "2px solid var(--color-divider)",
        }}
      >
        <PlayerPhoto src={photoUrl(player.espn)} name={player.name} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-kicker" style={{ marginBottom: "var(--space-1)" }}>
            {player.team} · {player.pos} · #{player.jersey}
          </div>
          <h1 style={{ fontSize: "var(--fs-2xl)", margin: 0, lineHeight: 1 }}>{player.name}</h1>
        </div>
      </div>

      <DeviationHeatmap
        player={player}
        league={league}
        positions={positions}
        playerPosition={playerPosition}
        positionAvailable={positionAvailable}
        mode={mode}
        onModeChange={onModeChange}
        onOpenCell={onOpenCell}
      />

      {/* Missed-season reasons — the one thing the grid's gaps can't show on their own. */}
      {missedGroups.length > 0 && (
        <div role="note" className="note-card" style={{ margin: "var(--space-5) 0 0" }}>
          {missedGroups.map(([reason, years]) => (
            <div key={`ms-${reason}`}>
              <strong style={{ fontWeight: 600 }}>
                {years.length === 1 ? `No ${years[0]} season on record` : `No seasons on record for ${compressYears(years)}`}
              </strong>{" "}
              — {reason}.
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
