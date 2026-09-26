import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { getPlayer, type PlayerDetail } from "../data/api";
import type { League, PositionLookup } from "../lib/deviation";
import { useAppData } from "../appData";
import { Footer } from "../components/Footer";
import { Notice, NoticeBody } from "../components/Notice";
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

  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fetch the full history once the espn resolves and the roster (which maps espn → DB id) is in.
  // Re-runs on slug change (navigating to a different player) and when the roster finally loads.
  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    if (espn == null || players == null) return; // bad slug / roster still loading — handled below
    const id = players.find((p) => p.espn === espn)?.id;
    if (id == null) return; // roster loaded but no such player — not-found handled below
    let cancelled = false;
    getPlayer(id)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setDetailError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [espn, players]);

  const backHome = () => navigate("/");
  // Picking a new player is a fresh navigation — reset to the default mode + stat (no query).
  const pick = (espn: string) => navigate(playerPath(players?.find((p) => p.espn === espn)?.name ?? "", espn, players));

  // The page frame: <main> + the top row, around the loading state and the loaded page alike. Always
  // the first child of the same fragment, so React keeps it mounted from "Loading…" to the page —
  // the row doesn't blink, and a search typed during the load survives (user, 2026-09-26: keep the
  // top row while loading). The errors below keep their own screen and back button.
  const frame = (content: ReactNode, loaded: boolean) => (
    <>
      <main id="main" className="view-main has-compare-bar">
        <PlayerTopBar players={players} listError={loadError} onGoHome={backHome} onPick={pick} />
        {content}
      </main>
      {loaded && <Footer meta={meta} />}
    </>
  );
  const loading = (
    <div style={{ textAlign: "center", paddingTop: "var(--space-8)" }}>
      <NoticeBody title="Loading…" />
    </div>
  );

  // Order matters. A name-slug can't resolve until the roster is in, so "loading roster" must win
  // over "not found" — otherwise a valid deep link flashes not-found on a cold load. And surfacing
  // a real not-found/error (vs. the old App's infinite spinner) is the point. No Footer on any of
  // these near-empty screens — the freshness chip there reads as a glitch.
  if (loadError) return <Notice title="Couldn't load players" detail={loadError} onBack={backHome} />;
  if (players == null || league == null) return frame(loading, false);
  if (espn == null || players.find((p) => p.espn === espn) == null)
    return <Notice title="Player not found" detail="No current player matches this link." onBack={backHome} />;
  if (detailError) return <Notice title="Couldn't load this player" detail={detailError} onBack={backHome} />;
  // Same title as the roster/league gate above so a hard refresh shows one steady
  // "Loading…" instead of switching text between the two sequential load phases.
  if (detail == null) return frame(loading, false);

  return frame(<Outlet context={{ detail, league, positions } satisfies PlayerOutletCtx} />, true);
}
