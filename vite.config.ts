/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { apiBase, PLAYER_LIST_PATH } from "./src/data/apiUrls";
import { APP_FONTS, fontFile, fontPackage } from "./src/fonts";
import { headersFile, inlineScripts } from "./src/securityHeaders";

/**
 * Puts `<link rel="preload" as="fetch" …>` for the player list into index.html, so the browser starts that
 * download while it reads the page instead of after the app's code has downloaded and run. On a player link
 * opened directly the page needs the list before it can ask for that player's stats, so the list is on the
 * critical path (measured 2026-09-28, player page opened directly, Lighthouse's simulated phone, 5-run medians:
 * score 83 → 88, LCP 4.27 → 3.55 s). A visit that starts on the home page already has the list by the first click.
 * The app's own fetch then takes the preloaded response: the URL comes from the same rule and path as
 * api.ts (apiUrls.ts), and `crossorigin` (anonymous) matches fetch's default credentials mode. The URL is
 * `import.meta.env.VITE_API_BASE`'s value — `config.env` — so dev (`/api`, proxied) and Netlify agree too.
 */
function preloadPlayerList(): Plugin {
  let href = "";
  return {
    name: "preload-player-list",
    configResolved(config) {
      href = apiBase(config.env.VITE_API_BASE) + PLAYER_LIST_PATH;
    },
    transformIndexHtml() {
      return [{ tag: "link", attrs: { rel: "preload", as: "fetch", href, crossorigin: true }, injectTo: "head" }];
    },
  };
}

/**
 * Puts `<link rel="preload" as="font" …>` into index.html for the faces every page's first screen draws (src/fonts.ts,
 * `preload`), so they download alongside the app's code instead of after it has drawn its text — the app draws
 * after the first paint, so the browser can't find a font any sooner on its own. Only the Latin file: the
 * others (Latin Extended, Vietnamese) download only for a character in their range, and no player's name has one
 * (0 of 1,218, 2026-09-28). The files are found in the bundle by the path they came from, since their names carry
 * a hash; a face that isn't in the bundle fails the build rather than ship a preload for nothing. `crossorigin`
 * because fonts are always fetched in CORS mode, so a preload without it isn't used (MDN, rel=preload).
 */
function preloadFonts(): Plugin {
  let base = "/";
  return {
    name: "preload-fonts",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const assets = Object.values(ctx.bundle ?? {}).filter((a) => a.type === "asset");
        return APP_FONTS.filter((f) => f.preload).map((font) => {
          const source = `/@fontsource/${fontPackage(font)}/files/${fontFile(font, "latin", "woff2")}`;
          const asset = assets.find((a) => a.originalFileNames.some((p) => p.endsWith(source)));
          if (!asset) throw new Error(`preload-fonts: ${source} is not in the build`);
          return {
            tag: "link",
            attrs: { rel: "preload", href: base + asset.fileName, as: "font", type: "font/woff2", crossorigin: true },
            injectTo: "head" as const,
          };
        });
      },
    },
  };
}

/**
 * Writes Netlify's `_headers` (the security headers, src/securityHeaders.ts) into dist, computed from the finished
 * index.html: the CSP lists each inline script by its SHA-256 and the API by the same VITE_API_BASE the app calls,
 * so editing either can't leave a stale header behind. Runs after Vite has written index.html into the bundle
 * (`enforce: "post"`).
 */
function securityHeaders(): Plugin {
  let apiOrigin: string | null = null;
  return {
    name: "security-headers",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      const base = apiBase(config.env.VITE_API_BASE);
      apiOrigin = base.startsWith("/") ? null : new URL(base).origin; // "/api" = this site's own origin
    },
    generateBundle(_options, bundle) {
      const page = bundle["index.html"];
      if (!page || page.type !== "asset") this.error("security-headers: index.html is not in the bundle");
      const html = typeof page.source === "string" ? page.source : new TextDecoder().decode(page.source);
      const scriptHashes = inlineScripts(html).map((s) => createHash("sha256").update(s, "utf8").digest("base64"));
      this.emitFile({ type: "asset", fileName: "_headers", source: headersFile({ apiOrigin, scriptHashes }) });
    },
  };
}

/**
 * Dev-only API proxy. With `VITE_API_BASE` unset the app fetches the API at the same-origin
 * path `/api` (src/data/api.ts); this forwards those requests to the wnba-data server on
 * localhost:3001 (its default port), stripping the prefix because its routes are unprefixed
 * (/players, /league, /positions, /meta).
 *
 * Why a proxy instead of an absolute `http://localhost:3001` in the client: the browser then
 * never makes a cross-origin request in dev, so (a) CORS is out of the picture entirely — no
 * allow-list to keep in step with whichever port Vite lands on — and (b) the app works from
 * any device that can reach the dev server, e.g. a phone on the same wifi
 * (`npm run dev -- --host`), where "localhost" would have meant the phone itself.
 *
 * Production is untouched: `VITE_API_BASE` is baked in at build time (Netlify env) and the
 * client calls the deployed API directly. `preview` gets the same proxy so a local
 * `npm run build && npm run preview` without a .env still has data.
 */
const apiProxy = {
  "^/api/": {
    target: "http://localhost:3001",
    rewrite: (path: string) => path.replace(/^\/api/, ""),
  },
};

/**
 * Files the dev server must never hand out. It serves the whole project folder, and the project's
 * working docs (DECISIONS.md, CLAUDE.md, TRIAGE.md …) are private: they're kept out of git, yet with
 * `--host` anyone on the same network could fetch them (measured 2026-09-28). No app code imports a
 * .md file. Setting `deny` REPLACES Vite's defaults, so they're repeated first — copied from Vite
 * 8.2's docs (node_modules/vite/dist/node/index.d.ts, `deny?`); re-check them when Vite upgrades.
 */
const DEV_SERVER_DENY = [
  ".env",
  ".env.*",
  "*.{crt,pem,key,p12,pfx,cer,der}",
  ".npmrc",
  ".yarnrc.yml",
  "**/.git/**",
  "**/*.md",
];

export default defineConfig({
  plugins: [react(), preloadPlayerList(), preloadFonts(), securityHeaders()],
  server: { proxy: apiProxy, fs: { deny: DEV_SERVER_DENY } },
  preview: { proxy: apiProxy },
  // Vitest stubs CSS imports to "" — even `?raw` — unless the file is listed here. theme.test.ts reads
  // theme.css's --color-bg values to check the browser bar's theme-color against them; fonts.test.ts reads both
  // stylesheets (the faces in fonts.css, the heading rules' stand-in in theme.css).
  test: { css: { include: [/src\/styles\/(theme|fonts)\.css/] } },
});
