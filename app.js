const { escapeHtml, formatDate, countBy, unique, normalize, groupByDate, createStore } = window.DebateCore;
const store = createStore(window.DEBATE_PUBLIC_DATA);
let records = store.records;
let honors = store.honors;
let topics = store.topics;
let events = [];

const els = {
  homeBrand: document.querySelector("#homeBrand"),
  navButtons: document.querySelectorAll("[data-view]"),
  views: document.querySelectorAll("[data-view-panel]"),
  statsBand: document.querySelector("#statsBand"),
  siteIntroductionEyebrow: document.querySelector("#siteIntroductionEyebrow"),
  siteIntroductionTitle: document.querySelector("#siteIntroductionTitle"),
  siteIntroductionParagraph1: document.querySelector("#siteIntroductionParagraph1"),
  siteIntroductionParagraph2: document.querySelector("#siteIntroductionParagraph2"),
  eventTimeline: document.querySelector("#eventTimeline"),
  recentEvents: document.querySelector("#recentEvents"),
  mobileRecentEvents: document.querySelector("#mobileRecentEvents"),
  mobileEventCount: document.querySelector("#mobileEventCount"),
  mobileMatchCount: document.querySelector("#mobileMatchCount"),
  mobileUpcomingEvents: document.querySelector("#mobileUpcomingEvents"),
  schoolLeaderboard: document.querySelector("#schoolLeaderboard"),
  mobileHonorRanking: document.querySelector("#mobileHonorRanking"),
  gamesLeaderboard: document.querySelector("#gamesLeaderboard"),
  winsLeaderboard: document.querySelector("#winsLeaderboard"),
  honorRangeToggle: document.querySelector("#honorRangeToggle"),
  honorLeaderboardTitle: document.querySelector("#honorLeaderboardTitle"),
  gamesLeaderboardTitle: document.querySelector("#gamesLeaderboardTitle"),
  winsLeaderboardTitle: document.querySelector("#winsLeaderboardTitle"),
  leaderboardBand: document.querySelector(".leaderboard-band"),
  mobileHonorTitle: document.querySelector("#mobileHonorTitle"),
  eventSearch: document.querySelector("#eventSearch"),
  eventYear: document.querySelector("#eventYear"),
  eventSortBy: document.querySelector("#eventSortBy"),
  eventSortDirection: document.querySelector("#eventSortDirection"),
  eventFinderMeta: document.querySelector("#eventFinderMeta"),
  eventFinderResults: document.querySelector("#eventFinderResults"),
  eventDetail: document.querySelector("#eventDetail"),
  eventPageDetail: document.querySelector("#eventPageDetail"),
  schoolPageDetail: document.querySelector("#schoolPageDetail"),
  playerPageDetail: document.querySelector("#playerPageDetail"),
  topicPageDetail: document.querySelector("#topicPageDetail"),
  overviewTabs: document.querySelectorAll("[data-overview-tab]"),
  overviewEventsPanel: document.querySelector("#overviewEventsPanel"),
  overviewView: document.querySelector("#overviewView"),
  overviewTeamsPanel: document.querySelector("#overviewTeamsPanel"),
  overviewTopicsPanel: document.querySelector("#overviewTopicsPanel"),
  overviewStatsPanel: document.querySelector("#overviewStatsPanel"),
  overviewStatsMetric: document.querySelector("#overviewStatsMetric"),
  overviewStatsYears: document.querySelector("#overviewStatsYears"),
  overviewStatsMeta: document.querySelector("#overviewStatsMeta"),
  overviewStatsSummary: document.querySelector("#overviewStatsSummary"),
  overviewStatsChart: document.querySelector("#overviewStatsChart"),
  overviewEventCount: document.querySelector("#overviewEventCount"),
  overviewTeamCount: document.querySelector("#overviewTeamCount"),
  overviewTopicCount: document.querySelector("#overviewTopicCount"),
  overviewTeamFilter: document.querySelector("#overviewTeamFilter"),
  overviewTeamSortBy: document.querySelector("#overviewTeamSortBy"),
  overviewTeamSortDirection: document.querySelector("#overviewTeamSortDirection"),
  overviewTeamMeta: document.querySelector("#overviewTeamMeta"),
  overviewTeamList: document.querySelector("#overviewTeamList"),
  overviewTopicFilter: document.querySelector("#overviewTopicFilter"),
  overviewTopicMeta: document.querySelector("#overviewTopicMeta"),
  overviewTopicList: document.querySelector("#overviewTopicList"),
  globalSearch: document.querySelector("#globalSearch"),
  clearSearch: document.querySelector("#clearSearch"),
  searchMeta: document.querySelector("#searchMeta"),
  searchResults: document.querySelector("#searchResults"),
  reportFormLink: document.querySelector("#reportFormLink"),
};

function eventSummaries() {
  const metadata = window.DEBATE_PUBLIC_DATA?.eventMetadata || {};
  const rosters = window.DEBATE_PUBLIC_DATA?.eventRosters || {};
  const names = unique([...Object.keys(rosters), ...records.map((item) => item.competitionName), ...honors.map((item) => item.competitionName), ...topics.map((item) => item.competitionName)]);
  return names.map((name) => {
    const eventRecords = records.filter((item) => item.competitionName === name);
    const eventHonors = honors.filter((item) => item.competitionName === name);
    const eventMetadata = metadata[name] || {};
    const dates = unique([eventMetadata.startDate, eventMetadata.endDate, ...eventRecords.map((item) => item.matchDate), ...eventHonors.map((item) => item.matchDate)]).sort();
    const eventTopics = topics.filter((item) => item.competitionName === name);
    const teamCount = unique(eventRecords.flatMap((item) => Object.values(item.teams || {})).filter(Boolean)).length;
    return { name, records: eventRecords, honors: eventHonors, topics: eventTopics, rosters: rosters[name] || [], dates, latestDate: dates.at(-1) || "", teamCount, metadata: metadata[name] || {} };
  }).sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name, "zh-Hant"));
}

function playerRosterEntries(playerName) {
  return Object.entries(window.DEBATE_PUBLIC_DATA?.eventRosters || {}).flatMap(([competitionName, entries]) =>
    entries.filter((roster) => [...(roster.leaders || []), ...(roster.players || [])].includes(playerName))
      .map((roster) => ({ ...roster, competitionName }))
  );
}

function matchScoreLabel(match) {
  const affirmative = match.scores?.affirmative;
  const negative = match.scores?.negative;
  if (affirmative === null || affirmative === undefined || affirmative === "" || negative === null || negative === undefined || negative === "") return "比分未公告";
  return `${affirmative}：${negative}`;
}



const { renderEvent, renderUpcomingEvent } = window.DebateEventPages.createEventPages({
  els,
  getEvents: () => events,
  store,
  escapeHtml,
  formatDate,
  groupByDate,
  normalize,
  matchScoreLabel,
  isSingleMatchHonor,
  isSingleMatchExcellent,
  entityPageLink,
  playerPageLink,
  renderEventHonors,
});

const { renderEntityDetail, renderPlayerDetail, renderTopic } = window.DebateEntityPages.createEntityPages({
  els,
  getEvents: () => events,
  records,
  honors,
  topics,
  store,
  escapeHtml,
  formatDate,
  unique,
  matchScoreLabel,
  matchResultForEntity,
  playerRosterEntries,
  entityPageLink,
  playerPageLink,
  honorSubject,
  honorDateLabel,
  isFullCourseBest,
  isFullCourseExcellent,
  isSingleMatchBest,
  isSingleMatchExcellent,
});

const { renderEventOptions, renderEventFinder, renderOverview, renderOverviewStats, renderOverviewTeams, renderOverviewTopics, showOverviewTab } = window.DebateOverviewPages.createOverviewPages({
  els,
  getEvents: () => events,
  getTopics: () => topics,
  getRecords: () => records,
  getHonors: () => honors,
  store,
  normalize,
  unique,
  formatDate,
  escapeHtml,
  matchResultForEntity,
});

const { renderSearch, getKnownPlayers } = window.DebateSearchPages.createSearchPages({
  els,
  getEvents: () => events,
  getRecords: () => records,
  getHonors: () => honors,
  getTopics: () => topics,
  getRosters: () => window.DEBATE_PUBLIC_DATA?.eventRosters || {},
  store,
  normalize,
  escapeHtml,
  unique,
  formatDate,
  matchScoreLabel,
  honorSubject,
  honorDateLabel,
  playerRosterEntries,
});

const { renderHome, renderLeaderboards, toggleHonorRange, toggleMobileHonorFilter, sortLeaderboard } = window.DebateHomePages.createHomePages({
  els,
  getEvents: () => events,
  getRecords: () => records,
  getHonors: () => honors,
  getUpcomingEvents: () => window.DEBATE_UPCOMING_EVENTS || [],
  getSiteContent: () => window.DEBATE_PUBLIC_DATA?.siteContent || {},
  store,
  escapeHtml,
  formatDate,
  unique,
  honorSubject,
  entityPageLink,
  playerPageLink,
  isSingleMatchBest,
  isFullCourseBest,
  isFullCourseExcellent,
  isSingleMatchExcellent,
});

const { showView } = window.DebateRouter.createRouter({
  els,
  getEvents: () => events,
  getTopics: () => topics,
  getUpcomingEvents: () => window.DEBATE_UPCOMING_EVENTS,
  getKnownPlayers,
  store,
  renderEvent,
  renderUpcomingEvent,
  renderEntityDetail,
  renderPlayerDetail,
  renderTopic,
  closeTransientUI: () => window.DebatePersonalRecords?.closeExpandedCharts(),
});

function matchResultForEntity(match, entityId) {
  const side = match.teamIds?.affirmative === entityId ? "affirmative" : "negative";
  const other = side === "affirmative" ? "negative" : "affirmative";
  const winnerId = store.entityForName(match.winner)?.code;
  if (winnerId) return winnerId === entityId ? "勝" : "敗";
  const ownScore = Number(match.scores?.[side]) || 0;
  const otherScore = Number(match.scores?.[other]) || 0;
  return ownScore > otherScore ? "勝" : ownScore < otherScore ? "敗" : "平";
}

function honorSubject(honor) {
  return honor.honorType === "player" ? honor.recipient : honor.recipient || honor.team;
}

function isSingleMatchBest(honor) {
  return ["單場最佳辯士", "最佳辯士", "單場最佳"].includes(honor.honorName?.trim());
}

function isFullCourseBest(honor) {
  return honor.honorLevel === "全程最佳辯士" || honor.honorName?.trim() === "全程最佳辯士";
}

function isFullCourseExcellent(honor) {
  return honor.honorLevel === "全程優秀辯士" || honor.honorName?.trim() === "全程優秀辯士";
}

function isSingleMatchExcellent(honor) {
  return ["單場優秀辯士", "單場優秀"].includes(honor.honorName?.trim());
}

function isSingleMatchHonor(honor) {
  return isSingleMatchBest(honor) || isSingleMatchExcellent(honor);
}

function entityPageLink(entityId, label, className = "") {
  if (!store.entityById.has(entityId)) return escapeHtml(label);
  return `<button type="button" class="inline-entity-link ${className}" data-entity-route="${escapeHtml(entityId)}">${escapeHtml(label)}</button>`;
}

function playerPageLink(name, className = "") {
  if (!name) return "";
  return `<button type="button" class="inline-entity-link ${className}" data-player-route="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
}

function eventDateContext(event) {
  const recordDates = unique((event.records || []).map((record) => record.matchDate).filter(Boolean)).sort();
  const hasEventRange = Boolean(event.metadata?.startDate || event.metadata?.endDate);
  const start = event.metadata?.startDate || recordDates[0] || "";
  const end = event.metadata?.endDate || recordDates.at(-1) || start;
  if (!start) return "榮譽日期未載明";
  const label = hasEventRange ? "賽期" : "比賽紀錄日期";
  return `${label} ${formatDate(start)}${end && end !== start ? `–${formatDate(end)}` : ""}`;
}

function honorDateLabel(honor, event) {
  return honor.matchDate ? `日期 ${formatDate(honor.matchDate)}` : eventDateContext(event);
}

function renderEventHonors(event) {
  const singleBestGroups = new Map();
  const singleExcellentGroups = new Map();
  const podiumHonors = [];
  const otherHonors = [];
  const fullCourseBestHonors = [];
  const fullCourseExcellentHonors = [];
  for (const honor of event.honors) {
    const honorName = honor.honorName?.trim() || "";
    if (honorName === "晉級") {
      // Advancement is tournament progress, not a public honor.
      continue;
    }
    const rank = /(?:^|組)冠軍$/.test(honorName) ? 0
      : /(?:^|組)亞軍$/.test(honorName) ? 1
        : /(?:^|組)季軍$/.test(honorName) ? 2
          : /(?:^|組)殿軍$/.test(honorName) ? 3 : -1;
    if (rank >= 0) {
      podiumHonors.push({ honor, rank });
      continue;
    }
    if (isFullCourseBest(honor)) {
      fullCourseBestHonors.push(honor);
      continue;
    }
    if (isFullCourseExcellent(honor)) {
      fullCourseExcellentHonors.push(honor);
      continue;
    }
    if (isSingleMatchBest(honor)) {
      const key = `${honor.recipient}\u0000${honor.team}`;
      const group = singleBestGroups.get(key) || { recipient: honor.recipient, team: honor.team, teamId: honor.teamId, count: 0, dateLabels: new Set() };
      group.count += 1;
      group.dateLabels.add(honorDateLabel(honor, event));
      singleBestGroups.set(key, group);
      continue;
    }
    if (isSingleMatchExcellent(honor)) {
      const key = `${honor.recipient}\u0000${honor.team}`;
      const group = singleExcellentGroups.get(key) || { recipient: honor.recipient, team: honor.team, teamId: honor.teamId, count: 0, dateLabels: new Set() };
      group.count += 1;
      group.dateLabels.add(honorDateLabel(honor, event));
      singleExcellentGroups.set(key, group);
      continue;
    }
    otherHonors.push(honor);
  }
  const podiumRows = podiumHonors
    .sort((a, b) => a.rank - b.rank)
    .map(({ honor }) => `<div class="event-honor"><span>${escapeHtml(honor.honorName)}</span><strong>${entityPageLink(honor.teamId, honorSubject(honor))}</strong>${honor.team ? `<small>${entityPageLink(honor.teamId, honor.team)}</small>` : ""}<small class="honor-date">${escapeHtml(honorDateLabel(honor, event))}</small></div>`)
    .join("");
  const bestRows = [...singleBestGroups.values()].map((group) => `
    <div class="event-honor">
      <span>單場最佳辯士</span>
      <strong>${playerPageLink(group.recipient)}${group.count > 1 ? `<span class="honor-count-badge" aria-label="獲獎 ${group.count} 次">*${group.count}</span>` : ""}</strong>
      ${group.team ? `<small>${entityPageLink(group.teamId, group.team)}</small>` : ""}
      <small class="honor-date">${escapeHtml([...group.dateLabels].join("、"))}</small>
    </div>`).join("");
  const fullCourseRows = fullCourseBestHonors.map((honor) => `<div class="event-honor"><span>${escapeHtml(honor.honorName)}</span><strong>${playerPageLink(honor.recipient)}</strong>${honor.team ? `<small>${entityPageLink(honor.teamId, honor.team)}</small>` : ""}<small class="honor-date">${escapeHtml(honorDateLabel(honor, event))}</small></div>`).join("");
  const fullCourseExcellentRows = fullCourseExcellentHonors.map((honor) => `<div class="event-honor"><span>${escapeHtml(honor.honorName)}</span><strong>${playerPageLink(honor.recipient)}</strong>${honor.team ? `<small>${entityPageLink(honor.teamId, honor.team)}</small>` : ""}<small class="honor-date">${escapeHtml(honorDateLabel(honor, event))}</small></div>`).join("");
  const singleExcellentRows = [...singleExcellentGroups.values()].map((group) => `<div class="event-honor"><span>單場優秀辯士</span><strong>${playerPageLink(group.recipient)}${group.count > 1 ? `<span class="honor-count-badge" aria-label="獲獎 ${group.count} 次">*${group.count}</span>` : ""}</strong>${group.team ? `<small>${entityPageLink(group.teamId, group.team)}</small>` : ""}<small class="honor-date">${escapeHtml([...group.dateLabels].join("、"))}</small></div>`).join("");
  const otherRows = otherHonors.map((honor) => `<div class="event-honor"><span>${escapeHtml(honor.honorName)}</span><strong>${honor.honorType === "player" ? playerPageLink(honor.recipient) : entityPageLink(honor.teamId, honorSubject(honor))}</strong>${honor.team ? `<small>${entityPageLink(honor.teamId, honor.team)}</small>` : ""}<small class="honor-date">${escapeHtml(honorDateLabel(honor, event))}</small></div>`).join("");
  return `${podiumRows ? `<h4 class="event-honor-section-title">賽事名次</h4>${podiumRows}` : ""}${fullCourseRows ? `<h4 class="event-honor-section-title">全程最佳辯士</h4>${fullCourseRows}` : ""}${fullCourseExcellentRows ? `<h4 class="event-honor-section-title">全程優秀辯士</h4>${fullCourseExcellentRows}` : ""}${bestRows ? `<h4 class="event-honor-section-title">單場最佳辯士</h4>${bestRows}` : ""}${singleExcellentRows ? `<h4 class="event-honor-section-title">單場優秀辯士</h4>${singleExcellentRows}` : ""}${otherRows ? `<h4 class="event-honor-section-title">其他公開榮譽</h4>${otherRows}` : ""}`;
}

function selectOverviewTeam(entityId) {
  selectEntity(entityId);
}

function setupReportLinks() {
  const config = window.DEBATE_SITE_CONFIG?.reports || {};
  if (config.formUrl) {
    els.reportFormLink.href = config.formUrl;
    return;
  }
  els.reportFormLink.removeAttribute("target");
  els.reportFormLink.removeAttribute("href");
  els.reportFormLink.classList.add("is-disabled");
  els.reportFormLink.textContent = "表單準備中";
  els.reportFormLink.setAttribute("aria-disabled", "true");
}

function selectEntity(entityId) {
  if (!store.entityById.has(entityId)) return;
  showView(`school/${encodeURIComponent(entityId)}`);
}

window.DebateInteractions.setupInteractions({ els, showView, renderEvent, renderSearch, renderEventFinder, renderOverviewStats, selectEntity, renderOverviewTeams, renderOverviewTopics, selectOverviewTeam, showOverviewTab });
els.honorRangeToggle?.addEventListener("click", toggleHonorRange);
document.querySelectorAll("[data-honor-filter]").forEach((button) => button.addEventListener("click", () => toggleMobileHonorFilter(button.dataset.honorFilter)));
document.querySelectorAll("[data-rank-sort]").forEach((button) => button.addEventListener("click", () => sortLeaderboard(button.dataset.rankSort)));


function renderAll() {
  if (!records.length && !honors.length) {
    if (window.DebateHomeSnapshot?.showUnavailable()) return;
    document.querySelector("main").innerHTML = `
      <section class="data-error page-shell">
        <span aria-hidden="true">📂</span>
        <h1>公開資料尚未載入</h1>
        <p>請確認 <code>data/public-data.js</code> 已上傳，並重新整理頁面。若剛更新 GitHub Pages，請稍候一分鐘後再試。</p>
      </section>`;
    return;
  }
  renderHome();
  renderEventOptions();
  renderOverview();
  window.DebatePersonalRecords?.init({ events: events.map((event) => ({ name: event.name })) });
  window.DebateTeamRecords?.init({ events: events.map((event) => ({ name: event.name })) });
  setupReportLinks();
  const initialQuery = new URLSearchParams(location.search).get("q") || "";
  els.globalSearch.value = initialQuery;
  renderSearch(initialQuery);
  const initialView = location.hash.slice(1);
  showView(initialQuery ? "search" : (/^(?:event|school|player|topic)\/.+/.test(initialView) || ["events", "overview", "search", "archive", "reports"].includes(initialView) ? initialView : "home"));
  if (initialView === "events") showOverviewTab("events");
  window.DebateHomeSnapshot?.save(window.DEBATE_PUBLIC_DATA?.generatedAt);
}

events = eventSummaries();
if (window.DebateHomeSnapshot?.restored) requestAnimationFrame(() => requestAnimationFrame(renderAll));
else renderAll();
