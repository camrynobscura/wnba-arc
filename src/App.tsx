import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
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
      <ScrollManager />
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

/** How far down each history entry was scrolled, by location key — in memory (a reload starts at
 *  the top anyway). */
const scrollByKey = new Map<string, number>();

/** Scroll on navigation (user, 2026-09-26): **Back/Forward returns you to where you were** on that
 *  page — About's "← Back" is a history back too; **opening a new page starts at the top**; and a
 *  change that stays on the same player (the drill-down stat, the compare mode — history *replace*s)
 *  doesn't move the page, which would fight the "See … history" scroll into the section.
 *
 *  Restoring works because a page you come back to renders in the same pass: the player page reads
 *  the player from memory (`cachedPlayer`), the rest is static. The browser's own restoration is
 *  switched off — it restores before a client-rendered route has painted, and fights this. A layout
 *  effect, so the position is set before paint and the entry key flips before any scroll event
 *  (e.g. the browser clamping to a shorter page) can be recorded against the wrong entry. */
function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(location.key);
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

  // Record the current entry's position as the reader scrolls (once per frame).
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => scrollByKey.set(keyRef.current, window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    keyRef.current = location.key;
    const base = playerBase(location.pathname);
    const samePlayer = base != null && prevPath.current != null && playerBase(prevPath.current) === base;
    prevPath.current = location.pathname;
    if (navType === "POP") window.scrollTo(0, scrollByKey.get(location.key) ?? 0);
    else if (!samePlayer) window.scrollTo(0, 0);
    // Record the landing position too: a replace (a stat change) makes a new entry without a scroll.
    scrollByKey.set(location.key, window.scrollY);
  }, [location.key, location.pathname, navType]);
  return null;
}
