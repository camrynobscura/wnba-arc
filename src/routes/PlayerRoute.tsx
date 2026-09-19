import { useMemo } from "react";
import { Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { PlayerView } from "../components/PlayerView";
import { STATS } from "../data/stats";
import { useAppData } from "../appData";
import type { PlayerOutletCtx } from "./PlayerLayout";
import { buildStatDetail, selfModeAvailable, type HeatmapMode, type StatKey } from "../lib/deviation";
import { playerPath, statPath, toMode, toStatKey } from "../lib/routes";

/** The drill-down stat shown when the URL has no `:stat` segment ("/player/aja-wilson"). */
const DEFAULT_STAT: StatKey = "pts";

/**
 * "/player/:slug" and "/player/:slug/:stat" — ONE page: the heatmap overview plus the drill-down
 * for one stat beneath it. The URL is the source of truth: `:stat` is the drill-down's stat and
 * `?vs=` the reference mode (self / league / position) that BOTH sections follow. (A `?year=`
 * subject season used to drive the drill-down; the cell popover carries per-season detail now,
 * so an old link with `?year=` simply ignores it.)
 */
export function PlayerRoute() {
  const { detail, league, positions } = useOutletContext<PlayerOutletCtx>();
  const { players, loadError } = useAppData();
  const { stat: statParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const positionAvailable = detail.pos != null && positions != null;
  const canSelf = selfModeAvailable(detail);
  // Honor a mode only where it's available: position needs the lookup and a known position; self
  // needs ≥2 seasons. Resolved once here, so the heatmap and the drill-down read the same mode.
  const requested = toMode(searchParams.get("vs"));
  const mode: HeatmapMode =
    requested === "position" && !positionAvailable ? (canSelf ? "self" : "league") : requested === "self" && !canSelf ? "league" : requested;

  // No :stat → the default; an unknown segment → bounce to the bare player path (below).
  const statKey: StatKey | null = statParam == null ? DEFAULT_STAT : toStatKey(statParam);
  const statDef = useMemo(() => (statKey ? (STATS.find((s) => s.key === statKey) ?? null) : null), [statKey]);
  const statDetail = useMemo(
    () => (statDef ? buildStatDetail(detail, statDef, mode, league, positions, detail.pos) : null),
    [detail, statDef, mode, league, positions],
  );

  // Mode / stat are view modifiers, not navigations → `replace`, so flipping through them doesn't
  // stack a dozen back-button steps. Self is the default mode, so it drops the param.
  const setMode = (m: HeatmapMode) =>
    setSearchParams(
      (prev) => {
        if (m === "self") prev.delete("vs");
        else prev.set("vs", m);
        return prev;
      },
      { replace: true },
    );
  const selectStat = (key: StatKey) => {
    const qs = searchParams.toString();
    navigate(`${statPath(detail.name, detail.espn, key, players)}${qs ? `?${qs}` : ""}`, { replace: true });
  };
  // A heatmap cell's "See … history" link / Enter: select the stat AND bring the section into
  // view, landing focus on its heading so keyboard + screen-reader users arrive there too. The
  // section is always mounted (both routes render this page), so scrolling needn't wait.
  const drill = (key: StatKey) => {
    selectStat(key);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    document.getElementById("drilldown")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    document.getElementById("drilldown-title")?.focus({ preventScroll: true });
  };
  // Picking a new player is a fresh navigation — reset to the default mode + stat (no query).
  const pick = (espn: string) => navigate(playerPath(players?.find((p) => p.espn === espn)?.name ?? "", espn, players));

  // Unknown stat segment (or nothing to render) → back to this player's bare page.
  if (statKey == null || statDef == null || statDetail == null) {
    return <Navigate to={playerPath(detail.name, detail.espn, players)} replace />;
  }

  return (
    <PlayerView
      player={detail}
      league={league}
      positions={positions}
      playerPosition={detail.pos}
      positionAvailable={positionAvailable}
      mode={mode}
      statKey={statKey}
      statDesc={statDef.desc}
      statDetail={statDetail}
      players={players}
      listError={loadError}
      onModeChange={setMode}
      onStatChange={selectStat}
      onDrill={drill}
      onGoHome={() => navigate("/")}
      onPick={pick}
    />
  );
}
