import { describe, expect, it } from "vitest";
import fontsCss from "./styles/fonts.css?raw";
import themeCss from "./styles/theme.css?raw";
import { APP_FONTS, fontFile, fontPackage, loadLaterFonts } from "./fonts";

// Every @font-face rule in fonts.css, as its descriptors.
const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
  family: /font-family:\s*"([^"]+)"/.exec(body!)?.[1],
  weight: Number(/font-weight:\s*(\d+)/.exec(body!)?.[1]),
  display: /font-display:\s*(\w+)/.exec(body!)?.[1],
  src: body!,
}));

describe("fonts.css", () => {
  it("declares exactly the faces in APP_FONTS, each in the three character sets Fontsource ships", () => {
    const declared = new Set(faces.map((f) => `${f.family} ${f.weight}`));
    expect([...declared].sort()).toEqual(APP_FONTS.map((f) => `${f.family} ${f.weight}`).sort());
    expect(faces).toHaveLength(APP_FONTS.length * 3);
  });

  it("uses font-display: block everywhere — a line waits for Barlow instead of drawing the stand-in first", () => {
    expect(faces.every((f) => f.display === "block")).toBe(true);
  });

  it("points each face at its own package's files", () => {
    for (const font of APP_FONTS) {
      const own = faces.filter((f) => f.family === font.family && f.weight === font.weight);
      for (const subset of ["latin", "latin-ext", "vietnamese"] as const) {
        const file = `@fontsource/${fontPackage(font)}/files/${fontFile(font, subset, "woff2")}`;
        expect(own.some((f) => f.src.includes(`url("${file}") format("woff2")`))).toBe(true);
      }
    }
  });
});

describe("APP_FONTS", () => {
  it("preloads the three faces every page's first screen draws", () => {
    expect(APP_FONTS.filter((f) => f.preload).map((f) => `${f.family} ${f.weight}`)).toEqual([
      "Barlow 400",
      "Barlow 500",
      "Barlow Condensed 600",
    ]);
  });

  it("names the files the way @fontsource does", () => {
    expect(fontFile(APP_FONTS[5], "latin", "woff2")).toBe("barlow-condensed-latin-600-normal.woff2");
  });
});

describe("loadLaterFonts", () => {
  it("asks for every face that isn't preloaded, and only those", () => {
    const asked: string[] = [];
    loadLaterFonts({ load: (font) => (asked.push(font), Promise.resolve([])) });
    expect(asked).toEqual(['600 1em "Barlow"', '700 1em "Barlow"', '500 1em "Barlow Condensed"']);
  });

  it("swallows a failed load (the text falls back on its own)", async () => {
    let rejected = false;
    loadLaterFonts({ load: () => Promise.reject(new Error("offline")).finally(() => (rejected = true)) });
    await new Promise((r) => setTimeout(r, 0));
    expect(rejected).toBe(true); // reached, and no unhandled rejection failed the run
  });
});

describe("the headings' stand-in", () => {
  // Every CSS rule that sets the heading face, and every inline style that does.
  const cssRules = [...themeCss.matchAll(/[^{}]*\{([^}]*font-family:\s*var\(--font-heading\)[^}]*)\}/g)].map((m) => m[1]!);
  const tsx = import.meta.glob<string>("./**/*.tsx", { query: "?raw", import: "default", eager: true });
  const inline = Object.entries(tsx).flatMap(([path, src]) =>
    [...src.matchAll(/\{[^{}]*fontFamily:\s*"var\(--font-heading\)"[^{}]*\}/g)].map((m) => ({ path, style: m[0] })),
  );

  it("is condensed wherever the heading face is set, so it's the system font's narrow width", () => {
    expect(cssRules).toHaveLength(6);
    expect(cssRules.every((r) => /font-stretch:\s*condensed/.test(r))).toBe(true);
    expect(inline.map((i) => i.path)).toEqual(["./components/TitleSelect.tsx"]);
    expect(inline.every((i) => /fontStretch:\s*"condensed"/.test(i.style))).toBe(true);
  });
});
