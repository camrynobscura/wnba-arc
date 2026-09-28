import { describe, expect, it } from "vitest";
import { apiBase, PLAYER_LIST_PATH } from "./apiUrls";

describe("apiBase", () => {
  it("uses VITE_API_BASE when it's set (Netlify builds)", () => {
    expect(apiBase("https://wnba-data-api.onrender.com")).toBe("https://wnba-data-api.onrender.com");
  });

  it("falls back to the proxied same-origin /api when unset or empty (local dev)", () => {
    expect(apiBase(undefined)).toBe("/api");
    expect(apiBase("")).toBe("/api");
  });
});

describe("PLAYER_LIST_PATH", () => {
  it("asks for every player on record, not the API's default 3-season window", () => {
    expect(PLAYER_LIST_PATH).toBe("/players?scope=all");
  });
});
