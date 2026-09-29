import { expect, openPlayer, test } from "./support";

// The narrowest phone layout WCAG asks for (1.4.10): the page never scrolls sideways; wide content scrolls in its
// own box.
test.use({ viewport: { width: 320, height: 640 } });

const sideways = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("the landing page fits 320px", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await sideways(page)).toBe(0);
});

test("a player page fits 320px, the heatmap scrolling inside its own box", async ({ page }) => {
  await openPlayer(page, "aja-wilson/fgp");
  await expect(page.getByRole("table")).toBeVisible();
  expect(await sideways(page)).toBe(0);
  const grid = await page.locator(".hm-scroll").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(grid).toBeGreaterThan(0);
});
