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
  const lightSurfaces = ["#fffdf8", "#ffffff", "#f4f1e8", "#fffaf0", "#f7fbf8", "#fff6d5", "#ffefb7", "#fff1e8"];
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

test("keyboard users can skip the shared navigation to the main content", () => {
  assert.match(html, /<a class="skip-link" href="#mainContent">跳到主要內容<\/a>/);
  assert.match(html, /<main id="mainContent" tabindex="-1">/);
  assert.match(css, /\.skip-link\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /\.skip-link:focus\s*\{[^}]*outline:/);
});

test("static page has unique IDs, valid in-page links, and existing local scripts", () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const seen = new Set();
  for (const id of ids) {
    assert.ok(!seen.has(id), `Duplicate HTML id: ${id}`);
    seen.add(id);
  }

  const routeHashes = new Set(["home", "overview", "search", "archive", "reports", "events"]);
  const dynamicHashLinks = new Set(["reportFormLink"]);
  const hashLinks = [...html.matchAll(/\bhref=["']#([^"']*)["']/g)].map((match) => match[1]);
  for (const hash of hashLinks) {
    if (!hash) {
      assert.ok(dynamicHashLinks.has("reportFormLink") && /id="reportFormLink"/.test(html) && /els\.reportFormLink\.href\s*=\s*config\.formUrl/.test(fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8")), "Placeholder form link must be wired during startup");
      continue;
    }
    if (routeHashes.has(hash) || /^(event|school|player|topic)\//.test(hash)) continue;
    assert.ok(seen.has(decodeURIComponent(hash)), `Missing in-page target for #${hash}`);
  }

  const localScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((match) => match[1].split("?", 1)[0])
    .filter((src) => !/^[a-z][a-z\d+.-]*:/i.test(src));
  for (const src of localScripts) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", src)), `Missing local script: ${src}`);
  }
});

test("personal event suggestions expose a named combobox and listbox", () => {
  assert.match(html, /id="personalCompetition"[^>]*role="combobox"[^>]*aria-controls="personalCompetitionSuggestions"[^>]*aria-autocomplete="list"[^>]*aria-expanded="false"/);
  assert.match(html, /id="personalCompetitionSuggestions"[^>]*role="listbox"[^>]*aria-label="已登錄賽事建議"/);
});

test("upcoming event cards do not visually clip event names or locations", () => {
  const titleRule = css.match(/\.mobile-upcoming-card h3\s*\{([^}]*)\}/)?.[1] || "";
  const locationRule = css.match(/\.mobile-upcoming-location\s*\{([^}]*)\}/)?.[1] || "";
  for (const rule of [titleRule, locationRule]) {
    assert.doesNotMatch(rule, /line-clamp|overflow:\s*hidden/);
  }
});

test("search names people roles and result pages label the declared winning team", () => {
  assert.match(html, /搜尋學校、隊伍、人物或辯題/);
  assert.match(css, /\.entity-card\.player\s*\{[^}]*cursor:\s*pointer/);
  assert.match(css, /\.match-winner-marker\s*\{[^}]*color:\s*var\(--coral-text\)/);
  assert.match(css, /\.match-winner-marker\s*\{[^}]*background:\s*#fff1e8/);
});

test("report contact links keep a 44px touch target", () => {
  assert.match(
    css,
    /\.report-contact-card a\s*\{[^}]*display:\s*flex[^}]*min-height:\s*44px[^}]*align-items:\s*center/,
  );
});

test("expanded event source links keep 44px touch targets", () => {
  const rules = [
    css.match(/\.event-metadata-note a\s*\{([^}]*)\}/)?.[1] || "",
    css.match(/\.match-note-disclosure a\s*\{([^}]*)\}/)?.[1] || "",
  ];
  for (const rule of rules) {
    assert.match(rule, /display:\s*inline-flex/);
    assert.match(rule, /align-items:\s*center/);
    assert.match(rule, /min-height:\s*44px/);
  }
});

test("short mobile viewports compact the fixed navigation without shrinking targets below 44px", () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)\s*and\s*\(max-height:\s*500px\)\s*\{[^}]*\.main-nav\s*\{[^}]*height:\s*56px/);
  assert.match(css, /\.nav-button\s*\{[^}]*min-height:\s*44px/);
});

test("very narrow home layouts stack the honor range controls instead of overflowing", () => {
  assert.match(css, /@media\s*\(max-width:\s*380px\)[\s\S]{0,250}\.leaderboard-controls\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)[\s\S]{0,350}\.leaderboard-range-legend\s*\{[^}]*white-space:\s*normal/);
});

test("mobile home calendar and honor controls keep 44px touch targets", () => {
  assert.match(css, /\.calendar-subscribe-button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /#homeView\s*>\s*\.leaderboard-band\s+\.honor-range-toggle\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /#homeView\s*>\s*\.leaderboard-band\s+\.olympic-filter\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /#homeView\s*>\s*\.leaderboard-band\s+\.mobile-honor-ranking\s+li\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.mobile-honor-ranking\s+strong\s+\.inline-entity-link\s*\{[^}]*min-height:\s*44px/);
});

test("overview tabs keep 44px touch targets at compact mobile widths", () => {
  assert.match(css, /\.overview-tab\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*360px\)[\s\S]*?\.overview-tab\s*\{[^}]*min-height:\s*44px/);
  assert.doesNotMatch(css, /\.overview-tab\s*\{[^}]*min-height:\s*(?:38|40)px/);
});

test("mobile forms and common navigation controls keep 44px touch targets", () => {
  assert.match(css, /\.brand\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.mobile-menu-toggle\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/);
  assert.match(css, /\.search-box button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/);
  assert.match(css, /\.report-contact-card a\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.record-field input, \.record-field select, \.record-field textarea, \.search-field input\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.record-button, \.record-import\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.record-chart-heading button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/);
});

test("standalone detail page controls keep 44px mobile touch targets", () => {
  const detailControls = css.match(/\.detail-page-shell \.event-back-button,[\s\S]{0,260}\.detail-page-shell summary \{[^}]*min-height:\s*44px/);
  const inlineDetailLinks = css.match(/\.detail-page-shell \.inline-entity-link,[\s\S]{0,220}\.detail-page-shell \.entity-event-link \{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
  assert.ok(detailControls, "Detail back, disclosure, and topic controls should be at least 44px high on mobile");
  assert.ok(inlineDetailLinks, "Inline entity and event links should provide at least 44px touch boxes on mobile");
  assert.match(css, /\.event-back-button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.topic-title-link\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /#eventDetail \.inline-entity-link,[\s\S]{0,140}#eventDetail \.entity-event-link \{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
});

test("personal and team record forms require the event and record owner", () => {
  for (const id of ["personalCompetition", "personalName", "teamCompetition", "teamName"]) {
    assert.match(html, new RegExp(`<input\\b(?=[^>]*\\bid="${id}")(?=[^>]*\\brequired(?:\\s|>|=))[^>]*>`), `${id} should be required`);
  }
});

test("desktop and mobile home layouts each expose a primary heading", () => {
  assert.match(html, /<h1 id="mobileRecentTitle">/);
  assert.match(html, /<h1 id="timelineTitle">/);
  assert.match(css, /\.mobile-home-section\s+\.section-heading\s+h1[^}]*font-size:\s*18px/);
});
