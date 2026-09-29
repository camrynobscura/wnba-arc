/**
 * The site's security headers, as Netlify's `_headers` file. vite.config.ts builds it into dist from the finished
 * index.html, so the two things that would otherwise go stale can't: the hashes of the page's inline scripts (the
 * theme script, the analytics loader) and the API's address (VITE_API_BASE). Everything the page loads, and from
 * where:
 *   scripts  — our bundle, the two inline scripts (by hash), Cloudflare's analytics beacon (live site only);
 *   styles   — our stylesheet (React's style props go through the CSSOM, which a CSP doesn't restrict);
 *   images   — ours, `data:` (the stat picker's ▾ in theme.css), ESPN's headshots;
 *   fonts    — ours (bundled Barlow);
 *   connects — ours, the API, Cloudflare's beacon reports.
 * The policy is enforced: a new outside host or inline script must be added here, or the browser blocks it.
 * X-Frame-Options: DENY says what frame-ancestors does, for older browsers. HSTS comes from Netlify.
 *
 * The same file carries one caching rule (`ASSET_CACHE`): Netlify's default makes a browser re-check every file with
 * the server on every visit, and Safari on every refresh, fonts included, so the page drew its text in the stand-in
 * font until the answer came.
 */

/** The bodies of the inline (no `src`) `<script>` elements, exactly as a browser hashes them for a CSP. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
}

export interface HeaderInputs {
  /** The API's origin when it isn't this site's own (production: https://wnba-data-api.onrender.com). */
  apiOrigin: string | null;
  /** base64 SHA-256 of each inline script, as `inlineScripts` returns them. */
  scriptHashes: string[];
}

export const CLOUDFLARE_BEACON = "https://static.cloudflareinsights.com";
export const CLOUDFLARE_REPORTS = "https://cloudflareinsights.com";
export const ESPN_IMAGES = "https://a.espncdn.com";

export function contentSecurityPolicy({ apiOrigin, scriptHashes }: HeaderInputs): string {
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", ...scriptHashes.map((h) => `'sha256-${h}'`), CLOUDFLARE_BEACON],
    ["style-src", "'self'"],
    ["img-src", "'self'", "data:", ESPN_IMAGES],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...(apiOrigin ? [apiOrigin] : []), CLOUDFLARE_REPORTS],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  return directives.map((d) => d.join(" ")).join("; ");
}

/**
 * The built files under /assets/ keep for a year, without a re-check. Safe because Vite names each one by a hash of
 * its contents: a changed file gets a new name, and index.html (which keeps Netlify's re-check-every-time default)
 * always points at the current ones. `immutable` is what stops Safari re-checking on a refresh (WebKit honors it for
 * https responses; Chrome no longer re-checks subresources on a refresh at all).
 */
export const ASSET_CACHE = { path: "/assets/*", value: "public, max-age=31536000, immutable" };

/** Netlify `_headers`: the security headers on every path; the long cache on the hashed build files as well. */
export function headersFile(inputs: HeaderInputs): string {
  return [
    "# Built by vite.config.ts from src/securityHeaders.ts — edit there, not here.",
    "/*",
    `  Content-Security-Policy: ${contentSecurityPolicy(inputs)}`,
    "  X-Frame-Options: DENY",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ASSET_CACHE.path,
    `  Cache-Control: ${ASSET_CACHE.value}`,
    "",
  ].join("\n");
}
