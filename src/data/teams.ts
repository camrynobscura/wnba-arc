/**
 * Current WNBA teams, keyed by the abbreviation our API sends as `teamAbbr` (which is what
 * the DB stores — note it says `PHO` for Phoenix where ESPN's own team endpoint says `PHX`).
 *
 * `tint` is the headshot overlay color for that team. The overlay is a `mix-blend-mode: color`
 * layer (theme.css `.duotone::after`): it takes ONLY hue and saturation from this color and
 * keeps the photo's own lightness, at `--duotone-alpha` opacity. Consequences worth knowing:
 *   - one hex works in both themes (lightness comes from the photo, not from here);
 *   - a grey/black tint has no hue, so the photo goes greyscale — the Aces' grey is deliberate;
 *   - the four navies and the reds land in shared families; they were picked by eye anyway.
 *
 * Sources: ESPN's team endpoint (`site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams`,
 * `color` / `alternateColor`, fetched 2026-09-18) except Portland, whose pink is from the team's
 * logo sheet (ESPN lists a pale teal and black). Chosen per team on a side-by-side preview of
 * every candidate under real headshots; record in DECISIONS.md. Colors are data, not tokens:
 * they belong to teams, not to the design system.
 */
export interface TeamInfo {
  name: string;
  /** `#rrggbb`, lowercase. */
  tint: string;
}

export const TEAMS: Record<string, TeamInfo> = {
  ATL: { name: "Atlanta Dream", tint: "#c65868" }, // ESPN primary
  CHI: { name: "Chicago Sky", tint: "#5091cd" }, // ESPN primary
  CON: { name: "Connecticut Sun", tint: "#e36c4b" }, // ESPN primary
  DAL: { name: "Dallas Wings", tint: "#bbc274" }, // ESPN alternate
  GS: { name: "Golden State Valkyries", tint: "#b279de" }, // ESPN primary
  IND: { name: "Indiana Fever", tint: "#d56668" }, // ESPN alternate
  LV: { name: "Las Vegas Aces", tint: "#a7a8aa" }, // ESPN primary — grey on purpose (greyscale)
  LA: { name: "Los Angeles Sparks", tint: "#deac41" }, // ESPN alternate
  MIN: { name: "Minnesota Lynx", tint: "#266092" }, // ESPN primary
  NY: { name: "New York Liberty", tint: "#86cebc" }, // ESPN primary
  PHO: { name: "Phoenix Mercury", tint: "#3c286e" }, // ESPN primary
  POR: { name: "Portland Fire", tint: "#d773af" }, // logo sheet (manual)
  SEA: { name: "Seattle Storm", tint: "#2c5235" }, // ESPN primary
  TOR: { name: "Toronto Tempo", tint: "#7b1b38" }, // ESPN alternate
  WSH: { name: "Washington Mystics", tint: "#002b5c" }, // ESPN alternate
};

/**
 * Headshot overlay color for a team, or null when we don't know the team — an off-roster
 * player (`teamAbbr` is null while they're e.g. on international duty) or an abbreviation
 * this table hasn't caught up with (a new franchise). Null means "use the neutral overlay"
 * (`--duotone-neutral`), which is what the CSS falls back to when no `--duotone-color` is set.
 */
export function teamTint(teamAbbr: string | null | undefined): string | null {
  if (!teamAbbr) return null;
  return TEAMS[teamAbbr]?.tint ?? null;
}

/** The same lookup by full team name ("Las Vegas Aces") — for the featured list, whose static
    entries carry the name (pulled from the DB) but no abbreviation. Resolving from the one string
    that is already hand-maintained beats adding a second field that could drift from it; an
    unmatched name (a rebrand the table hasn't caught up with) degrades to the neutral overlay. */
const BY_NAME = new Map(Object.values(TEAMS).map((t) => [t.name, t.tint]));
export function teamTintByName(teamName: string | null | undefined): string | null {
  if (!teamName) return null;
  return BY_NAME.get(teamName) ?? null;
}
