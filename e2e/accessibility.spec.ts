import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { cells, expect, heading, openPlayer, search, test } from "./support";

/**
 * axe on every state the app can be in, in both themes: all of axe's rules, best practices included (a scan
 * limited to the WCAG tags skips the landmark and region rules). axe finds only what a machine can see; the
 * keyboard and focus behavior is tested in player.spec.ts and navigation.spec.ts.
 */
const STATES: [name: string, reach: (page: Page) => Promise<void>][] = [
  ["the landing page", (page) => page.goto("/").then(() => expect(heading(page)).toBeVisible())],
  [
    "the landing page's search results",
    async (page) => {
      await page.goto("/");
      await search(page).fill("wil");
      await expect(page.getByRole("option").first()).toBeVisible();
    },
  ],
  ["a player page", (page) => openPlayer(page, "aja-wilson")],
  [
    "a heatmap popover",
    async (page) => {
      await openPlayer(page, "aja-wilson");
      await cells(page).first().focus();
      await expect(page.locator("#hm-popover")).toBeVisible();
    },
  ],
  ["another stat's history, against the position", (page) => openPlayer(page, "aja-wilson/reb?vs=position")],
  [
    "a disabled comparison's reason",
    async (page) => {
      await openPlayer(page, "aaliyah-wilson");
      await page.getByRole("button", { name: "Self", exact: true }).focus();
      await expect(page.getByRole("tooltip")).toBeVisible();
    },
  ],
  ["the About page", (page) => page.goto("/about").then(() => expect(heading(page)).toHaveText("About Arc"))],
  [
    "a player that doesn't exist",
    (page) => page.goto("/player/nobody-at-all").then(() => expect(heading(page)).toHaveText("Player not found")),
  ],
];

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });
    for (const [name, reach] of STATES) {
      test(`${name}: no axe violations`, async ({ page }) => {
        await reach(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });
    }
  });
}
