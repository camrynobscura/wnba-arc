/**
 * Builds the two images a page's <head> points to, from the SVGs below:
 *   public/og.png               1200×630, the link-preview card (index.html's og:image)
 *   public/apple-touch-icon.png 180×180, the iPhone home-screen icon
 * Run after changing either: `npm run assets`. The PNGs are committed; the build doesn't run this.
 *
 * Fonts: the app bundles Barlow as .woff2 from @fontsource, but resvg's Node build reads only font FILES,
 * and only TrueType/OpenType — not .woff/.woff2 (tested 2026-09-28: nothing drew). So the two faces the
 * card uses are committed as .ttf (assets/brand/fonts, SIL OFL, from github.com/google/fonts). An unknown
 * font-family draws nothing either, with no error, so check the card after changing a name.
 */
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontFiles = ["BarlowCondensed-SemiBold.ttf", "Barlow-Medium.ttf"].map((f) => path.join(root, "assets/brand/fonts", f));
for (const f of fontFiles) if (!fs.existsSync(f)) throw new Error(`missing font: ${f}`);

// The app's light-theme tokens (src/styles/theme.css :root).
const BG = "#f2f2f3"; // --color-bg
const TEXT = "#1d1f20"; // --color-text
const MUTED = "#5d5d60"; // --color-text-muted (neutral-700)

const STATS = ["PTS", "REB", "AST", "STL", "BLK", "FG%", "3P%", "TS%"];
// A real heatmap, not a made-up pattern: A'ja Wilson's seasons, 2026 (top) to 2018, each compared with their
// career average ("Self"), light theme — every cell's color as the app drew it (read from the page,
// 2026-09-28). null = a hollow cell (too few 3-point attempts to color), drawn as the app draws it.
const CELLS = [
  ["#ee7b72", "#f4eaec", "#ed6a5f", "#f3d2d2", "#e9eef5", "#f1b9b6", "#f1b3af", "#ee857c"], // 2026
  ["#f2c6c4", "#f2c1bf", "#ee7b71", "#f1aca7", "#f1aba7", "#f5eef1", "#ee847b", "#f3d0cf"], // 2025
  ["#ed695e", "#ed6c61", "#e8edf5", "#ee857c", "#ed6b60", "#f3cfce", "#6ba2d6", "#f4ddde"], // 2024
  ["#f3d6d6", "#f4e5e6", "#74a7d8", "#f3d2d2", "#f2c1be", "#ed7167", null, "#ee7d73"], // 2023
  ["#bdd3ea", "#f4eaec", "#c7d9ec", "#f3d2d2", "#e9eef5", "#f2f3f7", "#eef1f6", "#f5edf0"], // 2022
  ["#9dc0e2", "#f5eff1", "#ee7b71", "#b7d0e9", "#6ba2d6", "#6ba2d6", null, "#6ba2d6"], // 2021
  ["#d7e3f0", "#d3e1f0", "#b6cfe8", "#f1f2f7", "#f4ebee", "#c0d5eb", null, "#95bbe0"], // 2020
  ["#6ea4d6", "#6ba2d6", "#95bbe0", "#6ba2d6", "#bfd5eb", "#bed4ea", null, "#98bde1"], // 2019
  ["#dce6f2", "#bad2e9", "#d7e3f1", "#a4c4e4", "#bfd5eb", "#96bbe0", null, "#76a8d8"], // 2018
];

function card() {
  const W = 1200, H = 630;
  const cell = 46, gap = 6, pitch = cell + gap;
  const gridW = STATS.length * pitch - gap, gridH = CELLS.length * pitch - gap;
  const labelH = 34; // the stat names above the grid
  const gx = W - 80 - gridW;
  const gy = (H - (labelH + gridH)) / 2 + labelH;

  const labels = STATS.map(
    (s, c) =>
      `<text x="${gx + c * pitch + cell / 2}" y="${gy - 12}" text-anchor="middle" font-family="Barlow Condensed" font-weight="600" font-size="20" fill="${MUTED}">${s}</text>`,
  );
  const cells = CELLS.flatMap((row, r) =>
    row.map((fill, c) => {
      const x = gx + c * pitch, y = gy + r * pitch;
      // Hollow (.hm-muted): no fill, a 1.5px inside outline in the text color at 25%.
      return fill
        ? `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4" fill="${fill}"/>`
        : `<rect x="${x + 0.75}" y="${y + 0.75}" width="${cell - 1.5}" height="${cell - 1.5}" rx="3.25" fill="none" stroke="${TEXT}" stroke-opacity="0.25" stroke-width="1.5"/>`;
    }),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <text x="80" y="325" font-family="Barlow Condensed" font-weight="600" font-size="132" fill="${TEXT}">WNBA Arc</text>
  <text x="84" y="397" font-family="Barlow" font-weight="500" font-size="44" fill="${TEXT}">Breakout season or slump?</text>
  ${labels.join("\n  ")}
  ${cells.join("\n  ")}
</svg>`;
}

// The favicon's four cells (public/favicon.svg, its light colors) on a full square: iOS rounds the corners
// itself, and would show transparent ones as black.
function touchIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${BG}"/>
  <rect x="5" y="5" width="10" height="10" rx="2" fill="#ea3a2a"/>
  <rect x="17" y="5" width="10" height="10" rx="2" fill="#f7b8b1"/>
  <rect x="5" y="17" width="10" height="10" rx="2" fill="#3d86ca"/>
  <rect x="17" y="17" width="10" height="10" rx="2" fill="#b7cfe7"/>
</svg>`;
}

function render(svg, file, width) {
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Barlow" },
  })
    .render()
    .asPng();
  fs.writeFileSync(path.join(root, "public", file), png);
  console.log(`public/${file}: ${png.length.toLocaleString()} bytes`);
}

render(card(), "og.png", 1200);
render(touchIcon(), "apple-touch-icon.png", 180);
