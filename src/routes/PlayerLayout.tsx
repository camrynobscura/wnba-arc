import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { cachedPlayer, getPlayer, type PlayerDetail } from "../data/api";
import type { League, PositionLookup } from "../lib/deviation";
import { useAppData } from "../appData";
import { Footer } from "../components/Footer";
import { Notice } from "../components/Notice";
import { PlayerTopBar } from "../components/PlayerTopBar";
import { espnForSlug, playerPath } from "../lib/routes";

/** What the player subtree (summary + stat routes) reads from the layout via <Outlet>. By the
 *  time a child renders, detail + league are guaranteed present (the gate below waits for them). */
export interface PlayerOutletCtx {
  detail: PlayerDetail;
  league: League;
  positions: PositionLookup | null;
}

/** "/player/:slug" — resolves the slug to a player, fetches its full history, and gates the
 *  summary/stat children behind loading / error / not-found. Keyed on the URL, so navigating
 *  between players (or landing on a deep link cold) drives the fetch. */
export function PlayerLayout() {
  const { slug } = useParams();
  const { players, loadError, league, positions, meta } = useAppData();
  const navigate = useNavigate();
  // Name-slugs resolve against the roster (so the id stays out of the URL); the id-form resolves
  // without it. Null while the roster is still loading OR when nothing matches — the gates below
  // tell those apart (loading vs. not-found) so a name-slug never flashes a false "not found".
  const espn = useMemo(() => espnForSlug(slug, players), [slug, players]);

  // The player's DB id, once the espn resolves and the roster (which maps espn → DB id) is in. Null
  // for a bad slug, a roster still loading, or no such player — the gates below tell those apart.
  const id = useMemo(() => (espn == null || players == null ? null : (players.find((p) => p.espn === espn)?.id ?? null)), [espn, players]);

  // The player on screen. One fetched earlier this visit is read from memory during the FIRST
  // render (`cachedPlayer`), so coming back — About's Back, the browser's Back/Forward, a search —
  // shows the page at once, with no "Loading…" frame (user, 2026-09-26). A fresh player is fetched
  // below. Both are keyed by id, so switching players can never show the previous one for a frame.
  const [fetched, setFetched] = useState<{ id: string; detail: PlayerDetail } | null>(null);
  const [failed, setFailed] = useState<{ id: string; error: string } | null>(null);
  const detail = id == null ? null : (cachedPlayer(id) ?? (fetched?.id === id ? fetched.detail : null));
  const detailError = detail == null && id != null && failed?.id === id ? failed.error : null;

  useEffect(() => {
    if (id == null || cachedPlayer(id) != null) return;
    setFailed((f) => (f?.id === id ? null : f)); // a retry shows "Loading…", not the last error
    let cancelled = false;
    getPlayer(id)
      .then((d) => !cancelled && setFetched({ id, detail: d }))
      .catch((e) => !cancelled && setFailed({ id, error: String(e) }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Picking a new player is a fresh navigation — reset to the default mode + stat (no query).
  const pick = (espn: string) => navigate(playerPath(players?.find((p) => p.espn === espn)?.name ?? "", espn, players));

  // The page frame: <main> + the top row, around every state — loading, error, not-found and the
  // loaded page (user, 2026-09-26: keep the top row). Always the first child of the same fragment, so
  // React keeps it mounted from "Loading…" to the page — the row doesn't blink, and a search typed
  // during the load survives. Its "All players" is the way back from an error, so a Notice has no
  // button of its own.
  const frame = (content: ReactNode, loaded: boolean) => (
    <>
      <main id="main" className="view-main has-compare-bar">
        <PlayerTopBar players={players} listError={loadError} onPick={pick} />
        {content}
      </main>
      {loaded && <Footer meta={meta} />}
    </>
  );

  // Order matters. A name-slug can't resolve until the roster is in, so "loading roster" must win
  // over "not found" — otherwise a valid deep link flashes not-found on a cold load. And surfacing
  // a real not-found/error (vs. the old App's infinite spinner) is the point. No Footer on any of
  // these near-empty screens — the freshness chip there reads as a glitch.
  if (loadError) return frame(<Notice title="Couldn't load players" detail={loadError} error />, false);
  if (players == null || league == null) return frame(<Notice title="Loading…" />, false);
  if (espn == null || players.find((p) => p.espn === espn) == null)
    return frame(<Notice title="Player not found" detail="No player matches this link." error />, false);
  if (detailError) return frame(<Notice title="Couldn't load this player" detail={detailError} error />, false);
  // Same title as the roster/league gate above so a hard refresh shows one steady
  // "Loading…" instead of switching text between the two sequential load phases.
  if (detail == null) return frame(<Notice title="Loading…" />, false);

  return frame(<Outlet context={{ detail, league, positions } satisfies PlayerOutletCtx} />, true);
}
