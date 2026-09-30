import type { Page } from "@playwright/test";
import { cells, expect, heading, openPlayer, test } from "./support";

const popover = (page: Page) => page.locator("#hm-popover");
const segment = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test.describe("the heatmap", () => {
  test("is one Tab stop: the arrow keys move between cells, the popover follows, Escape closes it", async ({
    page,
  }) => {
    await openPlayer(page, "aja-wilson");
    await expect(page.getByRole("grid").getByRole("rowheader")).toHaveCount(9); // 2018–2026, newest first
    await expect(page.locator('[role=gridcell][tabindex="0"]')).toHaveCount(1);

    await cells(page).first().focus();
    await expect(popover(page)).toBeVisible();
    await expect(popover(page)).toContainText("Points");
    await expect(popover(page)).toContainText("2026");

    await page.keyboard.press("ArrowRight");
    await expect(cells(page).nth(1)).toBeFocused();
    await expect(popover(page)).toContainText("Rebounds");

    await page.keyboard.press("ArrowDown");
    await expect(cells(page).nth(9)).toBeFocused(); // one row down: 8 stats a row
    await expect(popover(page)).toContainText("2025");
    await expect(page.locator('[role=gridcell][tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(popover(page)).toBeHidden();
    await expect(cells(page).nth(9)).toBeFocused();
  });

  test("Enter opens the cell's stat history, focus on its heading", async ({ page }) => {
    await openPlayer(page, "aja-wilson");
    await cells(page).nth(1).focus(); // Rebounds
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/player/aja-wilson/reb");
    await expect(page.locator("#drilldown-title")).toBeFocused();
    await expect(page.getByRole("combobox", { name: /stat/i })).toHaveValue("reb");
  });

  test("a click pins the popover; its link opens the stat's history", async ({ page }) => {
    await openPlayer(page, "aja-wilson");
    await cells(page).nth(2).click(); // Assists, 2026
    await expect(popover(page)).toHaveAttribute("data-pinned", "true");
    await popover(page).getByRole("button", { name: "See assists history" }).click();
    await expect(page).toHaveURL("/player/aja-wilson/ast");
  });
});

test.describe("the best-rank plate", () => {
  const plate = (page: Page) => page.locator(".cs-plate", { hasText: "Best rank" });

  test("shows the lowest rank with its year, and a count whose tooltip names the other seasons at that rank", async ({
    page,
  }) => {
    await openPlayer(page, "aja-wilson/blk?vs=league"); // 1st in blocks six times: 2020 and 2022–2026
    await expect(plate(page)).toContainText("1st");
    await expect(plate(page)).toContainText("of 157");
    await expect(plate(page)).toContainText("WNBA 2026");
    const more = plate(page).getByRole("button", { name: "+5" });
    const tip = page.getByRole("tooltip", { name: "Also 1st in 2020, 2022, 2023, 2024, and 2025." });

    await more.focus(); // the keyboard
    await expect(tip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();
    await expect(more).toBeFocused();

    await page.mouse.move(0, 0);
    await more.hover(); // a mouse
    await expect(tip).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();

    await more.click(); // a tap
    await expect(tip).toBeVisible();

    // The same six seasons among centers: the same headline year, though 2025's pool (20) was larger than 2026's (19).
    await openPlayer(page, "aja-wilson/blk?vs=position");
    await expect(plate(page)).toContainText("of 19");
    await expect(plate(page)).toContainText("Centers 2026");
    await plate(page).getByRole("button", { name: "+5" }).focus();
    await expect(page.getByRole("tooltip", { name: "Also 1st in 2020, 2022, 2023, 2024, and 2025." })).toBeVisible();

    await openPlayer(page, "aja-wilson/ast"); // a best rank reached once: no count
    await expect(plate(page)).toBeVisible();
    await expect(plate(page).getByRole("button")).toHaveCount(0);
  });
});

test.describe("the comparison bar", () => {
  test("switches the reference for the whole page, and the address keeps it", async ({ page }) => {
    await openPlayer(page, "aja-wilson");
    const grid = page.getByRole("grid");
    await expect(segment(page, "Self")).toHaveAttribute("aria-pressed", "true");
    await expect(grid).toHaveAttribute("aria-label", "A'ja's seasons vs. their career average");

    await segment(page, "League").click();
    await expect(page).toHaveURL("/player/aja-wilson?vs=league");
    await expect(segment(page, "League")).toHaveAttribute("aria-pressed", "true");
    await expect(grid).toHaveAttribute("aria-label", "A'ja's seasons vs. the league average");

    await segment(page, "Centers").click();
    await expect(page).toHaveURL("/player/aja-wilson?vs=position");
    await expect(grid).toHaveAttribute("aria-label", "A'ja's seasons vs. the center average");

    await page.reload();
    await expect(segment(page, "Centers")).toHaveAttribute("aria-pressed", "true");
  });

  test("shows a mode a player can't have as disabled, with the reason, and never selects it", async ({ page }) => {
    await openPlayer(page, "aaliyah-wilson"); // one season: nothing to compare with
    const self = segment(page, "Self");
    await expect(self).toHaveAttribute("aria-disabled", "true");
    await expect(segment(page, "League")).toHaveAttribute("aria-pressed", "true");
    await self.focus();
    await expect(page.getByRole("tooltip", { name: "Needs two or more seasons." })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip", { name: "Needs two or more seasons." })).toBeHidden();
    // aria-disabled, not disabled: it stays clickable, so a click must do nothing but explain.
    await self.click({ force: true });
    await expect(page.getByRole("tooltip", { name: "Needs two or more seasons." })).toBeVisible();
    await expect(segment(page, "League")).toHaveAttribute("aria-pressed", "true");

    await openPlayer(page, "cynthia-cooper"); // 1997–2003: no position on record
    await expect(segment(page, "Position")).toHaveAttribute("aria-disabled", "true");
    await segment(page, "Position").focus();
    await expect(page.getByRole("tooltip", { name: "No position on record." })).toBeVisible();
  });

  test("sticks while the page scrolls, and never covers what has focus", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPlayer(page, "aja-wilson");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bar = page.locator(".compare-bar");
    await expect.poll(async () => (await bar.boundingBox())?.y).toBe(0);

    await cells(page).first().focus(); // the top row, scrolled back into view
    const barBottom = (await bar.boundingBox())!.height;
    await expect.poll(async () => (await cells(page).first().boundingBox())!.y).toBeGreaterThanOrEqual(barBottom);

    await page.keyboard.press("Enter"); // down to the history
    await expect(page.locator("#drilldown-title")).toBeFocused();
    await expect
      .poll(async () => (await page.locator("#drilldown").boundingBox())!.y)
      .toBeGreaterThanOrEqual(barBottom);
    await expect(heading(page)).toHaveText("A'ja Wilson");
  });
});
