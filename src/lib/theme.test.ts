import { describe, expect, it } from "vitest";
import css from "../styles/theme.css?raw";
import html from "../../index.html?raw";
import { THEME_COLOR } from "./theme";

// The browser bar's color is written in three places: theme.css (the page itself), THEME_COLOR (applyTheme)
// and index.html (the <meta> and its pre-paint script). A retuned --color-bg must move all three.
describe("theme-color matches the page background", () => {
  const bg = (block: RegExp) => css.match(block)?.[1];

  it("THEME_COLOR equals theme.css --color-bg in each theme", () => {
    expect(THEME_COLOR.light).toBe(bg(/:root\s*\{[^}]*?--color-bg:\s*(#[0-9a-f]{6})/i));
    expect(THEME_COLOR.dark).toBe(bg(/:root\[data-theme='dark'\]\s*\{[^}]*?--color-bg:\s*(#[0-9a-f]{6})/i));
  });

  it("index.html's meta and pre-paint script use the same two values", () => {
    expect(html).toContain(`<meta name="theme-color" content="${THEME_COLOR.light}" />`);
    expect(html).toContain(`t === "dark" ? "${THEME_COLOR.dark}" : "${THEME_COLOR.light}"`);
  });
});
