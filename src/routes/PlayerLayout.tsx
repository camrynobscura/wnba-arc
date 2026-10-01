import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { cachedPlayer, getPlayer, type PlayerDetail } from "../data/api";
import type { League, PositionLookup } from "../lib/deviation";
import { useAppData } from "../appData";
import { pageTitle, SITE_NAME, usePageTitle } from "../pageArrival";
import { Footer } from "../components/Footer";
import { MetaLine } from "../components/MetaLine";
import { Notice, type NoticeChoice } from "../components/Notice";
import { PlayerTopBar } from "../components/PlayerTopBar";
import { espnForSlug, matchesForSlug, playerPath } from "../lib/routes";
import { OFFLINE_HINT, RETRY_HINT, useOnline } from "../lib/loadFailure";
import { playerMeta } from "../lib/playerMeta";

/** What the player routes read from the layout through <Outlet>. By the time a child renders, detail and
 *  league are present (the gate below waits for them). */
export interface PlayerOutletCtx {
  detail: PlayerDetail;
  league: League;
  positions: PositionLookup | null;
}

/** "/player/:slug": resolves the slug to a player, fetches their full history, and shows the page, or
 *  loading, error or not-found. Keyed on the URL, so moving between players (or opening a link directly)
 *  drives the fetch. */
export function PlayerLayout() {
  const { slug } = useParams();
  const { players, loadFailed, league, positions, meta } = useAppData();
  const online = useOnline();
  const navigate = useNavigate();
  // Name slugs resolve against the player list (so the id stays out of the URL); the id form resolves
  // without it. Null while the list is loading or when nothing matches; the gates below tell those apart,
  // so a name slug never flashes a false "not found".
  const espn = useMemo(() => espnForSlug(slug, players), [slug, players]);
  // A bare name two players share ("michelle-campbell", typed by hand — the app's own links carry the id)
  // is never guessed at: the page offers both.
  const namesakes = useMemo(() => matchesForSlug(slug, players), [slug, players]);

  // The player's database id, once the ESPN id resolves and the list (which maps one to the other) is in.
  // Null for a bad slug, a list still loading, or no such player.
  const id = useMemo(
    () => (espn == null || players == null ? null : (players.find((p) => p.espn === espn)?.id ?? null)),
    [espn, players],
  );

  // The player on screen. One fetched earlier this visit is read from memory during the first render
  // (`cachedPlayer`), so coming back (Back, a search) shows the page at once, with no "Loading…" frame.
  // A new player is fetched below. Both are keyed by id, so switching players never shows the previous
  // one for a frame.
  const [fetched, setFetched] = useState<{ id: string; detail: PlayerDetail } | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const detail = id == null ? null : (cachedPlayer(id) ?? (fetched?.id === id ? fetched.detail : null));
  const detailFailed = detail == null && id != null && failedId === id;
  // Coming back to a player whose load failed shows "Loading…" while it's fetched again, not the old error.
  // Adjusted during render (React's pattern for state that follows a prop), not in the fetch effect.
  const [shownId, setShownId] = useState(id);
  if (shownId !== id) {
    setShownId(id);
    if (failedId === id) setFailedId(null);
  }

  useEffect(() => {
    if (id == null || cachedPlayer(id) != null) return;
    let cancelled = false;
    getPlayer(id)
      .then((d) => !cancelled && setFetched({ id, detail: d }))
      .catch((e) => {
        if (cancelled) return;
        console.error(e); // the page says what to do (lib/loadFailure); the error itself is for debugging
        setFailedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Picking a new player is a fresh navigation: the default mode and stat.
  const pick = (espn: string) => navigate(playerPath(players?.find((p) => p.espn === espn)?.name ?? "", espn, players));

  // Which screen this is. Order matters: a name slug can't resolve until the list is in, so loading must
  // win over "not found", or a valid link flashes not-found on a cold load. Either load failing is the
  // same thing to the visitor (this player didn't load), with the same fix.
  const failure = { title: "Couldn't load this player", detail: online ? RETRY_HINT : OFFLINE_HINT, error: true };
  const notice: { title: string; detail?: string; error?: boolean; choices?: NoticeChoice[] } | null = loadFailed
    ? failure
    : players == null || league == null
      ? { title: "Loading…" }
      : namesakes.length > 1
        ? {
            title: `${namesakes.length === 2 ? "Two" : namesakes.length} players are named ${namesakes[0].name}`,
            detail: "Which one?",
            choices: namesakes.map((p) => ({
              to: playerPath(p.name, p.espn, players),
              // The name is the same on every line: the career span and position tell them apart, and are
              // part of the link's name so no two links read alike.
              label: (
                <>
                  {p.name}, <MetaLine text={playerMeta(p)} />
                </>
              ),
            })),
          }
        : espn == null || players.find((p) => p.espn === espn) == null
          ? { title: "Player not found", detail: "No player matches this link.", error: true }
          : detailFailed
            ? failure
            : // The same title as the list and league gate above, so a refresh shows one steady
              // "Loading…" across the two load phases.
              detail == null
              ? { title: "Loading…" }
              : null;
  // The loaded page's data: there exactly when there's no notice.
  const loaded = notice == null && detail != null && league != null ? { detail, league } : null;

  // The tab: the player's name, the error, or the site's name alone while loading.
  usePageTitle(
    loaded ? pageTitle(loaded.detail.name) : notice?.error || notice?.choices ? pageTitle(notice.title) : SITE_NAME,
  );

  // The frame around every state (loading, error, not-found and the loaded page). The top row is a
  // <header> ahead of <main>, so "Skip to main content" skips it. Every state renders the same elements
  // in the same places, so React keeps the row mounted from "Loading…" to the page: it doesn't blink, and
  // a search typed during the load survives. Its "All players" is the way back from an error, so a Notice
  // has no button of its own. No footer on the near-empty notice screens, where the freshness line reads
  // as a glitch.
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header className="view-main view-top">
        <PlayerTopBar players={players} listFailed={loadFailed} onPick={pick} />
      </header>
      <main id="main" className="view-main has-compare-bar">
        {loaded ? (
          <Outlet context={{ detail: loaded.detail, league: loaded.league, positions } satisfies PlayerOutletCtx} />
        ) : (
          notice && <Notice title={notice.title} detail={notice.detail} error={notice.error} choices={notice.choices} />
        )}
      </main>
      {loaded && <Footer meta={meta} />}
    </>
  );
}
