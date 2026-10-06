const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const configSource = fs.readFileSync("js/member-config.js", "utf8");
const scriptSource = fs.readFileSync("js/member-portal.js", "utf8");
const html = fs.readFileSync("member.html", "utf8");

const configContext = { window: {} };
vm.runInNewContext(configSource, configContext);
assert.equal(configContext.window.DEBATE_MEMBER_CONFIG.enabled, false, "正式會員入口預設必須關閉");
assert.equal(configContext.window.DEBATE_MEMBER_CONFIG.portalUrl, "", "未驗收前不可預填正式後台網址");
assert.doesNotMatch(configSource, /(secret|service_role|channel_secret)\s*:/i, "前端設定不可包含後端密鑰");
assert.match(html, /noindex,nofollow/, "未開放入口不應被搜尋引擎收錄");
assert.match(scriptSource, /protocol === "https:"/, "正式入口只接受 HTTPS");

console.log("member portal guard: 5 checks passed");
