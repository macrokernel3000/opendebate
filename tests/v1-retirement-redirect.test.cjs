const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "..", "js", "v1-retirement-redirect.js"), "utf8");
const root = join(__dirname, "..");

function runRedirect(location) {
  const links = [{ href: "" }];
  let replacedWith = "";
  let timeoutDelay = null;
  const context = {
    URL,
    window: {
      location: {
        pathname: location.pathname,
        hostname: location.hostname || "macrokernel3000.github.io",
        search: location.search || "",
        hash: location.hash || "",
        replace(value) { replacedWith = value; },
      },
      setTimeout(callback, delay) {
        timeoutDelay = delay;
        callback();
      },
    },
    document: {
      addEventListener(name, callback) {
        assert.equal(name, "DOMContentLoaded");
        callback();
      },
      querySelectorAll(selector) {
        assert.equal(selector, "[data-v2-link]");
        return links;
      },
    },
  };

  vm.runInNewContext(source, context);
  return { destination: context.window.OPENDEBATE_V2_DESTINATION, links, replacedWith, timeoutDelay };
}

test("首頁保留搜尋與 hash 深連結", () => {
  const result = runRedirect({ pathname: "/opendebate/", search: "?q=北聯", hash: "#overview" });
  assert.equal(result.destination, "https://opendebate.kerneldebate.com/site/?q=%E5%8C%97%E8%81%AF#overview");
  assert.equal(result.links[0].href, result.destination);
  assert.equal(result.replacedWith, result.destination);
  assert.equal(result.timeoutDelay, 450);
});

test("首頁沒有 hash 時進入新版首頁", () => {
  const result = runRedirect({ pathname: "/opendebate/" });
  assert.equal(result.destination, "https://opendebate.kerneldebate.com/site/#home");
});

test("辯論戰績頁導向新版獨立頁面", () => {
  const result = runRedirect({ pathname: "/opendebate/debate-records.html", search: "?from=search" });
  assert.equal(result.destination, "https://opendebate.kerneldebate.com/site/debate-records?from=search");
});

test("本機預覽不自動離開轉移說明頁", () => {
  const result = runRedirect({ pathname: "/", hostname: "127.0.0.1" });
  assert.equal(result.destination, "https://opendebate.kerneldebate.com/site/");
  assert.equal(result.replacedWith, "");
  assert.equal(result.timeoutDelay, null);
});

test("退役頁有明確狀態、正式網址與免 JavaScript 後備導向", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /name="opendebate-site-state" content="v1-retired"/);
  assert.match(html, /rel="canonical" href="https:\/\/opendebate\.kerneldebate\.com\/site\/"/);
  assert.match(html, /http-equiv="refresh" content="10; url=https:\/\/opendebate\.kerneldebate\.com\/site\/"/);
});

test("舊 App 與既有公開連結需要的相容檔案仍保留", () => {
  [
    "data/ios/v1/manifest.json",
    "data/ios/v1/catalog.json",
    "calendar.ics",
    "privacy/index.html",
    "support/index.html",
  ].forEach((relativePath) => assert.equal(existsSync(join(root, relativePath)), true, relativePath));
});
