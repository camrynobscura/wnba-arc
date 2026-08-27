import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getLeague, getMeta, getPlayers, getPositions, type LeagueSeason, type PlayerSummary, type PositionSeason } from "./data/api";
import { makeLeague, makePositionLookup } from "./lib/deviation";
import { AppDataContext, type AppData } from "./appData";
import { Header } from "./components/Header";
import { SelectRoute } from "./routes/SelectRoute";
import { AboutRoute } from "./routes/AboutRoute";
import { PlayerLayout } from "./routes/PlayerLayout";
import { SummaryRoute } from "./routes/SummaryRoute";
import { StatRoute } from "./routes/StatRoute";

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
  const [lastScrapedAt, setLastScrapedAt] = useState<string | null>(null);

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
      .then((m) => setLastScrapedAt(m.lastScrapedAt))
      .catch(() => setLastScrapedAt(null));
  }, []);
  useEffect(() => {
    getPositions()
      .then((p) => setPositionData(p))
      .catch(() => setPositionData(null));
  }, []);

  const league = useMemo(() => (leagueData ? makeLeague(leagueData) : null), [leagueData]);
  const positions = useMemo(() => (positionData ? makePositionLookup(positionData) : null), [positionData]);

  const appData = useMemo<AppData>(
    () => ({ players, loadError, league, positions, lastScrapedAt }),
    [players, loadError, league, positions, lastScrapedAt],
  );

  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <Header onGoHome={() => navigate("/")} onAbout={() => navigate("/about")} />
      <ScrollToTop />
      <AppDataContext.Provider value={appData}>
        <Routes>
          <Route path="/" element={<SelectRoute />} />
          <Route path="/about" element={<AboutRoute />} />
          <Route path="/player/:slug" element={<PlayerLayout />}>
            <Route index element={<SummaryRoute />} />
            <Route path=":stat" element={<StatRoute />} />
          </Route>
          {/* Anything unrecognized → the landing page. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppDataContext.Provider>
    </div>
  );
}

/** Reset scroll to the top on a real navigation (pathname change) — but NOT on a query-param
 *  change, so clicking a bar to re-baseline the season doesn't yank the page to the top. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
