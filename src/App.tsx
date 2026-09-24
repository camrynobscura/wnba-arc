import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getLeague, getMeta, getPlayers, getPositions, type LeagueSeason, type Meta, type PlayerSummary, type PositionSeason } from "./data/api";
import { makeLeague, makePositionLookup } from "./lib/deviation";
import { AppDataContext, type AppData } from "./appData";
import { SelectRoute } from "./routes/SelectRoute";
import { AboutRoute } from "./routes/AboutRoute";
import { PlayerLayout } from "./routes/PlayerLayout";
import { PlayerRoute } from "./routes/PlayerRoute";

/**
 * App shell: loads the app-wide data (roster + per-year league/position averages + freshness)
 * ONCE, shares it via context, and renders the route table. The URL is now the source of truth —
 * which player, stat, season, and compare-target all live in the address bar, not in state.
 */
export default function App() {
  // Loaded once on startup: the player list + per-year league data.
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null);
  const [leagueData, setLeagueData] = useState<LeagueSeason[] | null>(null);
  const [positionData, setPositionData] = useState<PositionSeason[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    Promise.all([getPlayers(), getLeague()])
      .then(([ps, lg]) => {
        setPlayers(ps);
        setLeagueData(lg);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  // Freshness + position averages are fetched separately so a missing/failed endpoint (e.g.
  // before the deployed API exposes it) never blanks the app — the footer just hides, and the
  // position baseline simply isn't offered.
  useEffect(() => {
    getMeta()
      .then((m) => setMeta(m))
      .catch(() => setMeta(null));
  }, []);
  useEffect(() => {
    getPositions()
      .then((p) => setPositionData(p))
      .catch(() => setPositionData(null));
  }, []);

  const league = useMemo(() => (leagueData ? makeLeague(leagueData) : null), [leagueData]);
  const positions = useMemo(() => (positionData ? makePositionLookup(positionData) : null), [positionData]);

  const appData = useMemo<AppData>(
    () => ({ players, loadError, league, positions, meta }),
    [players, loadError, league, positions, meta],
  );

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      {/* No app-wide top bar: the landing page is home, the player page's sticky CompareBar is the
          way back, and About + the theme switch live in the footer of every page. */}
      <ScrollToTop />
      <AppDataContext.Provider value={appData}>
        <Routes>
          <Route path="/" element={<SelectRoute />} />
          <Route path="/about" element={<AboutRoute />} />
          {/* One page for both: the bare path shows the default drill-down stat, ":stat" picks one.
              (They were two routes — summary + a separate drill-down page — until the drill-down
              moved inline beneath the heatmap.) */}
          <Route path="/player/:slug" element={<PlayerLayout />}>
            <Route index element={<PlayerRoute />} />
            <Route path=":stat" element={<PlayerRoute />} />
          </Route>
          {/* Anything unrecognized → the landing page. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppDataContext.Provider>
    </div>
  );
}

/** The "/player/<slug>" prefix of a pathname, or null off the player page. */
const playerBase = (p: string): string | null => p.match(/^\/player\/[^/]+/)?.[0] ?? null;

/** Reset scroll to the top on a real navigation (pathname change) — but NOT on a query-param
 *  change (re-baselining a season), and NOT when only the drill-down stat changed for the same
 *  player ("/player/x" → "/player/x/blk"): that's a view modifier on one page, and jumping to
 *  the top would fight the "See … history" scroll into the section. */
function ScrollToTop() {
  const { pathname } = useLocation();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const base = playerBase(pathname);
    const samePlayer = base != null && prev.current != null && playerBase(prev.current) === base;
    prev.current = pathname;
    if (!samePlayer) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
