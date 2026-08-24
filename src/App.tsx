import { useEffect, useMemo, useState } from "react";
import { STATS, type StatDef } from "./data/stats";
import { getLeague, getMeta, getPlayer, getPlayers, getPositions, type LeagueSeason, type PlayerDetail, type PlayerSummary, type PositionSeason } from "./data/api";
import { FEATURED } from "./data/featured";
import {
  buildCaption,
  buildRows,
  buildStatDetail,
  getBaselineContext,
  makeLeague,
  makePositionLookup,
  type ComparisonTarget,
  type ComparisonWindow,
} from "./lib/deviation";
import { Header } from "./components/Header";
import { SelectView } from "./components/SelectView";
import { SummaryView } from "./components/SummaryView";
import { StatDrilldownView } from "./components/StatDrilldownView";
import { AboutView } from "./components/AboutView";
import { Footer } from "./components/Footer";
import { Spinner } from "./components/Spinner";

type View = "select" | "summary" | "stat" | "about";

export default function App() {
  // ── loaded once on startup: the player list + per-year league data ──
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null);
  const [leagueData, setLeagueData] = useState<LeagueSeason[] | null>(null);
  const [positionData, setPositionData] = useState<PositionSeason[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastScrapedAt, setLastScrapedAt] = useState<string | null>(null);

  // ── the selected player, fetched on demand (lazy). Keyed on the STABLE espn id,
  //    not the DB id (surrogate ids change on a rebuild), resolved to an id at fetch. ──
  const [selectedEspn, setSelectedEspn] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── view + comparison controls ──
  const [view, setView] = useState<View>("select");
  const [statKey, setStatKey] = useState<StatDef["key"] | null>(null);
  const [subjectYear, setSubjectYear] = useState<number | null>(null);
  const [win, setWin] = useState<ComparisonWindow>("career");
  const [target, setTarget] = useState<ComparisonTarget>("own");

  // Load the player list + league data once, when the app mounts.
  useEffect(() => {
    Promise.all([getPlayers(), getLeague()])
      .then(([ps, lg]) => {
        setPlayers(ps);
        setLeagueData(lg);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  // Dataset freshness, fetched separately so a missing/failed /meta (e.g. before
  // the deployed API exposes it) never blanks the app — the footer just hides.
  useEffect(() => {
    getMeta()
      .then((m) => setLastScrapedAt(m.lastScrapedAt))
      .catch(() => setLastScrapedAt(null));
  }, []);

  // Position averages, also fetched separately (same reasoning as /meta): a failed or
  // not-yet-deployed /positions must never blank the app. When it's absent, the position
  // baseline simply isn't offered — own/league still work.
  useEffect(() => {
    getPositions()
      .then((p) => setPositionData(p))
      .catch(() => setPositionData(null));
  }, []);

  // Fetch the full history when a player is selected. Selection is by the stable
  // espn id; we resolve it to the current DB id via the loaded list. If a featured
  // card is clicked before that list has loaded, `id` is undefined and we bail —
  // the effect re-runs when `players` arrives (it's in the deps) and resolves then.
  useEffect(() => {
    if (selectedEspn == null) return;
    const id = players?.find((p) => p.espn === selectedEspn)?.id;
    if (id == null) return;
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    getPlayer(id)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        // Leave the subject unset — the baseline context defaults it to the latest
        // *selectable* (full) season, so a small-sample latest year isn't the default.
        setSubjectYear(null);
        setView("summary");
      })
      .catch((e) => !cancelled && setDetailError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [selectedEspn, players]);

  // Reset scroll to the top when navigating to a different view or player, so each
  // page (a stat drill-down, a new player) starts at the top instead of inheriting the
  // previous page's scroll position. Re-baselining (subjectYear change) keeps the view,
  // so it isn't in the deps — clicking a bar won't yank you to the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, selectedEspn]);

  // League lookup (per-year averages + slate lengths) built from the fetched data.
  const league = useMemo(() => (leagueData ? makeLeague(leagueData) : null), [leagueData]);
  // Position lookup — null until /positions loads (then position mode is offered).
  const positions = useMemo(() => (positionData ? makePositionLookup(positionData) : null), [positionData]);

  const statDef = useMemo(() => STATS.find((st) => st.key === statKey) ?? null, [statKey]);
  const ctx = useMemo(
    () => (detail && league ? getBaselineContext(detail, league, positions, subjectYear, target, win) : null),
    [detail, league, positions, subjectYear, target, win],
  );
  const statDetail = useMemo(
    () => (detail && ctx && statDef ? buildStatDetail(detail, statDef, ctx) : null),
    [detail, ctx, statDef],
  );

  const goHome = () => {
    setView("select");
    setSelectedEspn(null);
    setDetail(null);
    setStatKey(null);
    setSubjectYear(null);
  };

  const pick = (espn: string) => {
    setSelectedEspn(espn);
    setStatKey(null);
    setWin("career");
    setTarget("own");
  };

  // "This season" only applies to the external baselines; switching to "Their own" while it's
  // selected would be a meaningless self-comparison, so snap the window back to career.
  const changeTarget = (t: ComparisonTarget) => {
    setTarget(t);
    if (t === "own" && win === "thisYear") setWin("career");
  };

  const backToSummary = () => {
    setView("summary");
    setStatKey(null);
  };

  const openStat = (key: StatDef["key"]) => {
    setStatKey(key);
    setView("stat");
  };

  // About is a top-level view reachable from any screen; opening it leaves the
  // player/stat selection untouched so "Back" can drop the user right where they
  // were, reconstructed from that untouched state (stat > summary > select).
  const openAbout = () => setView("about");
  const closeAbout = () => {
    if (statKey != null) setView("stat");
    else if (selectedEspn != null) setView("summary");
    else setView("select");
  };

  // Hide the freshness footer while a selected player is still loading (or errored):
  // the Notice screen is nearly empty, so a static "Data current as of…" chip floating
  // beneath it reads as a glitch. About and the landing page show real content, so the
  // footer stays there.
  const playerPending =
    selectedEspn != null && view !== "about" && (detailError != null || detail == null || ctx == null);

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <Header onGoHome={goHome} onAbout={openAbout} />

      {view === "about" ? (
        <AboutView onBack={closeAbout} />
      ) : selectedEspn != null ? (
        detailError ? (
          <Notice title="Couldn't load this player" detail={detailError} onBack={goHome} />
        ) : detail == null || ctx == null ? (
          <Notice title="Loading player…" />
        ) : view === "summary" ? (
          <SummaryView
            player={detail}
            ctx={ctx}
            rows={buildRows(ctx)}
            caption={buildCaption(ctx)}
            players={players}
            listError={loadError}
            onWinChange={setWin}
            onTargetChange={changeTarget}
            onSubjectYearChange={setSubjectYear}
            onGoHome={goHome}
            onOpenStat={openStat}
            onPick={pick}
          />
        ) : view === "stat" && statDetail ? (
          <StatDrilldownView
            player={detail}
            stat={statDetail}
            target={ctx.requestedTarget}
            positionAvailable={ctx.positionAvailable}
            players={players}
            listError={loadError}
            onTargetChange={changeTarget}
            onBack={backToSummary}
            onSelectYear={setSubjectYear}
            onPick={pick}
          />
        ) : null
      ) : (
        <SelectView featured={FEATURED} players={players} listError={loadError} onPick={pick} />
      )}

      {!playerPending && <Footer lastScrapedAt={lastScrapedAt} />}
    </div>
  );
}

/** Minimal centered message for loading / error states. */
function Notice({ title, detail, onBack }: { title: string; detail?: string; onBack?: () => void }) {
  // A loading notice is a polite status; an error (has a back action) is assertive.
  const isError = onBack != null;
  return (
    <main
      id="main"
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "48px 20px", textAlign: "center" }}
    >
      {!isError && (
        <div style={{ marginBottom: 14 }}>
          <Spinner />
        </div>
      )}
      <p className="text-heading" style={{ fontSize: 18, marginBottom: 8 }}>{title}</p>
      {detail && (
        <p className="text-muted" style={{ fontSize: 13, wordBreak: "break-word" }}>
          {detail}
        </p>
      )}
      {onBack && (
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={onBack}>
          ← All players
        </button>
      )}
    </main>
  );
}
