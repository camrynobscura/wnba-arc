import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import { contentSecurityPolicy, headersFile, inlineScripts } from "./securityHeaders";

describe("inlineScripts", () => {
  it("finds index.html's two inline scripts — the theme script and the analytics loader — and not the bundle", () => {
    const scripts = inlineScripts(indexHtml);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain('localStorage.getItem("arc-theme")');
    expect(scripts[1]).toContain("static.cloudflareinsights.com/beacon.min.js");
  });

  it("returns each body exactly, whitespace included (the hash covers every character)", () => {
    expect(inlineScripts('<script>\n  a();\n</script><script type="module" src="/x.js"></script><SCRIPT>b()</SCRIPT>')).toEqual([
      "\n  a();\n",
      "b()",
    ]);
  });
});

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy({ apiOrigin: "https://api.example", scriptHashes: ["AAA=", "BBB="] });

  it("allows the inline scripts by hash, and the API and Cloudflare only where they're used", () => {
    expect(csp).toContain("script-src 'self' 'sha256-AAA=' 'sha256-BBB=' https://static.cloudflareinsights.com;");
    expect(csp).toContain("connect-src 'self' https://api.example https://cloudflareinsights.com;");
    expect(csp).toContain("img-src 'self' data: https://a.espncdn.com;");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("leaves the API out when it's this site's own origin (/api in dev)", () => {
    expect(contentSecurityPolicy({ apiOrigin: null, scriptHashes: [] })).toContain(
      "connect-src 'self' https://cloudflareinsights.com;",
    );
  });
});

describe("headersFile", () => {
  it("applies every header to every path, the policy as report-only", () => {
    const lines = headersFile({ apiOrigin: null, scriptHashes: [] }).split("\n");
    expect(lines[1]).toBe("/*");
    expect(lines.slice(2).filter(Boolean).every((l) => /^ {2}[A-Za-z-]+: \S/.test(l))).toBe(true);
    expect(lines[2]).toMatch(/^ {2}Content-Security-Policy-Report-Only: default-src 'self'; /);
    expect(lines).toContain("  X-Frame-Options: DENY");
  });
});
