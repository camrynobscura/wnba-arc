import { useMemo } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { SummaryView } from "../components/SummaryView";
import { useAppData } from "../appData";
import type { PlayerOutletCtx } from "./PlayerLayout";
import { buildCaption, buildRows, getBaselineContext, type ComparisonTarget, type StatKey } from "../lib/deviation";
import { playerPath, statPath, toTarget } from "../lib/routes";

/** "/player/:slug" (index) — the season summary. Reads the subject season + compare-target from
 *  the `?year=`/`?vs=` query params; the URL is the source of truth for both. */
export function SummaryRoute() {
  const { detail, league, positions } = useOutletContext<PlayerOutletCtx>();
  const { players, loadError } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const yearParam = searchParams.get("year");
  const subjectYear = yearParam ? Number(yearParam) : null; // out-of-range falls back in getBaselineContext
  const positionAvailable = detail.pos != null && positions != null;
  // Honor ?vs=position only when position data is actually available, so the dropdown's value
  // always matches an offered option.
  const target: ComparisonTarget = toTarget(searchParams.get("vs")) === "position" && positionAvailable ? "position" : "league";

  const ctx = useMemo(
    () => getBaselineContext(detail, league, positions, subjectYear, target),
    [detail, league, positions, subjectYear, target],
  );
  const rows = useMemo(() => buildRows(ctx), [ctx]);
  const caption = useMemo(() => buildCaption(ctx, detail.name), [ctx, detail.name]);

  // Season / compare-target are view modifiers, not navigations → replace the history entry so
  // clicking through years doesn't stack a dozen back-button steps. League is the default, so
  // it drops the param (keeps URLs clean).
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
  // Opening a stat carries the current year+vs so the drill-down opens on the same season/target.
  const openStat = (key: StatKey) => navigate(`${statPath(detail.name, detail.espn, key, players)}${qs ? `?${qs}` : ""}`);
  // Picking a new player is a fresh navigation — reset to league + default season (no query).
  const pick = (espn: string) => navigate(playerPath(players?.find((p) => p.espn === espn)?.name ?? "", espn, players));

  return (
    <SummaryView
      player={detail}
      ctx={ctx}
      rows={rows}
      caption={caption}
      players={players}
      listError={loadError}
      onTargetChange={setTarget}
      onSubjectYearChange={setYear}
      onGoHome={() => navigate("/")}
      onOpenStat={openStat}
      onPick={pick}
    />
  );
}
