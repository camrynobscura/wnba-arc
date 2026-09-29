import { STATS } from "../data/stats";
import type { HeatmapMode, StatKey } from "./deviation";

/** The player-list shape the path helpers need, kept structural so tests can pass plain objects. */
type RosterEntry = { espn: string; name: string };

/** "A'ja Wilson" → "aja-wilson": the readable slug that names a player in the URL. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (é → e)
    .replace(/['’‘]/g, "") // drop apostrophes so "A'ja" → "aja", not "a-ja"
    .replace(/[^a-z0-9]+/g, "-") // everything else → a single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/** Does another player share this exact slug? The only case a bare name is ambiguous (the two Michelle
 *  Campbells, for one). */
function slugCollides(slug: string, espn: string, roster: readonly RosterEntry[] | null | undefined): boolean {
  return roster?.some((p) => p.espn !== espn && slugifyName(p.name) === slug) ?? false;
}

/** Path to a player's page, e.g. "/player/aja-wilson". By name: the ESPN id is added ("…-3149391") only
 *  when another player has the same slug (which needs the list to detect), or when the name has no
 *  letters or digits. */
export function playerPath(name: string, espn: string, roster?: readonly RosterEntry[] | null): string {
  const slug = slugifyName(name);
  if (!slug) return `/player/${espn}`; // no letters/digits in the name → fall back to the id
  return `/player/${slugCollides(slug, espn, roster) ? `${slug}-${espn}` : slug}`;
}

/** Path to a player's page showing one stat's history, e.g. "/player/aja-wilson/blk". */
export function statPath(name: string, espn: string, stat: StatKey, roster?: readonly RosterEntry[] | null): string {
  return `${playerPath(name, espn, roster)}/${stat}`;
}

/** Resolve a URL slug to a player's ESPN id. A trailing "-<digits>" (the clash form, or a bare id)
 *  resolves without the player list; otherwise the slug is matched against the list by name. Null when
 *  it can't resolve (the list not loaded, or no such player). */
export function espnForSlug(slug: string | undefined, roster: readonly RosterEntry[] | null): string | null {
  if (!slug) return null;
  const idTail = slug.match(/-(\d+)$/) ?? slug.match(/^(\d+)$/); // "…-3149391" or a bare "3149391"
  if (idTail) return idTail[1];
  if (!roster) return null; // a name slug can only resolve once the list is in
  return roster.find((p) => slugifyName(p.name) === slug)?.espn ?? null;
}

/** Narrow a URL segment to a known stat key, else null (the page then redirects). */
export function toStatKey(seg: string | undefined): StatKey | null {
  return STATS.some((st) => st.key === seg) ? (seg as StatKey) : null;
}

/** The page's reference mode from the `vs` query value; absent or unknown means self. */
export function toMode(vs: string | null): HeatmapMode {
  return vs === "league" ? "league" : vs === "position" ? "position" : "self";
}
