const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `Missing CSS color token --${name}`);
  return match[1];
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = [r, g, b].map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("small coral text keeps AA contrast on common light surfaces", () => {
  const coralText = token("coral-text");
  const lightSurfaces = ["#fffdf8", "#ffffff", "#f4f1e8", "#fffaf0", "#f7fbf8", "#fff6d5", "#ffefb7"];
  for (const surface of lightSurfaces) {
    assert.ok(
      contrastRatio(coralText, surface) >= 4.5,
      `${coralText} on ${surface} must reach 4.5:1 for small text`,
    );
  }
});

test("hero eyebrow keeps AA contrast on its dark green background", () => {
  const yellow = token("yellow");
  const darkGreen = token("green-dark");
  assert.ok(contrastRatio(yellow, darkGreen) >= 4.5, "Hero eyebrow accent must reach 4.5:1");
  assert.match(css, /\.hero-content\s+\.eyebrow\s*\{[^}]*color:\s*var\(--yellow\)/);
});

test("report contact links keep a 24px tap target", () => {
  assert.match(
    css,
    /\.report-contact-card a\s*\{[^}]*display:\s*flex[^}]*min-height:\s*24px[^}]*align-items:\s*center/,
  );
});

test("short mobile viewports compact the fixed navigation without shrinking targets below 44px", () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)\s*and\s*\(max-height:\s*500px\)\s*\{[^}]*\.main-nav\s*\{[^}]*height:\s*56px/);
  assert.match(css, /\.nav-button\s*\{[^}]*min-height:\s*44px/);
});

test("personal and team record forms require the event and record owner", () => {
  for (const id of ["personalCompetition", "personalName", "teamCompetition", "teamName"]) {
    assert.match(html, new RegExp(`<input\\b(?=[^>]*\\bid="${id}")(?=[^>]*\\brequired(?:\\s|>|=))[^>]*>`), `${id} should be required`);
  }
});
