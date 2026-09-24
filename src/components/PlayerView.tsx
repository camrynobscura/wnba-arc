import { photoUrl } from "../data/stats";
import type { PlayerDetail, PlayerSummary } from "../data/api";
import { PlayerSearch } from "./PlayerSearch";
import type { CompareSegment, HeatmapMode, League, PositionLookup, StatDetail, StatKey } from "../lib/deviation";
import { CompareBar } from "./CompareBar";
import { PlayerPhoto } from "./PlayerPhoto";
import { teamTint } from "../data/teams";
import { playerMeta } from "../lib/playerMeta";
import { DeviationHeatmap } from "./DeviationHeatmap";
import { StatDrilldownView } from "./StatDrilldownView";

interface PlayerViewProps {
  player: PlayerDetail;
  league: League;
  positions: PositionLookup | null;
  playerPosition: string | null;
  mode: HeatmapMode;
  /** The sticky bar's three "Compare to" segments (unavailable ones disabled with a reason). */
  segments: CompareSegment[];
  /** The drill-down's stat, its built detail (for the page's mode), and its description. */
  statKey: StatKey;
  statDesc: string;
  statDetail: StatDetail;
  /** Full roster + its load error, for the in-row "search more players" box. */
  players: PlayerSummary[] | null;
  listError: string | null;
  onModeChange: (m: HeatmapMode) => void;
  onStatChange: (key: StatKey) => void;
  /** Like onStatChange, but also brings the drill-down section into view (a heatmap cell's
      "See … history" link / Enter). */
  onDrill: (key: StatKey) => void;
  onGoHome: () => void;
  onPick: (espn: string) => void;
}

/**
 * The whole player page, on one canvas: the season × stat heatmap (overview) on top, and the
 * year-by-year drill-down for one stat beneath it. Overview → detail without a navigation; the
 * selected stat lives in the URL so the page is still shareable. The reference both sections are
 * measured against is ONE control, the sticky CompareBar under the player header (the app has no
 * top nav; the way back to the list is the top row's button).
 */
export function PlayerView({
  player,
  league,
  positions,
  playerPosition,
  mode,
  segments,
  statKey,
  statDesc,
  statDetail,
  players,
  listError,
  onModeChange,
  onStatChange,
  onDrill,
  onGoHome,
  onPick,
}: PlayerViewProps) {
  return (
    <main id="main" className="view-main has-compare-bar">
      {/* Top row: back to all players (left) + jump straight to another player (right). (A cut of
          the sticky bar carried the back button instead, leaving the search floating alone up here —
          it looked stranded, and the player's name can't share the row with it on a phone.) */}
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
          /* The 2px rule under the header is the CompareBar's top border now (theme.css). */
        }}
      >
        <PlayerPhoto src={photoUrl(player.espn)} name={player.name} size={54} tint={teamTint(player.teamAbbr)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-kicker" style={{ marginBottom: "var(--space-1)" }}>
            {playerMeta(player, true)}
          </div>
          <h1 style={{ fontSize: "var(--fs-2xl)", margin: 0, lineHeight: 1 }}>{player.name}</h1>
        </div>
      </div>

      <CompareBar playerName={player.name} mode={mode} segments={segments} onModeChange={onModeChange} />

      <DeviationHeatmap
        player={player}
        league={league}
        positions={positions}
        playerPosition={playerPosition}
        mode={mode}
        onDrill={onDrill}
      />

      {/* No separate "missed seasons" note: the API's reason is always "Did not play" (ESPN has
          no historical injury data), which the grid's empty row, its cell popover and its cell
          labels already say. If real reasons are ever ingested, the popover is their home. */}

      <StatDrilldownView
        player={player}
        stat={statDetail}
        statKey={statKey}
        desc={statDesc}
        mode={mode}
        onStatChange={onStatChange}
      />
    </main>
  );
}
