import { cells, expect, heading, openPlayer, search, test } from "./support";

test("Back from a long career to a short one, with a cell open in a row the short one lacks", async ({ page }) => {
  await openPlayer(page, "paige-bueckers");
  await search(page).fill("a'ja");
  await page.getByRole("option", { name: /A'ja Wilson/ }).click();
  await expect(heading(page)).toHaveText("A'ja Wilson");
  await cells(page)
    .nth(8 * 8)
    .focus(); // the ninth row, 2018
  await expect(page.locator("#hm-popover")).toContainText("2018");

  await page.goBack();
  await expect(heading(page)).toHaveText("Paige Bueckers");
  await expect(page.getByRole("grid").getByRole("rowheader")).toHaveCount(2);
});

test("coming back to a player whose load failed loads them again, without the old error", async ({
  page,
  api,
  errors,
}) => {
  errors.allow(/500/); // the failed request, and the app's own log of it
  api.fail("/players/3", 1);
  await page.goto("/player/aja-wilson");
  await expect(heading(page)).toHaveText("Couldn't load this player");
  await expect(page.getByRole("alert")).toContainText("Try refreshing the page in a minute.");

  await search(page).fill("paige");
  await page.getByRole("option", { name: /Paige Bueckers/ }).click();
  await expect(heading(page)).toHaveText("Paige Bueckers");

  api.delay("/players/3", 1000);
  await page.goBack();
  await expect(heading(page)).toHaveText("Loading…");
  await expect(heading(page)).toHaveText("A'ja Wilson");
  await expect(heading(page)).toBeFocused();
});

test("an address that matches no player says so", async ({ page }) => {
  await page.goto("/player/nobody-at-all");
  await expect(heading(page)).toHaveText("Player not found");
  await expect(page.getByRole("alert")).toContainText("No player matches this link.");
  await expect(page).toHaveTitle("Player not found — WNBA Arc");
});

test("two players with the same name each get an address with their ESPN id", async ({ page }) => {
  await page.goto("/");
  await search(page).fill("michelle campbell");
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("option", { name: /2013/ }).click();
  await expect(page).toHaveURL("/player/michelle-campbell-2069162");

  await openPlayer(page, "michelle-campbell-120");
  await expect(page.getByText("1999–2000")).toBeVisible();
});

test("a typed address two players share offers both instead of guessing", async ({ page }) => {
  await page.goto("/player/michelle-campbell");
  await expect(heading(page)).toHaveText("Two players are named Michelle Campbell");
  await expect(page).toHaveTitle("Two players are named Michelle Campbell — WNBA Arc");
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(2);
  await page.getByRole("link", { name: /1999–2000/ }).click();
  await expect(page).toHaveURL("/player/michelle-campbell-120");
  await expect(heading(page)).toHaveText("Michelle Campbell");
});

test("a player's former name still finds them: the old address moves on, and search says which name", async ({
  page,
}) => {
  await page.goto("/player/nia-coffey/reb?vs=league");
  await expect(page).toHaveURL("/player/nia-brodie/reb?vs=league");
  await expect(heading(page)).toHaveText("Nia Brodie");

  await page.goto("/");
  await search(page).fill("coffey");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Nia Brodie");
  await expect(page.getByRole("option")).toContainText("formerly Nia Coffey");
});

test("when the player list fails, the landing page and a player page say what to do", async ({ page, api, errors }) => {
  errors.allow(/500/);
  api.fail("/players");
  await page.goto("/");
  await expect(page.getByRole("alert")).toHaveText(
    "Couldn't load the player list. Try refreshing the page in a minute.",
  );
  await expect(page.getByRole("link", { name: /A'ja Wilson/ })).toBeVisible(); // the featured list needs no API

  await page.goto("/player/aja-wilson");
  await expect(heading(page)).toHaveText("Couldn't load this player");
});
