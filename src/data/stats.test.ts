import { describe, it, expect } from "vitest";
import { STATS, photoUrls, statDescBody } from "./stats";

describe("statDescBody — the description under the drill-down heading", () => {
  it("drops the leading name and capitalizes what's left", () => {
    expect(statDescBody("Points — how many the player scores per game")).toBe("How many the player scores per game.");
    expect(statDescBody("Three-point % — how often the player's three-point attempts go in")).toBe(
      "How often the player's three-point attempts go in.",
    );
  });

  it("leaves a description with no lead-in alone (apart from the capital)", () => {
    expect(statDescBody("boards per game")).toBe("Boards per game.");
    expect(statDescBody("boards per game.")).toBe("Boards per game."); // never a doubled period
  });

  it("every description is a phrase: a capital first letter, no closing period (its consumers add it)", () => {
    for (const s of STATS) {
      expect(s.desc.charAt(0), s.key).toBe(s.desc.charAt(0).toUpperCase());
      expect(s.desc.endsWith("."), s.key).toBe(false);
    }
  });

  it("never repeats the stat's own name at the start for any stat (the heading already says it)", () => {
    for (const s of STATS) {
      const body = statDescBody(s.desc).toLowerCase();
      expect(body.startsWith(s.label.toLowerCase()), `${s.key}: "${body}"`).toBe(false);
    }
  });
});

describe("photoUrls", () => {
  it("asks ESPN's resizer for 3× the shown height, in the headshot's 600:436 shape, then the original", () => {
    expect(photoUrls("3149391", 40)).toEqual([
      "https://a.espncdn.com/combiner/i?img=/i/headshots/wnba/players/full/3149391.png&w=165&h=120&scale=crop",
      "https://a.espncdn.com/i/headshots/wnba/players/full/3149391.png",
    ]);
  });

  it("sizes the player header's 54px photo", () => {
    expect(photoUrls("3149391", 54)[0]).toContain("&w=223&h=162&");
  });
});
