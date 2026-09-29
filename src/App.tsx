import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import {
  getLeague,
  getMeta,
  getPlayers,
  getPositions,
  type LeagueSeason,
  type Meta,
  type PlayerSummary,
  type PositionSeason,
} from "./data/api";
import { makeLeague, makePositionLookup } from "./lib/deviation";
import { AppDataContext, type AppData } from "./appData";
import { markPageChange } from "./pageArrival";
import { SelectRoute } from "./routes/SelectRoute";
import { AboutRoute } from "./routes/AboutRoute";
import { PlayerLayout } from "./routes/PlayerLayout";
import { PlayerRoute } from "./routes/PlayerRoute";

/**
 * The app shell: loads the app-wide data (the player list, per-year league and position averages,
 * freshness) once, shares it through context, and renders the routes. The URL holds the view state:
 * which player, which stat's history and the comparison mode.
 */
export default function App() {
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null);
  const [leagueData, setLeagueData] = useState<LeagueSeason[] | null>(null);
  const [positionData, setPositionData] = useState<PositionSeason[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    Promise.all([getPlayers(), getLeague()])
      .then(([ps, lg]) => {
        setPlayers(ps);
        setLeagueData(lg);
      })
      .catch((e) => {
        console.error(e); // the pages say what to do (lib/loadFailure); the error itself is for debugging
        setLoadFailed(true);
      });
  }, []);

  // Freshness and position averages are fetched separately, so a failure there never blanks the app:
  // the footer's freshness line hides, and the position mode isn't offered.
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
    () => ({ players, loadFailed, league, positions, meta }),
    [players, loadFailed, league, positions, meta],
  );

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      {/* The skip link is the player page's (PlayerLayout): the only page with something ahead of its
          main content. */}
      <ScrollManager />
      <AppDataContext.Provider value={appData}>
        <Routes>
          <Route path="/" element={<SelectRoute />} />
          <Route path="/about" element={<AboutRoute />} />
          {/* One page for both: the bare path shows the default stat's history, ":stat" picks one. */}
          <Route path="/player/:slug" element={<PlayerLayout />}>
            <Route index element={<PlayerRoute />} />
            <Route path=":stat" element={<PlayerRoute />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppDataContext.Provider>
    </div>
  );
}

/** The "/player/<slug>" prefix of a pathname, or null off the player page. */
const playerBase = (p: string): string | null => p.match(/^\/player\/[^/]+/)?.[0] ?? null;

/** How far down each history entry was scrolled, by location key, in memory (a reload starts at the
 *  top anyway). */
const scrollByKey = new Map<string, number>();

/** Scroll on navigation: Back and Forward return to where you were on that page (About's "← Back" is a
 *  history back too); a new page starts at the top; and a change that stays on the same player (the
 *  stat, the comparison mode, both history replaces) doesn't move the page, which would fight the
 *  "See … history" scroll into the section.
 *
 *  Restoring works because a page you come back to renders in the same pass (the player page reads the
 *  player from memory, `cachedPlayer`). The browser's own restoration is off: it restores before a
 *  client-rendered route has painted. A layout effect, so the position is set before paint and the entry
 *  key flips before any scroll event (the browser clamping to a shorter page, say) is recorded against
 *  the wrong entry. */
function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(location.key);
  const prevPath = useRef<string | null>(null);
  // The entry the last page change was marked for: StrictMode runs this effect twice on mount, and the
  // second run must not count as a change.
  const markedKey = useRef<string | null>(null);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

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
    const firstPage = prevPath.current == null;
    prevPath.current = location.pathname;
    if (navType === "POP") window.scrollTo(0, scrollByKey.get(location.key) ?? 0);
    else if (!samePlayer) window.scrollTo(0, 0);
    // Record the landing position too: a replace (a stat change) makes a new entry without a scroll.
    scrollByKey.set(location.key, window.scrollY);
    // A new page (not the one the visit opened on, and not a stat or comparison change on the same
    // player): its heading takes focus (pageArrival.ts).
    if (!firstPage && !samePlayer && markedKey.current !== location.key) markPageChange();
    markedKey.current = location.key;
  }, [location.key, location.pathname, navType]);
  return null;
}
