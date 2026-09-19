import { describe, it, expect } from "vitest";
import { STATS, statDescBody } from "./stats";

describe("statDescBody — the description under the drill-down heading", () => {
  it("drops the leading name and capitalizes what's left", () => {
    expect(statDescBody("Points — how many the player scores per game.")).toBe("How many the player scores per game.");
    expect(statDescBody("Three-point % — how often the player's three-point attempts go in.")).toBe(
      "How often the player's three-point attempts go in.",
    );
  });

  it("leaves a description with no lead-in alone (apart from the capital)", () => {
    expect(statDescBody("boards per game.")).toBe("Boards per game.");
  });

  it("never repeats the stat's own name at the start for any stat (the heading already says it)", () => {
    for (const s of STATS) {
      const body = statDescBody(s.desc).toLowerCase();
      expect(body.startsWith(s.label.toLowerCase()), `${s.key}: "${body}"`).toBe(false);
    }
  });
});
