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
  const context = { window, document: globalValues.document || {}, Map, Set, Number, String, Object, Array, console };
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

test("overview separates schools and teams and redraws selected monthly metrics", () => {
  const school = { code: "s1", name: "測試高中", type: "s", aliases: "測試" };
  const club = { code: "t1", name: "測試辯論隊", type: "t", aliases: "測試隊" };
  const rival = { code: "s2", name: "對手高中", type: "s", aliases: "" };
  const overviewRecord = {
    ...record,
    competitionName: "測試盃",
    teams: { affirmative: school.name, negative: rival.name },
    teamIds: { affirmative: school.code, negative: rival.code },
    winner: school.code,
  };
  const overviewEvent = {
    ...events[0],
    records: [overviewRecord],
    latestDate: "2026-02-01",
    dates: ["2026-02-01"],
    metadata: { startDate: "2026-02-01" },
  };
  const parseInputs = (html, checkedOnly = false) => [...html.matchAll(/<input type="checkbox" value="(\d+)"( checked)?/g)]
    .filter((match) => !checkedOnly || Boolean(match[2]))
    .map((match) => ({ value: match[1], focus() {} }));
  const years = {
    innerHTML: "",
    contains: () => false,
    querySelectorAll(selector) { return parseInputs(this.innerHTML, selector === "input:checked"); },
    querySelector() { return null; },
  };
  const node = (value = "") => ({ value, innerHTML: "", textContent: "", classList: { toggle() {} }, setAttribute() {} });
  const els = {
    eventSearch: node(""),
    eventYear: node(""),
    eventSortBy: node("year"),
    eventSortDirection: node("desc"),
    eventFinderMeta: node(),
    eventFinderResults: node(),
    overviewStatsChart: node(),
    overviewStatsYears: years,
    overviewStatsMetric: node("events"),
    overviewStatsSummary: node(),
    overviewStatsMeta: node(),
    overviewTeamFilter: node(""),
    overviewTeamSortBy: node("matches"),
    overviewTeamSortDirection: node("desc"),
    overviewTeamMeta: node(),
    overviewTeamList: node(),
  };
  const entities = [school, club, rival];
  const overviewStore = {
    entities,
    entityById: new Map(entities.map((item) => [item.code, item])),
    entityForName(name) { return entities.find((item) => item.name === name); },
  };
  const fakeDocument = { activeElement: null };
  const window = loadFactory("js/overview-pages.js", {
    document: fakeDocument,
    matchMedia: () => ({ matches: true }),
    DEBATE_PUBLIC_DATA: { eventRosters: { "測試盃": [{ team: club.name, competitionName: "測試盃" }] } },
  });
  const pages = window.DebateOverviewPages.createOverviewPages({
    els,
    getEvents: () => [overviewEvent],
    getTopics: () => events[0].topics,
    getRecords: () => [overviewRecord],
    getHonors: () => [],
    store: overviewStore,
    normalize: (value) => String(value ?? "").normalize("NFKC"),
    unique,
    formatDate,
    escapeHtml,
    matchResultForEntity: (match, id) => match.winner === id ? "勝" : "敗",
  });

  pages.renderOverviewTeams();
  assert.match(els.overviewTeamList.innerHTML, /學校 <span>2<\/span>/);
  assert.match(els.overviewTeamList.innerHTML, /隊伍 <span>1<\/span>/);
  assert.match(els.overviewTeamList.innerHTML, /測試辯論隊/);
  assert.match(els.overviewTeamMeta.textContent, /2 所學校、1 支隊伍/);

  pages.renderEventOptions();
  assert.match(els.eventYear.innerHTML, /2026 年/);
  assert.match(els.eventFinderResults.innerHTML, /測試盃/);
  assert.match(els.eventFinderMeta.textContent, /找到 1 個賽事/);

  pages.renderOverviewStats();
  assert.match(els.overviewStatsChart.innerHTML, /每月賽事數年度趨勢折線圖/);
  assert.match(els.overviewStatsSummary.innerHTML, /不重複隊伍/);
  els.overviewStatsMetric.value = "teams";
  pages.renderOverviewStats();
  assert.match(els.overviewStatsChart.innerHTML, /每月參賽隊次年度趨勢折線圖/);
});

test("home pages render summaries, timeline and upcoming events, and keep leaderboard controls working", () => {
  const school = { code: "s1", name: "測試高中", type: "s" };
  const rival = { code: "s2", name: "對手高中", type: "s" };
  const homeStore = {
    entities: [school, rival],
    entityById: new Map([[school.code, school], [rival.code, rival]]),
    entityForName(name) { return this.entities.find((entity) => entity.name === name); },
    entityName(id, fallback = "") { return this.entityById.get(id)?.name || fallback; },
  };
  const homeRecord = {
    ...record,
    teams: { affirmative: school.name, negative: rival.name },
    teamIds: { affirmative: school.code, negative: rival.code },
    winner: school.code,
  };
  const homeHonors = [
    { competitionName: "測試盃", honorType: "team", honorName: "冠軍", recipient: school.name, teamId: school.code, matchDate: "2026-01-01" },
    { competitionName: "測試盃", honorType: "player", honorName: "全程優秀辯士", recipient: "林選手", team: school.name, teamId: school.code, matchDate: "2026-01-01" },
    { competitionName: "測試盃", honorType: "team", honorName: "精神總錦標", recipient: school.name, teamId: school.code, matchDate: "2026-01-01" },
  ];
  const homeEvent = { ...events[0], records: [homeRecord], honors: homeHonors, latestDate: "2026-01-01" };
  const fakeButton = (filter) => ({
    dataset: { honorFilter: filter },
    classList: { toggle() {} },
    setAttribute() {},
  });
  const filters = [fakeButton("team"), fakeButton("individual"), fakeButton("otherOnly")];
  const fakeDocument = { querySelectorAll(selector) { return selector === "[data-honor-filter]" ? filters : []; } };
  const node = () => ({ innerHTML: "", textContent: "", dataset: {}, classList: { toggle() {} }, setAttribute() {} });
  const els = {
    statsBand: node(),
    siteIntroductionTitle: node(),
    eventTimeline: node(),
    recentEvents: node(),
    mobileRecentEvents: node(),
    mobileEventCount: node(),
    mobileMatchCount: node(),
    mobileUpcomingEvents: node(),
    schoolLeaderboard: node(),
    mobileHonorRanking: node(),
    gamesLeaderboard: node(),
    winsLeaderboard: node(),
    honorRangeToggle: node(),
    honorLeaderboardTitle: node(),
    gamesLeaderboardTitle: node(),
    winsLeaderboardTitle: node(),
    leaderboardBand: node(),
    mobileHonorTitle: node(),
  };
  const upcoming = [{ name: "未來盃", startDate: "2099-01-01", endDate: "2099-01-02", location: "測試會場" }];
  const window = loadFactory("js/home-pages.js", { document: fakeDocument });
  const pages = window.DebateHomePages.createHomePages({
    els,
    getEvents: () => [homeEvent],
    getRecords: () => [homeRecord],
    getHonors: () => homeHonors,
    getUpcomingEvents: () => upcoming,
    getSiteContent: () => ({ introTitle: "首頁測試標題" }),
    store: homeStore,
    escapeHtml,
    formatDate,
    unique,
    honorSubject: (honor) => honor.recipient || honor.team,
    entityPageLink: (id, label) => `<a>${escapeHtml(homeStore.entityName(id, label))}</a>`,
    playerPageLink,
    isSingleMatchBest: () => false,
    isFullCourseBest: (honor) => honor.honorName === "全程最佳辯士",
    isFullCourseExcellent: (honor) => honor.honorName === "全程優秀辯士",
    isSingleMatchExcellent: () => false,
  });

  pages.renderHome();
  assert.match(els.statsBand.innerHTML, /公開戰果.*1/);
  assert.equal(els.siteIntroductionTitle.textContent, "首頁測試標題");
  assert.match(els.eventTimeline.innerHTML, /未來盃/);
  assert.match(els.eventTimeline.innerHTML, /測試盃/);
  assert.match(els.recentEvents.innerHTML, /冠軍/);
  assert.match(els.mobileUpcomingEvents.innerHTML, /測試會場/);
  assert.match(els.mobileHonorRanking.innerHTML, /全程優秀辯士|優/);
  assert.equal(els.honorLeaderboardTitle.textContent, "近年度榮譽榜");

  pages.toggleHonorRange();
  assert.equal(els.honorLeaderboardTitle.textContent, "全年度榮譽榜");
  pages.toggleMobileHonorFilter("otherOnly");
  assert.match(els.mobileHonorRanking.innerHTML, /精神總錦標|獎/);
  pages.sortLeaderboard("gold");
  pages.sortLeaderboard("invalid-key");
});

test("search pages cover empty, alias, player, topic and unmatched search states", () => {
  const school = { code: "s1", name: "測試高中<甲>", type: "s", aliases: "測試別名|測試 A 隊" };
  const rival = { code: "s2", name: "對手高中", type: "s", aliases: "" };
  const searchStore = {
    entities: [school, rival],
    entityById: new Map([[school.code, school], [rival.code, rival]]),
  };
  const searchRecord = {
    ...record,
    teams: { affirmative: school.name, negative: rival.name },
    teamIds: { affirmative: school.code, negative: rival.code },
  };
  const searchHonors = [
    { ...fullCourseHonor, team: school.name, teamId: school.code },
  ];
  const searchEvent = { ...events[0], records: [searchRecord], honors: searchHonors };
  const els = { searchMeta: { textContent: "" }, searchResults: { innerHTML: "" } };
  const rosters = { "測試盃": [{ team: school.name, leaders: ["領隊"], players: ["隊員甲"] }] };
  const window = loadFactory("js/search-pages.js");
  const pages = window.DebateSearchPages.createSearchPages({
    els,
    getEvents: () => [searchEvent],
    getRecords: () => [searchRecord],
    getHonors: () => searchHonors,
    getTopics: () => events[0].topics,
    getRosters: () => rosters,
    store: searchStore,
    normalize: (value) => String(value ?? "").normalize("NFKC"),
    escapeHtml,
    unique,
    formatDate,
    matchScoreLabel: scoreLabel,
    honorSubject: (honor) => honor.recipient || honor.team,
    honorDateLabel: (honor) => honor.matchDate || "日期未載明",
    playerRosterEntries: (name) => Object.entries(rosters).flatMap(([competitionName, entries]) => entries
      .filter((roster) => [...(roster.leaders || []), ...(roster.players || [])].includes(name))
      .map((roster) => ({ ...roster, competitionName }))),
  });

  pages.renderSearch("");
  assert.match(els.searchResults.innerHTML, /從一個名字開始/);
  assert.equal(els.searchMeta.textContent, "");

  assert.deepEqual(pages.getKnownPlayers(), ["林選手", "領隊", "隊員甲"]);
  pages.renderSearch("測試別名");
  assert.match(els.searchMeta.textContent, /找到 1 個學校／隊伍/);
  assert.match(els.searchResults.innerHTML, /測試高中&lt;甲&gt;/);
  assert.match(els.searchResults.innerHTML, /3：0/);
  assert.match(els.searchResults.innerHTML, /全程最佳辯士/);

  pages.renderSearch("隊員甲");
  assert.match(els.searchResults.innerHTML, /data-player-route="隊員甲"/);
  assert.match(els.searchResults.innerHTML, /測試高中&lt;甲&gt;/);

  pages.renderSearch("賽事專屬題解");
  assert.match(els.searchMeta.textContent, /1 筆辯題/);
  assert.match(els.searchResults.innerHTML, /data-topic-route="topic-test"/);
  assert.match(els.searchResults.innerHTML, /data-event-route="測試盃"/);

  pages.renderSearch("查無此資料");
  assert.match(els.searchMeta.textContent, /沒有找到/);
  assert.match(els.searchResults.innerHTML, /目前沒有相符資料/);
});

test("record storage reports write failures and honors native form validation", () => {
  const window = loadFactory("js/record-storage.js");
  const saved = [];
  const storage = { setItem: (key, value) => saved.push([key, value]) };
  assert.equal(window.DebateRecordStorage.save(storage, "records", [{ id: "1" }]), true);
  assert.deepEqual(saved, [["records", '[{"id":"1"}]']]);

  const blockedStorage = { setItem() { throw new Error("quota exceeded"); } };
  assert.equal(window.DebateRecordStorage.save(blockedStorage, "records", [{ id: "2" }]), false);

  let checks = 0;
  assert.equal(window.DebateRecordStorage.isValid({ reportValidity: () => { checks += 1; return false; } }), false);
  assert.equal(window.DebateRecordStorage.isValid({ reportValidity: () => { checks += 1; return true; } }), true);
  assert.equal(checks, 2);
  assert.equal(window.DebateRecordStorage.isValid({}), true);
});
