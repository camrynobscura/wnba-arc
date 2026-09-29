/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { apiBase, PLAYER_LIST_PATH } from "./src/data/apiUrls";
import { APP_FONTS, fontFile, fontPackage } from "./src/fonts";
import { headersFile, inlineScripts } from "./src/securityHeaders";

/**
 * Adds `<link rel="preload" as="fetch">` for the player list to index.html, so the browser starts that
 * download while it reads the page instead of after the app's code has run. A player link opened directly
 * needs the list before it can ask for that player, so the list is on the critical path (Lighthouse,
 * simulated phone, median of 5 runs: score 83 → 88, LCP 4.27 → 3.55 s). The app's fetch reuses the
 * preloaded response: the URL comes from the same rule as api.ts (apiUrls.ts, with VITE_API_BASE from
 * `config.env`), and `crossorigin` (anonymous) matches fetch's default credentials mode.
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
 * Adds `<link rel="preload" as="font">` for the faces every page's first screen draws (src/fonts.ts,
 * `preload`), so they download alongside the app's code: the app draws its text after the first paint, so
 * the browser can't find a font sooner on its own. Only the Latin files: the others download only for a
 * character in their range, and no player's name has one. The files are found in the bundle by their
 * source path (their names carry a hash); a face missing from the bundle fails the build. `crossorigin`
 * because fonts are always fetched in CORS mode, so a preload without it goes unused (MDN, rel=preload).
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
 * Writes Netlify's `_headers` (src/securityHeaders.ts) into dist from the finished index.html: the CSP lists
 * each inline script by its SHA-256 and the API by the same VITE_API_BASE the app calls, so editing either
 * can't leave a stale header behind.
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
 * Dev-only API proxy: with `VITE_API_BASE` unset, the app fetches the same-origin path `/api`, forwarded
 * here to the wnba-data server on localhost:3001 without the prefix. Same-origin, so dev needs no CORS
 * setup, and a phone on the same wifi works (`npm run dev -- --host`), where "localhost" would mean the
 * phone. Production calls the deployed API directly (VITE_API_BASE, set at build time); `preview` gets
 * the proxy too.
 */
const apiProxy = {
  "^/api/": {
    target: "http://localhost:3001",
    rewrite: (path: string) => path.replace(/^\/api/, ""),
  },
};

/**
 * Files the dev server must never serve. It serves the whole project folder, and private notes (.md files
 * kept out of git) could be fetched by anyone on the network under `--host`; no app code imports a .md
 * file. Setting `deny` replaces Vite's defaults, so they're repeated first, copied from Vite 8.2's docs
 * (node_modules/vite/dist/node/index.d.ts, `deny?`); re-check them when Vite upgrades.
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
  // Vitest stubs CSS imports to "", even `?raw`, unless the file is listed here. theme.test.ts and
  // fonts.test.ts read the stylesheets.
  test: { css: { include: [/src\/styles\/(theme|fonts)\.css/] } },
});
