import { useRef } from "react";
import { useArrivalFocus } from "../pageArrival";
import type { PlayerDetail } from "../data/api";
import type { CompareSegment, HeatmapMode, League, PositionLookup, StatDetail, StatKey } from "../lib/deviation";
import { CompareBar } from "./CompareBar";
import { PlayerPhoto } from "./PlayerPhoto";
import { teamTint } from "../data/teams";
import { MetaLine } from "./MetaLine";
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
  /** The stat detail's stat, its built detail (for the page's mode) and its description. */
  statKey: StatKey;
  statDesc: string;
  statDetail: StatDetail;
  onModeChange: (m: HeatmapMode) => void;
  onStatChange: (key: StatKey) => void;
  /** Like onStatChange, but also brings the stat detail into view (a heatmap cell's "See … history" link,
      or Enter). */
  onDrill: (key: StatKey) => void;
}

/**
 * The player page: the season × stat heatmap on top and one stat's history beneath it, with no
 * navigation between them; the stat is in the URL, so the page stays shareable. Both sections are
 * measured against one reference, set in the sticky CompareBar under the player header.
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
  onModeChange,
  onStatChange,
  onDrill,
}: PlayerViewProps) {
  // No <main> and no top row here: the player layout draws both around this page (PlayerLayout),
  // so they stay on screen while a player loads.
  // The name takes focus when the page arrives by a page change: a new player, Back from About (pageArrival.ts).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useArrivalFocus(headingRef);
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          paddingBottom: "var(--space-4)",
        }}
      >
        <PlayerPhoto espn={player.espn} name={player.name} size={54} tint={teamTint(player.teamAbbr)} />
        {/* The name comes first in the markup and the team line second, so a screen reader that jumps to
            the heading reads on into "Las Vegas Aces, center, #22"; `order: -1` draws the line above the name. */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="page-heading"
            style={{ fontSize: "var(--fs-2xl)", margin: 0, lineHeight: 1 }}
          >
            {player.name}
          </h1>
          <div className="kicker" style={{ marginBottom: "var(--space-1)", order: -1 }}>
            <MetaLine text={playerMeta(player, true)} />
          </div>
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

      <StatDrilldownView
        player={player}
        stat={statDetail}
        statKey={statKey}
        desc={statDesc}
        mode={mode}
        onStatChange={onStatChange}
      />
    </>
  );
}
