import { describe, expect, it } from "vitest";
import { asSentence, placeBubble } from "./InfoTip";

describe("asSentence — every tooltip ends with a period", () => {
  it("adds one to a phrase, never doubles one, and leaves other end marks", () => {
    expect(asSentence("Games played that season")).toBe("Games played that season.");
    expect(asSentence("Small sample: 9 of 44 games")).toBe("Small sample: 9 of 44 games.");
    expect(asSentence("of 136 players")).toBe("of 136 players."); // lowercase kept: it finishes "32nd"
    expect(asSentence("Already a sentence.")).toBe("Already a sentence.");
    expect(asSentence("Really?")).toBe("Really?");
  });
});

// A 200 × 43 bubble (the CSS max-width and a two-line tip) on a 390px phone.
const bubble = { width: 200, height: 43 };
const trigger = (left: number, top: number, width = 18, height = 16) => ({ left, top, width, height, bottom: top + height });

describe("placeBubble (the no-anchor-positioning fallback)", () => {
  it("sits 6px above the trigger, centered on it", () => {
    // trigger center x = 200 → bubble left = 100
    expect(placeBubble(trigger(191, 183), bubble, 390)).toEqual({ top: 183 - 43 - 6, left: 100 });
  });

  it("never comes within 8px of a screen edge — the first and last heatmap columns", () => {
    expect(placeBubble(trigger(57, 183), bubble, 390).left).toBe(8); // PTS: centered would be -34
    expect(placeBubble(trigger(340, 183), bubble, 390).left).toBe(390 - 200 - 8); // TS%: centered would be 249
  });

  it("drops below the trigger when there is no room above", () => {
    // 30px above the trigger < 43 + 6 + 8
    expect(placeBubble(trigger(57, 30), bubble, 390)).toEqual({ top: 30 + 16 + 6, left: 8 });
    // exactly enough room stays above
    expect(placeBubble(trigger(57, 43 + 6 + 8), bubble, 390).top).toBe(8);
  });
});
