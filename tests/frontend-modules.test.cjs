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
  const dependencies = eventPageDependencies();
  const pages = window.DebateEventPages.createEventPages(dependencies);
  const target = dependencies.els.eventPageDetail;

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
  assert.match(target.innerHTML, /<h1>未來盃<\/h1>/);

  pages.renderEvent("測試盃", target);
  assert.match(target.innerHTML, /測試高中/);
  assert.match(target.innerHTML, /對手高中/);
  assert.match(target.innerHTML, /winner-score/);
  assert.match(target.innerHTML, /比賽結果/);
  assert.match(target.innerHTML, /<h1>測試盃<\/h1>/);
  const inlineTarget = { innerHTML: "" };
  pages.renderEvent("測試盃", inlineTarget);
  assert.match(inlineTarget.innerHTML, /<h2>測試盃<\/h2>/);
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
  assert.match(playerHtml, /<h1>林選手的辯論紀錄<\/h1>/);

  const schoolHtml = pages.renderEntityDetail(team, "schoolPageEntityDetail", true);
  assert.match(schoolHtml, /測試高中的完整紀錄/);
  assert.match(schoolHtml, /<h1>測試高中的完整紀錄<\/h1>/);
  assert.doesNotMatch(schoolHtml, /<p class="kicker">s1<\/p>/);
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
  const node = (value = "") => ({
    value, innerHTML: "", textContent: "", attributes: {},
    classList: { toggle() {} },
    setAttribute(name, content) { this.attributes[name] = content; },
  });
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
  assert.equal(els.overviewStatsChart.attributes.role, "region");
  assert.equal(els.overviewStatsChart.attributes.tabindex, "0");
  assert.match(els.overviewStatsChart.attributes["aria-label"], /可左右捲動查看月份/);
  assert.match(els.overviewStatsSummary.innerHTML, /不重複隊伍/);
  els.overviewStatsMetric.value = "teams";
  pages.renderOverviewStats();
  assert.match(els.overviewStatsChart.innerHTML, /每月參賽隊次年度趨勢折線圖/);
  assert.match(els.overviewStatsChart.attributes["aria-label"], /參賽隊次年度趨勢折線圖/);
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
  assert.doesNotMatch(els.searchResults.innerHTML, /<small>s1/);
  assert.match(els.searchResults.innerHTML, /別名：測試別名、測試 A 隊/);
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
  const saved = new Map();
  const storage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  assert.equal(JSON.stringify(window.DebateRecordStorage.load(storage, "records")), JSON.stringify({ ok: true, records: [] }));
  assert.equal(window.DebateRecordStorage.save(storage, "records", [{ id: "1" }]), true);
  assert.equal(saved.get("records"), '[{"id":"1"}]');
  assert.deepEqual(JSON.stringify(window.DebateRecordStorage.load(storage, "records")), JSON.stringify({ ok: true, records: [{ id: "1" }] }));

  for (const value of ["{broken", "{}", "[null]", "[[1]]"]) {
    assert.equal(window.DebateRecordStorage.load({ getItem: () => value }, "records").ok, false);
  }
  assert.equal(window.DebateRecordStorage.load({ getItem() { throw new Error("storage blocked"); } }, "records").ok, false);
  assert.equal(window.DebateRecordStorage.load(() => { throw new Error("storage unavailable"); }, "records").ok, false);
  assert.equal(window.DebateRecordStorage.save(() => { throw new Error("storage unavailable"); }, "records", []), false);
  assert.match(window.DebateRecordStorage.loadFailureMessage(), /為避免覆蓋原有紀錄.*請先不要清除瀏覽器網站資料/);

  const blockedStorage = { setItem() { throw new Error("quota exceeded"); } };
  assert.equal(window.DebateRecordStorage.save(blockedStorage, "records", [{ id: "2" }]), false);
  assert.match(window.DebateRecordStorage.saveFailureMessage(0), /這次變更未生效；表單內容仍保留/);
  assert.doesNotMatch(window.DebateRecordStorage.saveFailureMessage(0), /下載 CSV 備份/);
  assert.match(window.DebateRecordStorage.saveFailureMessage(1), /原有紀錄沒有變動.*下載 CSV 備份/);

  const localDate = {
    getFullYear: () => 2026,
    getMonth: () => 9,
    getDate: () => 5,
  };
  assert.equal(window.DebateRecordStorage.localDateStamp(localDate), "2026-10-05");

  const previousTimezone = process.env.TZ;
  process.env.TZ = "Asia/Taipei";
  try {
    assert.equal(window.DebateRecordStorage.localDateStamp(new Date("2026-10-04T23:32:00.000Z")), "2026-10-05");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }

  let checks = 0;
  assert.equal(window.DebateRecordStorage.isValid({ reportValidity: () => { checks += 1; return false; } }), false);
  assert.equal(window.DebateRecordStorage.isValid({ reportValidity: () => { checks += 1; return true; } }), true);
  assert.equal(checks, 2);
  assert.equal(window.DebateRecordStorage.isValid({}), true);
});

test("record CSV preserves commas, quotes, line breaks, and Unicode through export and import", () => {
  const window = loadFactory("js/record-csv.js");
  const rows = [["姓名", "備註"], ["林,同學", "說\"明\"\n第二行｜辯手回報"]];
  const serialized = window.DebateRecordCsv.serialize(rows);
  assert.match(serialized, /^\uFEFF/);
  assert.equal(JSON.stringify(window.DebateRecordCsv.parse(serialized)), JSON.stringify(rows));
});

test("shared record CSV parser rejects malformed quotes for both ballot formats", () => {
  const csvSource = fs.readFileSync(path.join(root, "js/record-csv.js"), "utf8");
  const teamSource = fs.readFileSync(path.join(root, "js/team-records.js"), "utf8");
  assert.match(teamSource, /parseTeamRecords\(await file\.text\(\)\)/);
  assert.match(teamSource, /RecordCsv\.parse\(text\)/);
  assert.match(teamSource, /RecordCsv\.serialize\(rows\)/);
  assert.doesNotMatch(teamSource, /function parseCsv\(/);
  assert.doesNotMatch(teamSource, /function csvCell\(/);
  const window = loadFactory("js/record-csv.js");
  assert.throws(() => window.DebateRecordCsv.parse('"欄位一","欄位二\n資料一,資料二'), /unterminated csv quote/);
  assert.match(csvSource, /invalid csv quoting/);
});

test("team CSV import preserves quoted multiline values and rejects malformed files", () => {
  const csvWindow = loadFactory("js/record-csv.js");
  const window = loadFactory("js/team-records.js", { DebateRecordCsv: csvWindow.DebateRecordCsv });
  const headers = ["盃賽", "此盃第幾場", "比賽日期", "隊伍名稱", "我方持方", "裁判姓名",
    ...["正", "反"].flatMap((side) => [1, 2, 3].flatMap((position) => ["申論", "質詢", "答辯"].map((metric) => `${side}${position}${metric}`))),
    "正方架構論點", "正方結辯", "反方架構論點", "反方結辯", "正方總分", "反方總分", "該單結果", "建立時間"];
  const fields = ["驗收盃,甲", "2", "2026-10-04", "隊伍「A」", "正", "裁判\n「一」",
    ...Array(18).fill(""), "8.5", "7", "8", "7.5", "", "", "", "2026-10-05T00:00:00.000Z"];
  const csv = csvWindow.DebateRecordCsv.serialize([headers, fields]);
  const [record] = window.DebateTeamRecords.parseTeamRecords(csv, { createId: () => "qa-id" });
  assert.equal(record.competition, "驗收盃,甲");
  assert.equal(record.teamName, "隊伍「A」");
  assert.equal(record.judge, "裁判\n「一」");
  assert.equal(record.affArgument, 8.5);
  assert.equal(record.createdAt, "2026-10-05T00:00:00.000Z");
  assert.throws(() => window.DebateTeamRecords.parseTeamRecords('"盃賽","隊伍名稱","正1申論\n驗收盃,"破損,0'), /invalid csv quoting|unterminated csv quote/);
});

test("personal and team CSV exports use the shared local calendar date", () => {
  const personalSource = fs.readFileSync(path.join(root, "js/personal-records.js"), "utf8");
  const teamSource = fs.readFileSync(path.join(root, "js/team-records.js"), "utf8");
  assert.match(personalSource, /我的辯論成績-\$\{window\.DebateRecordStorage\.localDateStamp\(\)\}\.csv/);
  assert.match(teamSource, /我的隊伍辯論裁單-\$\{window\.DebateRecordStorage\.localDateStamp\(\)\}\.csv/);
  assert.doesNotMatch(personalSource + teamSource, /toISOString\(\)\.slice\(0, 10\)/);
  assert.match(personalSource, /已下載 \$\{records\.length\} 張裁單，請妥善保存這份 CSV/);
  assert.match(teamSource, /已下載 \$\{records\.length\} 張隊伍裁單，請妥善保存這份 CSV/);
});

test("personal and team records do not invent dates for undated matches", () => {
  const markup = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const personalSource = fs.readFileSync(path.join(root, "js/personal-records.js"), "utf8");
  const teamSource = fs.readFileSync(path.join(root, "js/team-records.js"), "utf8");

  assert.ok(markup.indexOf("js/record-csv.js") < markup.indexOf("js/personal-records.js"));
  assert.match(personalSource, /matchDate: els\.matchDate\.value \|\| ""/);
  assert.match(teamSource, /matchDate: els\.matchDate\.value \|\| ""/);
  assert.doesNotMatch(personalSource + teamSource, /-07-01|eventDateByName/);
});

test("team match results require enough decided ballots and preserve tie states", () => {
  const window = loadFactory("js/team-records.js");
  const resolve = window.DebateTeamRecords.resolveResult;
  const pageSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ballot = (affirmative, negative) => ({ side: "正", affP1Speech: affirmative, negP1Speech: negative });

  assert.match(pageSource, /至少兩張可判定且勝票過半，才會判定整場勝負/);
  assert.equal(resolve([ballot(10, 8), ballot(9, 7)]).status, "待補裁單");
  assert.equal(resolve([ballot(10, 8), ballot(9, 9), ballot(8, 8)]).status, "裁判票不足以判定");
  assert.equal(resolve([ballot(10, 8), ballot(10, 8), ballot(8, 10)]).status, "本場獲勝");
  assert.equal(resolve([ballot(10, 8), ballot(8, 10), ballot(9, 9)]).status, "裁判票平手");
  assert.equal(resolve([ballot(9, 9), ballot(8, 8), {}]).status, "尚無可判定裁單");
  assert.equal(resolve([ballot(8, 10), ballot(8, 10), ballot(10, 8)]).status, "本場落敗");
});

test("team final save clears the draft while next-ballot save preserves judge focus", () => {
  const source = fs.readFileSync(path.join(root, "js/team-records.js"), "utf8");
  const start = source.indexOf("function addRecord(");
  const addRecord = source.slice(start, source.indexOf("function exportCsv(", start));
  assert.match(addRecord, /if \(continueEntry\) els\.judge\.focus\(\); else \{ clearForm\(\);[\s\S]*?teamSummaryTitle/);
});

test("team CSV imports skip repeated backup rows without collapsing distinct ballots", () => {
  const window = loadFactory("js/team-records.js");
  const uniqueImports = window.DebateTeamRecords.uniqueImportedRecords;
  const original = {
    id: "original", competition: "測試盃", matchNumber: 1, matchDate: "2026-01-01", teamName: "測試隊",
    side: "正", judge: "裁判甲", createdAt: "2026-01-01T01:00:00.000Z", affP1Speech: 10, negP1Speech: 8,
  };
  const sameCsvRow = { ...original, id: "new-import-id" };
  const anotherBallot = { ...original, id: "another-id", judge: "裁判乙", createdAt: "2026-01-01T01:05:00.000Z" };

  assert.deepEqual(Array.from(uniqueImports([original], [sameCsvRow, sameCsvRow, anotherBallot]), (item) => item.judge), ["裁判乙"]);
  assert.deepEqual(Array.from(uniqueImports([], [original, sameCsvRow, anotherBallot]), (item) => item.judge), ["裁判甲", "裁判乙"]);
});

test("personal record save feedback does not claim empty scores updated averages", () => {
  const source = fs.readFileSync(path.join(root, "js/personal-records.js"), "utf8");
  assert.match(source, /裁單已儲存；已填寫的分數會納入平均。/);
  assert.match(source, /這一張已暫存；已填寫的分數會納入平均/);
  assert.doesNotMatch(source, /平均分數已更新/);
});

test("router closes overlays and updates route title and current navigation", () => {
  let closeCount = 0;
  const noopClassList = { remove() {}, toggle() {}, contains: () => false };
  const window = { matchMedia: () => ({ matches: true }), scrollTo() {} };
  const makeNavigationButton = (view) => ({
    dataset: { view }, attributes: new Map(), classList: { toggle() {} },
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
  });
  const makeMenuButton = (view) => ({
    dataset: { menuView: view }, attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
  });
  const navButtons = ["home", "overview", "search", "archive", "reports"].map(makeNavigationButton);
  const menuButtons = ["home", "overview", "search", "archive", "reports"].map(makeMenuButton);
  const context = {
    window,
    document: { title: "", querySelectorAll: () => menuButtons },
    location: { hash: "#home" },
    history: { replaceState(_state, _title, hash) { context.location.hash = hash; }, pushState(_state, _title, hash) { context.location.hash = hash; } },
    requestAnimationFrame: (callback) => callback(),
    Map,
    Set,
    console,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/router.js"), "utf8"), context);
  const router = window.DebateRouter.createRouter({
    els: {
      views: [], navButtons, overviewView: { classList: noopClassList }, overviewEventsPanel: { classList: noopClassList },
      eventDetail: { innerHTML: "" }, eventPageDetail: {}, schoolPageDetail: {}, playerPageDetail: {}, topicPageDetail: {},
      globalSearch: { focus() {} },
    },
    getEvents: () => [{ name: "測試盃" }], getTopics: () => [{ topicId: "topic-1", topic: "測試題目" }], getUpcomingEvents: () => [], getKnownPlayers: () => ["林選手"],
    store: { entityById: new Map([["s1", { name: "測試高中" }]]) }, renderEvent() {}, renderUpcomingEvent() {}, renderEntityDetail() {}, renderPlayerDetail() {}, renderTopic() {},
    closeTransientUI: () => { closeCount += 1; },
  });
  router.showView("overview");
  assert.equal(closeCount, 1);
  assert.equal(context.location.hash, "#overview");
  assert.equal(context.document.title, "總覽｜公開辯論資訊網");
  assert.equal(navButtons[1].attributes.get("aria-current"), "page");
  assert.equal(menuButtons[1].attributes.get("aria-current"), "page");
  assert.equal(navButtons[0].attributes.has("aria-current"), false);

  router.showView("event/測試盃");
  assert.equal(context.document.title, "測試盃｜公開辯論資訊網");
  assert.equal(navButtons.some((button) => button.attributes.has("aria-current")), false, "detail pages should not mark a different main page current");

  router.showView("school/s1");
  assert.equal(context.document.title, "測試高中｜公開辯論資訊網");
  router.showView("player/林選手");
  assert.equal(context.document.title, "林選手｜公開辯論資訊網");
  router.showView("topic/topic-1");
  assert.equal(context.document.title, "測試題目｜公開辯論資訊網");

  router.showView("reports");
  assert.equal(context.document.title, "資料回報｜公開辯論資訊網");
  assert.equal(navButtons[4].attributes.get("aria-current"), "page");
  assert.equal(menuButtons[4].attributes.get("aria-current"), "page");
  assert.equal(navButtons[1].attributes.has("aria-current"), false);
});

test("chart expansion controls explain and enforce data availability", () => {
  const attributes = new Map([["aria-label", "放大能力雷達圖"]]);
  const button = {
    dataset: {},
    disabled: false,
    title: "放大圖表",
    getAttribute(name) { return attributes.get(name) || null; },
    setAttribute(name, value) { attributes.set(name, value); },
  };
  let expanded = false;
  const chart = {
    classList: { contains: (name) => name === "is-expanded" && expanded },
    querySelector: (selector) => selector === "[data-expand-chart]" ? button : null,
  };
  const content = { closest: (selector) => selector === ".record-chart" ? chart : null };
  const controls = loadFactory("js/interactions.js").DebateInteractions;

  controls.setChartExpansionAvailability(content, false, "資料不足，需三項分數");
  assert.equal(button.disabled, true);
  assert.equal(attributes.get("aria-label"), "資料不足，需三項分數");
  assert.equal(button.title, "資料不足，需三項分數");

  controls.setChartExpansionAvailability(content, true, "");
  assert.equal(button.disabled, false);
  assert.equal(attributes.get("aria-label"), "放大能力雷達圖");
  assert.equal(button.title, "放大圖表");

  expanded = true;
  controls.setChartExpansionAvailability(content, false, "資料不足，需三項分數");
  assert.equal(button.disabled, false, "expanded chart must keep its close control usable");
  assert.equal(button.dataset.chartAvailable, "false");
});

test("skip link focuses and scrolls to main content without changing route", () => {
  let focusOptions;
  let scrollOptions;
  const main = {
    focus(options) { focusOptions = options; },
    scrollIntoView(options) { scrollOptions = options; },
  };
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  const controls = loadFactory("js/interactions.js").DebateInteractions;

  controls.skipToMainContent(event, main, "auto");
  assert.equal(event.prevented, true, "skip link should not create an unknown router hash");
  assert.equal(focusOptions.preventScroll, true);
  assert.equal(scrollOptions.behavior, "auto");
  assert.equal(scrollOptions.block, "start");
});

test("chart data tables expose structured values and escape user content", () => {
  const window = loadFactory("js/chart-data-table.js");
  const markup = window.DebateChartDataTable.render({
    caption: "分數 <摘要>",
    headers: ["比賽日期", "申論"],
    rows: [["2026-10-05", "80.0%"], ["<script>", "—"]],
  });

  assert.match(markup, /<details class="chart-data">/);
  assert.match(markup, /<summary>以表格檢視圖表數據<\/summary>/);
  assert.match(markup, /<caption>分數 &lt;摘要&gt;<\/caption>/);
  assert.match(markup, /<th scope="col">比賽日期<\/th>/);
  assert.match(markup, /<th scope="row">2026-10-05<\/th>/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.equal(window.DebateChartDataTable.render({ headers: "bad", rows: [] }), "");
});

test("personal and team charts provide table views for plotted values", () => {
  const personalSource = fs.readFileSync(path.join(root, "js/personal-records.js"), "utf8");
  const teamSource = fs.readFileSync(path.join(root, "js/team-records.js"), "utf8");
  const markup = fs.readFileSync(path.join(root, "index.html"), "utf8");

  assert.match(markup, /js\/chart-data-table\.js\?v=20261005-chart-data-table1/);
  assert.match(personalSource, /caption: "能力雷達圖各項目平均分數比例"/);
  assert.match(personalSource, /caption: "依比賽日期排列的各項分數比例"/);
  assert.match(personalSource, /chronological\.map\(\(match\) => \[match\.matchDate/);
  assert.match(teamSource, /caption: "隊伍各項能力平均分數（滿分 20 分）"/);
  assert.match(teamSource, /window\.DebateChartDataTable\.render/);
});

test("modal chart dialog keeps Tab and Shift+Tab within its focusable controls", () => {
  let activeElement;
  const first = {
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [1],
    getAttribute: () => null,
    focus: () => { activeElement = first; },
  };
  const last = {
    tabIndex: 0,
    disabled: false,
    getClientRects: () => [1],
    getAttribute: () => null,
    focus: () => { activeElement = last; },
  };
  const dialog = {
    querySelectorAll: () => [first, last],
    contains: (element) => element === first || element === last,
  };
  const document = { get activeElement() { return activeElement; } };
  const controls = loadFactory("js/interactions.js", { document }).DebateInteractions;
  const keyEvent = (key, shiftKey = false) => ({ key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } });

  activeElement = last;
  const tab = keyEvent("Tab");
  assert.equal(controls.keepDialogTabFocus(dialog, tab), true);
  assert.equal(tab.prevented, true);
  assert.equal(activeElement, first);

  activeElement = first;
  const shiftTab = keyEvent("Tab", true);
  assert.equal(controls.keepDialogTabFocus(dialog, shiftTab), true);
  assert.equal(shiftTab.prevented, true);
  assert.equal(activeElement, last);

  const singleControlDialog = { querySelectorAll: () => [first], contains: (element) => element === first };
  activeElement = first;
  const singleControlTab = keyEvent("Tab");
  assert.equal(controls.keepDialogTabFocus(singleControlDialog, singleControlTab), true);
  assert.equal(activeElement, first, "a dialog with one control must keep focus on that control");

  const otherKey = keyEvent("Enter");
  assert.equal(controls.keepDialogTabFocus(dialog, otherKey), false);
  assert.equal(otherKey.prevented, false);

  activeElement = {};
  const outsideFocus = keyEvent("Tab");
  assert.equal(controls.keepDialogTabFocus(dialog, outsideFocus), false, "dialog handler should not intercept a key event dispatched outside it");
  assert.equal(outsideFocus.prevented, false);
});

test("chart expansion uses a labelled native modal dialog", () => {
  const markup = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "js/personal-records.js"), "utf8");
  assert.match(markup, /id="personalRadarChartTitle"/);
  assert.match(markup, /id="personalProgressChartTitle"/);
  assert.match(markup, /id="teamRadarChartTitle"/);
  assert.match(source, /createElement\("dialog"\)/);
  assert.match(source, /setAttribute\("aria-labelledby", title\.id\)/);
  assert.match(source, /\.showModal\(\)/);
  assert.match(source, /keepDialogTabFocus\(expandedChartDialog, event\)/);
  assert.match(source, /addEventListener\("cancel"/);
});
