/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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

export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  // Vitest stubs CSS imports to "" — even `?raw` — unless the file is listed here. theme.test.ts reads
  // theme.css's --color-bg values to check the browser bar's theme-color against them.
  test: { css: { include: [/src\/styles\/theme\.css/] } },
});
