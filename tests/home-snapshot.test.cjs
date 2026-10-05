const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const storageKey = "opendebate.home-snapshot.v1";

function setup({ snapshot, hash = "#home", search = "", now = 2_000_000_000_000, storageUnavailable = false } = {}) {
  const storage = new Map(snapshot ? [[storageKey, JSON.stringify(snapshot)]] : []);
  const homeClasses = new Set();
  const home = {
    innerHTML: "live homepage",
    classList: { add(name) { homeClasses.add(name); } },
    querySelector(selector) {
      return selector === "[data-snapshot-warning]" && this.innerHTML.includes("data-snapshot-warning")
        ? { dataset: { snapshotWarning: "true" } }
        : null;
    },
  };
  const warnings = [];
  const main = {
    querySelector() { return warnings[0] || null; },
    prepend(node) { warnings.unshift(node); },
  };
  const document = {
    querySelector(selector) {
      if (selector === "#homeView") return home;
      if (selector === "main") return main;
      return null;
    },
    createElement(tag) {
      return {
        tagName: tag,
        dataset: {},
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
      };
    },
  };
  const localStorage = {
    getItem(key) {
      if (storageUnavailable) throw new Error("storage unavailable");
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (storageUnavailable) throw new Error("storage unavailable");
      storage.set(key, value);
    },
    removeItem(key) {
      if (storageUnavailable) throw new Error("storage unavailable");
      storage.delete(key);
    },
  };
  class FixedDate extends Date {
    static now() { return now; }
  }
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/home-snapshot.js"), "utf8"), {
    window,
    document,
    localStorage,
    location: { hash, search },
    Date: FixedDate,
    JSON,
    Number,
  }, { filename: "js/home-snapshot.js" });
  return { api: window.DebateHomeSnapshot, home, homeClasses, main, storage, warnings };
}

test("home snapshot restores valid content and hides it behind a deep link", () => {
  const savedAt = 1_999_000_000_000;
  const app = setup({
    snapshot: { version: 2, savedAt, generatedAt: "2026-10-04", html: "<section>快照</section>" },
    hash: "#event/%E6%B8%AC%E8%A9%A6%E7%9B%83",
  });

  assert.equal(app.api.restored, true);
  assert.equal(app.api.restore(), true);
  assert.equal(app.home.innerHTML, "<section>快照</section>");
  assert.equal(app.homeClasses.has("is-hidden"), true);
});

test("home snapshot rejects expired and unsupported entries", () => {
  const expired = setup({
    snapshot: { version: 2, savedAt: 1_000, html: "過期" },
  });
  assert.equal(expired.api.restored, false);
  assert.equal(expired.storage.has(storageKey), false);

  const unsupported = setup({
    snapshot: { version: 3, savedAt: 1_999_000_000_000, html: "其他格式" },
  });
  assert.equal(unsupported.api.restored, false);
  assert.equal(unsupported.home.innerHTML, "live homepage");
});

test("snapshot save refreshes live content but skips warning and oversized pages", () => {
  const app = setup();
  app.home.innerHTML = "最新首頁";
  app.api.save("2026-10-05T10:00:00");
  const saved = JSON.parse(app.storage.get(storageKey));
  assert.equal(saved.html, "最新首頁");
  assert.equal(saved.version, 2);
  assert.equal(saved.generatedAt, "2026-10-05T10:00:00");

  app.home.innerHTML = "<p data-snapshot-warning>保留快照</p>";
  app.api.save("2026-10-05T11:00:00");
  assert.equal(JSON.parse(app.storage.get(storageKey)).html, "最新首頁");

  app.home.innerHTML = "x".repeat(1_500_001);
  app.api.save("2026-10-05T12:00:00");
  assert.equal(JSON.parse(app.storage.get(storageKey)).html, "最新首頁");
});

test("failed refresh warning appears once only when a snapshot was restored", () => {
  const fresh = setup();
  assert.equal(fresh.api.showUnavailable(), false);
  assert.equal(fresh.warnings.length, 0);

  const restored = setup({
    snapshot: { version: 2, savedAt: 1_999_000_000_000, html: "可讀首頁" },
  });
  assert.equal(restored.api.showUnavailable(), true);
  assert.equal(restored.warnings.length, 1);
  assert.equal(restored.warnings[0].textContent, "暫時無法更新最新資料；首頁先保留上次成功載入的內容。");
  assert.equal(restored.warnings[0].attributes.role, "status");
  assert.equal(restored.api.showUnavailable(), true);
  assert.equal(restored.warnings.length, 1);
});

test("unavailable browser storage does not stop live rendering or snapshot initialization", () => {
  const app = setup({ storageUnavailable: true });
  assert.equal(app.api.restored, false);
  assert.equal(app.home.innerHTML, "live homepage");
  assert.doesNotThrow(() => app.api.save("2026-10-05T10:00:00"));
  assert.equal(app.api.showUnavailable(), false);
});
