import { useMemo } from "react";
import { Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { StatDrilldownView } from "../components/StatDrilldownView";
import { STATS } from "../data/stats";
import { useAppData } from "../appData";
import type { PlayerOutletCtx } from "./PlayerLayout";
import { buildStatDetail, getBaselineContext, type ComparisonTarget } from "../lib/deviation";
import { playerPath, toStatKey, toTarget } from "../lib/routes";

/** "/player/:slug/:stat" — one stat's year-by-year history. Same `?year=`/`?vs=` params as the
 *  summary; an unknown :stat bounces back to the summary. */
export function StatRoute() {
  const { detail, league, positions } = useOutletContext<PlayerOutletCtx>();
  const { players, loadError } = useAppData();
  const { stat: statParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const statKey = toStatKey(statParam);
  const statDef = useMemo(() => (statKey ? (STATS.find((s) => s.key === statKey) ?? null) : null), [statKey]);

  const yearParam = searchParams.get("year");
  const subjectYear = yearParam ? Number(yearParam) : null;
  const positionAvailable = detail.pos != null && positions != null;
  const target: ComparisonTarget = toTarget(searchParams.get("vs")) === "position" && positionAvailable ? "position" : "league";

  const ctx = useMemo(
    () => getBaselineContext(detail, league, positions, subjectYear, target),
    [detail, league, positions, subjectYear, target],
  );
  const statDetail = useMemo(() => (statDef ? buildStatDetail(detail, statDef, ctx) : null), [detail, statDef, ctx]);

  const setYear = (year: number) =>
    setSearchParams(
      (prev) => {
        prev.set("year", String(year));
        return prev;
      },
      { replace: true },
    );
  const setTarget = (t: ComparisonTarget) =>
    setSearchParams(
      (prev) => {
        if (t === "position") prev.set("vs", "position");
        else prev.delete("vs");
        return prev;
      },
      { replace: true },
    );

  const qs = searchParams.toString();
  const backToSummary = () => navigate(`${playerPath(detail.name, detail.espn, players)}${qs ? `?${qs}` : ""}`);
  const pick = (espn: string) => navigate(playerPath(players?.find((p) => p.espn === espn)?.name ?? "", espn, players));

  // Unknown stat segment (or nothing to render) → back to this player's summary.
  if (statDef == null || statDetail == null) return <Navigate to={playerPath(detail.name, detail.espn, players)} replace />;

  return (
    <StatDrilldownView
      player={detail}
      stat={statDetail}
      target={ctx.target}
      positionAvailable={ctx.positionAvailable}
      players={players}
      listError={loadError}
      onTargetChange={setTarget}
      onBack={backToSummary}
      onSelectYear={setYear}
      onPick={pick}
    />
  );
}
