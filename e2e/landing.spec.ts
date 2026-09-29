import { THEME_COLOR } from "../src/lib/theme";
import { expect, heading, search, test } from "./support";

test("the landing page finds a player and opens their page, focus on the name", async ({ page }) => {
  await page.goto("/");
  await expect(heading(page)).toHaveText("WNBA Arc");
  await search(page).fill("wil");
  await expect(page.getByRole("option")).toHaveText([/A'ja Wilson/, /Aaliyah Wilson/]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/player/aja-wilson");
  await expect(heading(page)).toHaveText("A'ja Wilson");
  await expect(heading(page)).toBeFocused();
});

test("the theme switch changes the page and the browser bar's color, and is remembered", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", THEME_COLOR.dark);
  await page.reload(); // index.html's script sets both before the app loads
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", THEME_COLOR.dark);
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
});

// The CSP is what makes the suite's CSP-violation check (support.ts) mean anything.
test("pages are served with the production security headers", async ({ page }) => {
  const res = await page.goto("/player/aja-wilson");
  expect(res?.headers()["content-security-policy"]).toMatch(/^default-src 'self'; script-src 'self' 'sha256-/);
  expect(res?.headers()["x-frame-options"]).toBe("DENY");
});
