import { Link } from "react-router-dom";
import type { PlayerSummary } from "../data/api";
import { PlayerSearch } from "./PlayerSearch";

interface PlayerTopBarProps {
  /** The player list for the search box (null while it loads), and whether it failed. */
  players: PlayerSummary[] | null;
  listFailed: boolean;
  onPick: (espn: string) => void;
}

/**
 * The player page's top row: back to all players (left) and a search to jump to another player (right).
 * Rendered by the player layout, not the page, so it's on screen while a player loads and stays mounted
 * from loading to loaded: nothing blinks, and a search typed during the load isn't wiped.
 */
export function PlayerTopBar({ players, listFailed, onPick }: PlayerTopBarProps) {
  return (
    <div className="view-header">
      {/* A link, drawn as the ghost button (`.btn` resets the underline): it goes to a page. */}
      <Link to="/" className="btn btn-ghost" style={{ gap: "var(--space-2)" }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        <span>All players</span>
      </Link>
      <PlayerSearch variant="compact" players={players} listFailed={listFailed} onPick={onPick} />
    </div>
  );
}
