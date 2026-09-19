import { describe, it, expect } from "vitest";
import { TEAMS, teamTint, teamTintByName } from "./teams";
import { FEATURED } from "./featured";

describe("teamTint — the per-team headshot overlay color", () => {
  it("returns the team's tint for a known abbreviation (whatever the table holds — the values are tuned by eye)", () => {
    expect(teamTint("GS")).toBe(TEAMS.GS.tint);
    expect(teamTint("LV")).toBe(TEAMS.LV.tint);
  });

  it("returns null (→ the neutral overlay) for an off-roster player or an unknown team", () => {
    expect(teamTint(null)).toBeNull();
    expect(teamTint(undefined)).toBeNull();
    expect(teamTint("")).toBeNull();
    expect(teamTint("PHX")).toBeNull(); // ESPN's abbreviation, not ours (we store PHO)
  });

  it("looks up by full team name too, and degrades to null for a name it doesn't know", () => {
    expect(teamTintByName("Las Vegas Aces")).toBe(TEAMS.LV.tint);
    expect(teamTintByName("Phoenix Mercury")).toBe(TEAMS.PHO.tint);
    expect(teamTintByName("Detroit Shock")).toBeNull(); // not a current team
    expect(teamTintByName(null)).toBeNull();
  });

  it("every featured player's static team name resolves — the landing list tints from that string", () => {
    // featured.ts is hand-maintained; a rebrand or a typo there would silently drop a tint.
    for (const f of FEATURED) expect(teamTintByName(f.team), `: ""`).not.toBeNull();
  });

  it("every tint is a lowercase #rrggbb (the CSS custom property takes it verbatim)", () => {
    for (const [abbr, t] of Object.entries(TEAMS)) {
      expect(t.tint, abbr).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("covers the whole current league", () => {
    // The 15 abbreviations our API sends today (verified against /players, 2026-09-18).
    expect(Object.keys(TEAMS).sort()).toEqual(
      ["ATL", "CHI", "CON", "DAL", "GS", "IND", "LA", "LV", "MIN", "NY", "PHO", "POR", "SEA", "TOR", "WSH"],
    );
  });
});
