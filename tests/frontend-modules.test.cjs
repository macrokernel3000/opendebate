const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const unique = (values) => [...new Set(values)];
const formatDate = (value) => value || "";
const scoreLabel = (match) => `${match.scores.affirmative}：${match.scores.negative}`;
const team = { code: "s1", name: "測試高中" };
const store = {
  entityById: new Map([[team.code, team], ["s2", { code: "s2", name: "對手高中" }]]),
  entityForName(name) {
    return [...this.entityById.values()].find((entity) => entity.name === name);
  },
};
const entityPageLink = (id, label, className = "") => store.entityById.has(id)
  ? `<button class="${className}">${escapeHtml(label)}</button>`
  : escapeHtml(label);
const playerPageLink = (name) => `<button>${escapeHtml(name)}</button>`;
const eventRouteLink = (name) => `<button>${escapeHtml(name)}</button>`;
const record = {
  competitionName: "測試盃",
  matchDate: "2026-01-01",
  period: "1",
  venue: "1",
  teams: { affirmative: team.name, negative: "對手高中" },
  teamIds: { affirmative: team.code, negative: "s2" },
  scores: { affirmative: 3, negative: 0 },
  winner: team.code,
  players: { affirmative: ["林選手"], negative: [] },
};
const fullCourseHonor = {
  competitionName: "測試盃",
  honorType: "player",
  honorName: "全程最佳辯士",
  recipient: "林選手",
  team: team.name,
  teamId: team.code,
  matchDate: "2026-01-01",
};
const events = [{
  name: "測試盃",
  records: [record],
  honors: [fullCourseHonor],
  topics: [{ topicId: "topic-test", topic: "測試題目", explanation: "賽事專屬題解", competitionName: "測試盃" }],
  rosters: [{ competitionName: "測試盃", team: team.name, leaders: ["領隊"], players: ["林選手"] }],
  dates: [record.matchDate],
  latestDate: record.matchDate,
  teamCount: 2,
  metadata: { startDate: record.matchDate, endDate: record.matchDate },
}];

function loadFactory(filename, globalValues = {}) {
  const window = { ...globalValues };
  const context = { window, Map, Set, Number, String, Object, Array, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, filename), "utf8"), context, { filename });
  return window;
}

function eventPageDependencies() {
  return {
    els: { eventPageDetail: { innerHTML: "" }, eventDetail: { innerHTML: "" } },
    getEvents: () => events,
    store,
    escapeHtml,
    formatDate,
    groupByDate: (rows) => rows.reduce((groups, item) => ({
      ...groups,
      [item.matchDate]: [...(groups[item.matchDate] || []), item],
    }), {}),
    normalize: (value) => String(value ?? "").normalize("NFKC"),
    matchScoreLabel: scoreLabel,
    isSingleMatchHonor: () => false,
    isSingleMatchExcellent: () => false,
    entityPageLink,
    playerPageLink,
    renderEventHonors: () => "",
  };
}

function entityPageDependencies(target) {
  return {
    els: { topicPageDetail: target },
    getEvents: () => events,
    records: [record],
    honors: [fullCourseHonor, { ...fullCourseHonor, honorType: "team", honorName: "冠軍", recipient: team.name }],
    topics: events[0].topics,
    store,
    escapeHtml,
    formatDate,
    unique,
    matchScoreLabel: scoreLabel,
    matchResultForEntity: (match, id) => match.winner === id ? "勝" : "敗",
    playerRosterEntries: () => events[0].rosters,
    entityPageLink,
    playerPageLink,
    honorSubject: (honor) => honor.recipient,
    honorDateLabel: (honor) => honor.matchDate || "日期未載明",
    isFullCourseBest: (honor) => honor.honorName === "全程最佳辯士",
    isFullCourseExcellent: () => false,
    isSingleMatchBest: () => false,
    isSingleMatchExcellent: () => false,
  };
}

test("event pages render upcoming details and recorded match results", () => {
  const window = loadFactory("js/event-pages.js");
  const pages = window.DebateEventPages.createEventPages(eventPageDependencies());
  const target = { innerHTML: "" };

  pages.renderUpcomingEvent({
    name: "未來盃",
    startDate: "2026-02-01",
    endDate: "2026-02-02",
    organizer: "主辦單位",
    location: "比賽地點",
    keyDates: [{ label: "領隊會議", date: "2026-01-20", time: "18:00" }],
  }, target);
  assert.match(target.innerHTML, /主辦單位/);
  assert.match(target.innerHTML, /比賽地點/);
  assert.match(target.innerHTML, /領隊會議/);
  assert.match(target.innerHTML, /2026-01-20 18:00/);

  pages.renderEvent("測試盃", target);
  assert.match(target.innerHTML, /測試高中/);
  assert.match(target.innerHTML, /對手高中/);
  assert.match(target.innerHTML, /winner-score/);
  assert.match(target.innerHTML, /比賽結果/);
});

test("entity pages keep event-specific topic explanations and player honors", () => {
  const target = { innerHTML: "" };
  const window = loadFactory("js/entity-pages.js", {
    DEBATE_PUBLIC_DATA: { eventRosters: { "測試盃": events[0].rosters } },
  });
  const pages = window.DebateEntityPages.createEntityPages(entityPageDependencies(target));

  pages.renderTopic("topic-test");
  assert.match(target.innerHTML, /測試題目/);
  assert.match(target.innerHTML, /賽事專屬題解/);
  assert.match(target.innerHTML, /測試盃/);

  const playerHtml = pages.renderPlayerDetail("林選手");
  assert.match(playerHtml, /全程最佳辯士/);
  assert.match(playerHtml, /隊伍名單/);
  assert.match(playerHtml, /登場紀錄/);

  const schoolHtml = pages.renderEntityDetail(team, "schoolPageEntityDetail", true);
  assert.match(schoolHtml, /測試高中的完整紀錄/);
  assert.match(schoolHtml, /冠軍/);
  assert.match(schoolHtml, /3：0/);
});
