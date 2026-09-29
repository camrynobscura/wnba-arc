/**
 * What every end-to-end test runs with. In each test's fresh browser context:
 *  - the API (/api/…) answers from e2e/fixtures (scripts/record-e2e-fixtures.mjs), and `api.fail` / `api.delay` set up
 *    the error and loading states;
 *  - ESPN's headshots answer with a stand-in image, and any other outside request is refused;
 *  - an uncaught error, a console error or a CSP violation fails the test, unless the test allows it (`errors.allow`).
 */
import { readFileSync } from "node:fs";
import { test as base, expect, type Locator, type Page } from "@playwright/test";

export { expect };

export interface Api {
  /** Answer `path` ("/players/3") with a 500, `times` times (every time by default), then normally. */
  fail(path: string, times?: number): void;
  /** Hold every answer to `path` for `ms` first. */
  delay(path: string, ms: number): void;
}

export interface Errors {
  /** Errors matching `pattern` don't fail the test (a load failure logs its error, by design). */
  allow(pattern: RegExp): void;
}

const fixture = (name: string): Buffer | null => {
  try {
    return readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url));
  } catch {
    return null;
  }
};

/** A 1×1 grey PNG: a headshot that loads, so no test waits on or races the initials fallback. */
const HEADSHOT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==",
  "base64",
);

export const test = base.extend<{ api: Api; errors: Errors }>({
  api: [
    async ({ context }, use) => {
      const failures = new Map<string, number>();
      const delays = new Map<string, number>();
      // Routes run newest first: the outside-request refusal is the fallback for the two below it.
      await context.route(
        (url) => url.hostname !== "localhost",
        (route) => route.abort(),
      );
      await context.route(
        (url) => url.hostname === "a.espncdn.com",
        (route) => route.fulfill({ contentType: "image/png", body: HEADSHOT }),
      );
      await context.route(
        (url) => url.hostname === "localhost" && url.pathname.startsWith("/api/"),
        async (route) => {
          const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
          const wait = delays.get(path);
          if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
          const left = failures.get(path) ?? 0;
          if (left > 0) {
            failures.set(path, left - 1);
            return route.fulfill({ status: 500, json: { error: "internal error" } });
          }
          const id = path.match(/^\/players\/(\d+)$/)?.[1];
          const body = fixture(id ? `player-${id}` : path.slice(1));
          return body
            ? route.fulfill({ contentType: "application/json", body })
            : route.fulfill({ status: 404, json: { error: "not found" } });
        },
      );
      await use({
        fail: (path, times = Infinity) => void failures.set(path, times),
        delay: (path, ms) => void delays.set(path, ms),
      });
    },
    { auto: true },
  ],

  errors: [
    async ({ page }, use) => {
      const seen: string[] = [];
      const pending: Promise<void>[] = [];
      const allowed: RegExp[] = [];
      page.on("pageerror", (e) => seen.push(`uncaught: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        // An Error logged whole reads as just "Error" in Firefox; its message says which.
        const arg = m.args()[0];
        const message = arg
          ? arg.evaluate((v) => (v instanceof Error ? `${v.name}: ${v.message}` : String(v))).catch(() => m.text())
          : Promise.resolve(m.text());
        pending.push(message.then((text) => void seen.push(`console: ${text}`)));
      });
      // Every engine logs a blocked resource differently, or not at all; this event is the same in all three.
      await page.addInitScript(() =>
        document.addEventListener("securitypolicyviolation", (e) =>
          console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
        ),
      );
      await use({ allow: (pattern) => void allowed.push(pattern) });
      await Promise.all(pending);
      expect(seen.filter((e) => !allowed.some((p) => p.test(e)))).toEqual([]);
    },
    { auto: true },
  ],
});

export const search = (page: Page): Locator => page.getByRole("combobox", { name: "Search players or teams" });
export const heading = (page: Page): Locator => page.getByRole("heading", { level: 1 });
export const cells = (page: Page): Locator => page.getByRole("gridcell");

/** A player's page, loaded as far as the heatmap. */
export async function openPlayer(page: Page, slug: string): Promise<void> {
  await page.goto(`/player/${slug}`);
  await expect(page.getByRole("grid")).toBeVisible();
}
