import type { PlayerSummary } from "../data/api";
import { PlayerSearch } from "./PlayerSearch";

interface PlayerTopBarProps {
  /** Full roster + its load error, for the "search more players" box (null while it loads). */
  players: PlayerSummary[] | null;
  listError: string | null;
  onGoHome: () => void;
  onPick: (espn: string) => void;
}

/**
 * The player page's top row: back to all players (left) + jump straight to another player (right).
 * Rendered by the player LAYOUT, not the page, so it's on screen while a player loads and stays
 * mounted from loading to loaded (user, 2026-09-26) — nothing blinks, and a search typed during
 * the load isn't wiped. (A cut of the sticky bar carried the back button instead, leaving the
 * search floating alone up here — it looked stranded, and the player's name can't share the row
 * with it on a phone.)
 */
export function PlayerTopBar({ players, listError, onGoHome, onPick }: PlayerTopBarProps) {
  return (
    <div className="view-header">
      <button className="btn btn-ghost" style={{ gap: "var(--space-2)" }} onClick={onGoHome}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        <span>All players</span>
      </button>
      <PlayerSearch variant="compact" players={players} listError={listError} onPick={onPick} />
    </div>
  );
}
