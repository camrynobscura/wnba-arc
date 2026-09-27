import { describe, expect, it } from "vitest";
import { HEADER_ROW, gridMove } from "./gridNav";

// A 9-season × 8-stat grid, as on A'ja Wilson's page.
const R = 9;
const C = 8;

describe("gridMove", () => {
  it("moves one cell with the arrow keys", () => {
    expect(gridMove({ r: 3, c: 3 }, "ArrowRight", R, C)).toEqual({ r: 3, c: 4 });
    expect(gridMove({ r: 3, c: 3 }, "ArrowLeft", R, C)).toEqual({ r: 3, c: 2 });
    expect(gridMove({ r: 3, c: 3 }, "ArrowDown", R, C)).toEqual({ r: 4, c: 3 });
    expect(gridMove({ r: 3, c: 3 }, "ArrowUp", R, C)).toEqual({ r: 2, c: 3 });
  });

  it("goes up from the top season into the column-header row, and back down", () => {
    expect(gridMove({ r: 0, c: 5 }, "ArrowUp", R, C)).toEqual({ r: HEADER_ROW, c: 5 });
    expect(gridMove({ r: HEADER_ROW, c: 5 }, "ArrowDown", R, C)).toEqual({ r: 0, c: 5 });
  });

  it("moves along the header row", () => {
    expect(gridMove({ r: HEADER_ROW, c: 0 }, "ArrowRight", R, C)).toEqual({ r: HEADER_ROW, c: 1 });
    expect(gridMove({ r: HEADER_ROW, c: 4 }, "Home", R, C)).toEqual({ r: HEADER_ROW, c: 0 });
    expect(gridMove({ r: HEADER_ROW, c: 4 }, "End", R, C)).toEqual({ r: HEADER_ROW, c: C - 1 });
  });

  it("stops at every edge instead of wrapping", () => {
    expect(gridMove({ r: HEADER_ROW, c: 2 }, "ArrowUp", R, C)).toEqual({ r: HEADER_ROW, c: 2 });
    expect(gridMove({ r: R - 1, c: 2 }, "ArrowDown", R, C)).toEqual({ r: R - 1, c: 2 });
    expect(gridMove({ r: 4, c: 0 }, "ArrowLeft", R, C)).toEqual({ r: 4, c: 0 });
    expect(gridMove({ r: 4, c: C - 1 }, "ArrowRight", R, C)).toEqual({ r: 4, c: C - 1 });
  });

  it("Home / End stay in the current row", () => {
    expect(gridMove({ r: 6, c: 3 }, "Home", R, C)).toEqual({ r: 6, c: 0 });
    expect(gridMove({ r: 6, c: 3 }, "End", R, C)).toEqual({ r: 6, c: C - 1 });
  });

  it("ignores keys that aren't grid movement", () => {
    for (const k of ["Enter", " ", "Escape", "Tab", "a"]) expect(gridMove({ r: 2, c: 2 }, k, R, C)).toBeNull();
  });
});
