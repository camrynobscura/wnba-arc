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
    expect(
      inlineScripts('<script>\n  a();\n</script><script type="module" src="/x.js"></script><SCRIPT>b()</SCRIPT>'),
    ).toEqual(["\n  a();\n", "b()"]);
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
  // Netlify's format: a path on its own line, then its headers indented two spaces.
  const blocks = (file: string) => {
    const out = new Map<string, string[]>();
    let path = "";
    for (const l of file.split("\n").slice(1).filter(Boolean)) {
      if (l.startsWith("/")) out.set((path = l), []);
      else out.get(path)!.push(l);
    }
    return out;
  };
  const file = headersFile({ apiOrigin: null, scriptHashes: [] });

  it("applies the security headers to every path, the policy enforced", () => {
    const all = blocks(file).get("/*")!;
    expect(all.every((l) => /^ {2}[A-Za-z-]+: \S/.test(l))).toBe(true);
    expect(all[0]).toMatch(/^ {2}Content-Security-Policy: default-src 'self'; /);
    expect(all).toContain("  X-Frame-Options: DENY");
    expect(all).toContain("  X-Content-Type-Options: nosniff");
  });

  it("caches the hashed build files for a year without a re-check, and nothing else", () => {
    expect([...blocks(file).keys()]).toEqual(["/*", "/assets/*"]);
    expect(blocks(file).get("/assets/*")).toEqual(["  Cache-Control: public, max-age=31536000, immutable"]);
    expect(
      blocks(file)
        .get("/*")!
        .some((l) => l.includes("Cache-Control")),
    ).toBe(false);
  });
});
