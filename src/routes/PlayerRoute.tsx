import { useMemo } from "react";
import { Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { PlayerView } from "../components/PlayerView";
import { STATS } from "../data/stats";
import { useAppData } from "../appData";
import type { PlayerOutletCtx } from "./PlayerLayout";
import { buildStatDetail, compareSegments, selfModeAvailable, type HeatmapMode, type StatKey } from "../lib/deviation";
import { playerPath, statPath, toMode, toStatKey } from "../lib/routes";

/** The stat shown when the URL has no `:stat` segment ("/player/aja-wilson"). */
const DEFAULT_STAT: StatKey = "pts";

/**
 * "/player/:slug" and "/player/:slug/:stat": one page, the heatmap plus one stat's history beneath it.
 * The URL holds the state: `:stat` is the stat, and `?vs=` the reference mode (self, league or position)
 * both sections follow.
 */
export function PlayerRoute() {
  const { detail, league, positions } = useOutletContext<PlayerOutletCtx>();
  const { players } = useAppData();
  const { stat: statParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const positionAvailable = detail.pos != null && positions != null;
  const canSelf = selfModeAvailable(detail);
  // Honor a mode only where it's available: position needs the lookup and a known position, self needs two
  // or more seasons. Resolved once here, so the heatmap and the stat detail read the same mode.
  const requested = toMode(searchParams.get("vs"));
  const mode: HeatmapMode =
    requested === "position" && !positionAvailable
      ? canSelf
        ? "self"
        : "league"
      : requested === "self" && !canSelf
        ? "league"
        : requested;
  // The sticky bar's segments follow the same rules, so the bar never offers a mode the page would
  // immediately swap out.
  const segments = useMemo(
    () => compareSegments(canSelf, detail.pos, positions != null),
    [canSelf, detail.pos, positions],
  );

  // No :stat: the default. An unknown one: back to the bare player path (below).
  const statKey: StatKey | null = statParam == null ? DEFAULT_STAT : toStatKey(statParam);
  const statDef = useMemo(() => (statKey ? (STATS.find((s) => s.key === statKey) ?? null) : null), [statKey]);
  const statDetail = useMemo(
    () => (statDef ? buildStatDetail(detail, statDef, mode, league, positions, detail.pos) : null),
    [detail, statDef, mode, league, positions],
  );

  // Mode and stat changes replace the history entry, so flipping through them doesn't stack a dozen
  // back-button steps. Self is the default mode, so it drops the param.
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
  // A heatmap cell's "See … history" link, or Enter: select the stat and bring the section into view,
  // with focus on its heading so keyboard and screen-reader users arrive there too. The section is always
  // mounted, so scrolling needn't wait.
  const drill = (key: StatKey) => {
    selectStat(key);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    document.getElementById("drilldown")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    document.getElementById("drilldown-title")?.focus({ preventScroll: true });
  };

  // An unknown stat (or nothing to render): back to this player's bare page.
  if (statKey == null || statDef == null || statDetail == null) {
    return <Navigate to={playerPath(detail.name, detail.espn, players)} replace />;
  }

  return (
    <PlayerView
      player={detail}
      league={league}
      positions={positions}
      playerPosition={detail.pos}
      mode={mode}
      segments={segments}
      statKey={statKey}
      statDesc={statDef.desc}
      statDetail={statDetail}
      onModeChange={setMode}
      onStatChange={selectStat}
      onDrill={drill}
    />
  );
}
