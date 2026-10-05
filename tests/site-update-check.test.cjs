const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const scriptPath = path.join(root, "js/site-update-check.js");

function setup({ currentVersion = "old", latestVersion = "old", visibilityState = "visible", online = true, fetchImpl } = {}) {
  const timers = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  let reloadCount = 0;
  let fetchCount = 0;
  const listener = () => {};
  const currentDataScript = { getAttribute: () => `data/public-data.js?v=${currentVersion}` };
  const latestDataScript = { getAttribute: () => `data/public-data.js?v=${latestVersion}` };
  const notice = { hidden: true };
  const reloadButton = { addEventListener: (name, handler) => { reloadButton[name] = handler; } };
  const dismissButton = { addEventListener: (name, handler) => { dismissButton[name] = handler; } };
  const document = {
    baseURI: "https://example.test/opendebate/",
    visibilityState,
    querySelector(selector) {
      return ({
        "script[data-public-data-script]": currentDataScript,
        "#siteUpdateNotice": notice,
        "[data-site-update-reload]": reloadButton,
        "[data-site-update-dismiss]": dismissButton,
      })[selector] || null;
    },
    addEventListener(name, handler) { documentListeners.set(name, handler); },
  };
  class FakeDOMParser {
    parseFromString() { return { querySelector: () => latestDataScript }; }
  }
  const window = {
    location: { reload() { reloadCount += 1; } },
    addEventListener(name, handler) { windowListeners.set(name, handler); },
    setTimeout(handler, delay) { timers.push({ handler, delay, repeat: false }); },
    setInterval(handler, delay) { timers.push({ handler, delay, repeat: true }); },
  };
  const fetch = async (...args) => {
    fetchCount += 1;
    return fetchImpl ? fetchImpl(...args) : { ok: true, text: async () => "latest index" };
  };
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), {
    window,
    document,
    navigator: { onLine: online },
    URL,
    Date,
    DOMParser: FakeDOMParser,
    fetch,
  }, { filename: "js/site-update-check.js" });

  return {
    timers,
    windowListeners,
    documentListeners,
    notice,
    reloadButton,
    dismissButton,
    get fetchCount() { return fetchCount; },
    get reloadCount() { return reloadCount; },
  };
}

async function runInitialCheck(app) {
  await app.windowListeners.get("pageshow")();
}

test("stale data version shows an optional reload notice without reloading automatically", async () => {
  const app = setup({ latestVersion: "new" });
  await runInitialCheck(app);

  assert.equal(app.notice.hidden, false);
  assert.equal(app.reloadCount, 0);
  app.reloadButton.click();
  assert.equal(app.reloadCount, 1);
});

test("matching data version leaves the page unchanged", async () => {
  const app = setup({ currentVersion: "same", latestVersion: "same" });
  await runInitialCheck(app);
  assert.equal(app.notice.hidden, true);
  assert.equal(app.reloadCount, 0);
});

test("offline, hidden, and failed checks do not affect browsing", async () => {
  const offline = setup({ latestVersion: "new", online: false });
  await runInitialCheck(offline);
  assert.equal(offline.fetchCount, 0);
  assert.equal(offline.notice.hidden, true);

  const hidden = setup({ latestVersion: "new", visibilityState: "hidden" });
  await runInitialCheck(hidden);
  assert.equal(hidden.fetchCount, 0);
  assert.equal(hidden.notice.hidden, true);

  const failed = setup({ latestVersion: "new", fetchImpl: async () => { throw new Error("offline"); } });
  await runInitialCheck(failed);
  assert.equal(failed.fetchCount, 1);
  assert.equal(failed.notice.hidden, true);
  assert.equal(failed.reloadCount, 0);
});

test("dismissing an update notice keeps it hidden", async () => {
  const app = setup({ latestVersion: "new" });
  await runInitialCheck(app);
  app.dismissButton.click();
  assert.equal(app.notice.hidden, true);
});

test("index provides a polite notice and keeps its controls touch sized", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(html, /id="siteUpdateNotice"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html, /data-site-update-reload/);
  assert.match(html, /data-site-update-dismiss/);
  assert.match(css, /\.site-update-notice button \{[^}]*min-height: 44px/s);
});
