/**
 * The site's security headers, as Netlify's `_headers` file. vite.config.ts builds it into dist from the finished
 * index.html, so the two things that would otherwise go stale on their own can't: the hashes of the page's inline
 * scripts (the theme script, the analytics loader) and the API's address (VITE_API_BASE). Security review F1,
 * 2026-09-28. Everything the page loads, and from where:
 *   scripts  — our bundle, the two inline scripts (by hash), Cloudflare's analytics beacon (live site only);
 *   styles   — our stylesheet (React's style props go through the CSSOM, which a CSP doesn't restrict);
 *   images   — ours, `data:` (the stat picker's ▾ in theme.css), ESPN's headshots;
 *   fonts    — ours (bundled Barlow);
 *   connects — ours, the API, Cloudflare's beacon reports.
 * The policy is ENFORCED. It shipped report-only first, and the live site (3 engines × 5 pages, the Cloudflare beacon
 * on) flagged nothing while a deliberate violation was flagged in all three (2026-09-28). A new outside host or
 * inline script must be added here, or the browser blocks it. X-Frame-Options: DENY says the same as frame-ancestors
 * for older browsers (the site is never embedded — the portfolio uses a screenshot, user 2026-09-28). HSTS comes
 * from Netlify.
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

/** Netlify `_headers`: every path gets the same headers. */
export function headersFile(inputs: HeaderInputs): string {
  return [
    "# Built by vite.config.ts from src/securityHeaders.ts — edit there, not here.",
    "/*",
    `  Content-Security-Policy: ${contentSecurityPolicy(inputs)}`,
    "  X-Frame-Options: DENY",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "",
  ].join("\n");
}
