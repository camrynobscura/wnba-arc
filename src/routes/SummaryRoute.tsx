import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { SummaryView } from "../components/SummaryView";
import { useAppData } from "../appData";
import type { PlayerOutletCtx } from "./PlayerLayout";
import type { HeatmapMode, StatKey } from "../lib/deviation";
import { playerPath, statPath, toMode } from "../lib/routes";

/** "/player/:slug" (index) — the season heatmap. `?vs=` is the reference mode (self / league /
 *  position); the URL is the source of truth. Clicking a cell opens that season's drill-down. */
export function SummaryRoute() {
  const { detail, league, positions } = useOutletContext<PlayerOutletCtx>();
  const { players, loadError } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const positionAvailable = detail.pos != null && positions != null;
  const requested = toMode(searchParams.get("vs"));
  // Only honor position mode when it's actually available (else fall to the default).
  const mode: HeatmapMode = requested === "position" && !positionAvailable ? "self" : requested;

  // The reference mode is a view modifier, not a navigation → replace the history entry. Self is
  // the default, so it drops the param (clean URLs).
  const setMode = (m: HeatmapMode) =>
    setSearchParams(
      (prev) => {
        if (m === "self") prev.delete("vs");
        else prev.set("vs", m);
        return prev;
      },
      { replace: true },
    );

  // Open a cell → that season's drill-down for that stat, carrying the current mode so Back
  // returns to the same view (the drill-down reads vs=self as league, its default — see toTarget).
  const openCell = (year: number, key: StatKey) => {
    const params = new URLSearchParams(searchParams);
    params.set("year", String(year));
    const qs = params.toString();
    navigate(`${statPath(detail.name, detail.espn, key, players)}${qs ? `?${qs}` : ""}`);
  };
  // Picking a new player is a fresh navigation — reset to the default mode (no query).
  const pick = (espn: string) => navigate(playerPath(players?.find((p) => p.espn === espn)?.name ?? "", espn, players));

  return (
    <SummaryView
      player={detail}
      league={league}
      positions={positions}
      playerPosition={detail.pos}
      positionAvailable={positionAvailable}
      mode={mode}
      players={players}
      listError={loadError}
      onModeChange={setMode}
      onGoHome={() => navigate("/")}
      onOpenCell={openCell}
      onPick={pick}
    />
  );
}
