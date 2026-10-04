const { escapeHtml, formatDate, countBy, unique, normalize, groupByDate, createStore } = window.DebateCore;
const store = createStore(window.DEBATE_PUBLIC_DATA);
let records = store.records;
let honors = store.honors;
let topics = store.topics;
let events = [];
let selectedEntityId = "";
let honorRange = "recent";
let mobileHonorFilters = new Set(["team", "individual"]);
const leaderboardSortDirections = { gold: -1, silver: -1, bronze: -1, white: -1, fullCourse: -1, other: -1, totalHonors: -1 };
const leaderboardSortPriority = ["gold", "silver", "bronze", "white", "fullCourse", "other", "totalHonors"];
let leaderboardSortKey = "totalHonors";

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

function knownPlayers() {
  const rosterPeople = Object.values(window.DEBATE_PUBLIC_DATA?.eventRosters || {}).flatMap((entries) =>
    entries.flatMap((roster) => [...(roster.leaders || []), ...(roster.players || [])])
  );
  return unique([
    ...honors.filter((item) => item.honorType === "player").map((item) => item.recipient),
    ...records.flatMap((record) => Object.values(record.players || {}).flat()),
    ...rosterPeople,
  ].filter(Boolean));
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

const { showView } = window.DebateRouter.createRouter({
  els,
  getEvents: () => events,
  getTopics: () => topics,
  getUpcomingEvents: () => window.DEBATE_UPCOMING_EVENTS,
  getKnownPlayers: knownPlayers,
  store,
  renderEvent,
  renderUpcomingEvent,
  renderEntityDetail,
  renderPlayerDetail,
  renderTopic,
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

function renderStats() {
  const schools = unique(records.flatMap((item) => [item.teamIds?.affirmative || item.teams?.affirmative, item.teamIds?.negative || item.teams?.negative]));
  const players = unique(honors.filter((item) => item.honorType === "player").map((item) => item.recipient));
  const values = [
    ["📣 已收錄賽事", events.length],
    ["⚔️ 公開戰果", records.length],
    ["🏫 參賽學校／隊伍", schools.length],
    ["🏆 公開榮譽", honors.length + (players.length ? 0 : 0)],
  ];
  els.statsBand.innerHTML = values.map(([label, value]) => `<div class="stat-item"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderSiteIntroduction() {
  const content = window.DEBATE_PUBLIC_DATA?.siteContent || {};
  const fields = {
    siteIntroductionEyebrow: "introEyebrow",
    siteIntroductionTitle: "introTitle",
    siteIntroductionParagraph1: "introParagraph1",
    siteIntroductionParagraph2: "introParagraph2",
  };
  Object.entries(fields).forEach(([elementName, contentKey]) => {
    if (els[elementName] && content[contentKey]) els[elementName].textContent = content[contentKey];
  });
}

function renderRecentEvents() {
  const renderCard = (event, compact = false) => {
    const topicPreview = event.topics.slice(0, 2).map((item) => `<p class="event-card-topic"><span>辯題：</span>${escapeHtml(item.topic)}</p>`).join("");
    return `
      <button class="event-card" type="button" data-event-name="${escapeHtml(event.name)}">
        ${compact ? `<span class="event-card-time"><i class="event-time-point" aria-hidden="true"></i><span class="event-date">${escapeHtml(formatDate(event.latestDate))}</span></span>` : `<span class="event-date">${escapeHtml(formatDate(event.latestDate))}</span>`}
        <div class="event-card-body">
          <h3>${escapeHtml(event.name)}</h3>
          ${topicPreview ? `<div class="event-card-topics">${topicPreview}</div>` : ""}
        </div>
        ${renderEventPodium(event)}
        <span class="event-card-meta"><span>${event.teamCount} 隊</span><span>${event.records.length} 場</span><span>${event.honors.length} 榮譽</span></span>
      </button>`;
  };
  els.recentEvents.innerHTML = events.map(renderCard).join("");
  if (els.mobileEventCount) els.mobileEventCount.textContent = events.length;
  if (els.mobileMatchCount) els.mobileMatchCount.textContent = records.length;
  if (els.mobileRecentEvents) els.mobileRecentEvents.innerHTML = events.slice(0, 8).map((event) => renderCard(event, true)).join("");
}

function renderMobileUpcomingEvents() {
  if (!els.mobileUpcomingEvents) return;
  const upcoming = [...(window.DEBATE_UPCOMING_EVENTS || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const dateLabel = (event) => {
    const start = event.startDate.slice(5).replace("-", "/");
    const end = event.endDate.slice(5).replace("-", "/");
    return start === end ? start : `${start}–${end}`;
  };
  els.mobileUpcomingEvents.innerHTML = upcoming.map((event) => `
    <button type="button" class="mobile-upcoming-card" data-event-name="${escapeHtml(event.name)}" aria-label="開啟${escapeHtml(event.name)}賽事頁面">
      <span class="mobile-upcoming-date">${escapeHtml(dateLabel(event))}</span>
      <h3>${escapeHtml(event.name)}</h3>
      <span class="mobile-upcoming-location"><b>地點</b>${escapeHtml(event.location || "未提供")}</span>
    </button>`).join("");
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

function eventChampion(event) {
  const champion = event.honors.find((honor) => /(?:^|組)冠軍$/.test(honor.honorName?.trim() || ""));
  return champion ? honorSubject(champion) : "尚未收錄冠軍";
}

function renderEventPodium(event) {
  const rankDetails = [
    { label: "冠", honor: /(?:^|組)冠軍$/, className: "gold" },
    { label: "亞", honor: /(?:^|組)亞軍$/, className: "silver" },
    { label: "季", honor: /(?:^|組)季軍$/, className: "bronze" },
    { label: "殿", honor: /(?:^|組)殿軍$/, className: "white" },
  ];
  const honors = rankDetails.flatMap((rank) => event.honors
    .filter((honor) => rank.honor.test(honor.honorName?.trim() || ""))
    .map((honor) => ({ ...rank, recipient: honorSubject(honor) })));
  if (!honors.length) return "";
  return `<ul class="event-card-honors" aria-label="賽事名次">${honors.map((honor) => `<li><span class="trophy-medal ${honor.className}" aria-label="${honor.label}軍">${honor.label}</span><span class="event-honor-recipient">${escapeHtml(honor.recipient)}</span></li>`).join("")}</ul>`;
}

function renderTimeline() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const upcomingEvents = [...(window.DEBATE_UPCOMING_EVENTS || [])]
    .filter((event) => event.startDate >= today);
  const dateRange = (event) => {
    const start = event.startDate.slice(5).replace("-", "/");
    const end = event.endDate.slice(5).replace("-", "/");
    return start === end ? start : `${start}–${end}`;
  };
  const timelineItems = [
    ...upcomingEvents.map((event) => ({ type: "upcoming", event, sortDate: event.endDate || event.startDate })),
    ...events.map((event) => ({ type: "recorded", event, sortDate: event.latestDate || "" })),
  ].sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.event.name.localeCompare(b.event.name, "zh-Hant"));
  els.eventTimeline.innerHTML = timelineItems.map(({ type, event }) => {
    if (type === "upcoming") {
      return `
        <button class="timeline-node timeline-upcoming-node" type="button" data-event-name="${escapeHtml(event.name)}" aria-label="開啟賽事：${escapeHtml(event.name)}，${escapeHtml(dateRange(event))}，即將舉行">
          <span class="timeline-date">${escapeHtml(dateRange(event))}</span>
          <span class="timeline-dot" aria-hidden="true">✦</span>
          <span class="timeline-upcoming-label">即將舉行</span>
          <span class="timeline-name">${escapeHtml(event.name)}</span>
        </button>`;
    }
    return `
      <button class="timeline-node" type="button" data-event-name="${escapeHtml(event.name)}" aria-label="${escapeHtml(`${event.name}，${formatDate(event.latestDate)}，冠軍 ${eventChampion(event)}`)}">
        <span class="timeline-date">${escapeHtml(formatDate(event.latestDate))}</span>
        <span class="timeline-dot" aria-hidden="true"></span>
        <span class="timeline-name">${escapeHtml(event.name)}</span>
        <span class="timeline-tooltip" role="tooltip"><small>冠軍</small><strong>${escapeHtml(eventChampion(event))}</strong><em>點擊查看完整賽果</em></span>
      </button>`;
  }).join("");
}

function renderLeaderboards() {
  const schoolIds = new Set(store.entities.filter((entity) => entity.type === "s").map((entity) => entity.code));
  const eventYears = new Map(events.map((event) => [event.name, (event.latestDate || "").slice(0, 4)]));
  const years = [...new Set([...eventYears.values()].filter((year) => /^\d{4}$/.test(year)))].sort();
  const recentYears = new Set(years.slice(-2));
  const isInRange = (item) => honorRange === "all" || recentYears.has(eventYears.get(item.competitionName) || (item.matchDate || "").slice(0, 4));
  const visibleHonors = honors.filter(isInRange);
  const visibleRecords = records.filter(isInRange);
  const rankByHonor = (honor) => /(?:^|組)冠軍$/.test(honor.honorName?.trim() || "") ? "gold"
    : /(?:^|組)亞軍$/.test(honor.honorName?.trim() || "") ? "silver"
      : /(?:^|組)季軍$/.test(honor.honorName?.trim() || "") ? "bronze"
        : /(?:^|組)殿軍$/.test(honor.honorName?.trim() || "") ? "white" : "";
  const isCoursePlayerHonor = (honor) => isFullCourseBest(honor) || isFullCourseExcellent(honor);
  const schoolRows = new Map([...schoolIds].map((id) => [id, { id, gold: 0, silver: 0, bronze: 0, white: 0, fullCourse: 0, fullBest: 0, fullExcellent: 0, other: 0, singleBest: 0, otherAwards: 0, totalHonors: 0, games: 0, wins: 0 }]));
  visibleHonors.forEach((honor) => {
    const row = schoolRows.get(honor.teamId);
    if (!row) return;
    const rank = rankByHonor(honor);
    if (rank) {
      row[rank] += 1;
      row.totalHonors += 1;
    }
    else if (honor.honorType === "player" && isCoursePlayerHonor(honor)) {
      row.fullCourse += 1;
      row.totalHonors += 1;
      if (isFullCourseBest(honor)) row.fullBest += 1;
      else row.fullExcellent += 1;
    } else {
      row.other += 1;
      if (honor.honorType === "player" && isSingleMatchBest(honor)) row.singleBest += 1;
      else row.otherAwards += 1;
    }
  });
  const appearanceIds = visibleRecords.flatMap((record) => unique(Object.values(record.teamIds || {}).filter((id) => schoolIds.has(id))));
  appearanceIds.forEach((id) => { schoolRows.get(id).games += 1; });
  const winIds = visibleRecords.map((record) => {
    const winnerId = store.entityForName(record.winner)?.code;
    if (schoolIds.has(winnerId)) return winnerId;
    if (record.winner === "正方勝") return schoolIds.has(record.teamIds?.affirmative) ? record.teamIds.affirmative : "";
    if (record.winner === "反方勝") return schoolIds.has(record.teamIds?.negative) ? record.teamIds.negative : "";
    const affirmative = Number(record.scores?.affirmative) || 0;
    const negative = Number(record.scores?.negative) || 0;
    if (affirmative === negative) return "";
    const scoreWinner = affirmative > negative ? record.teamIds?.affirmative : record.teamIds?.negative;
    return schoolIds.has(scoreWinner) ? scoreWinner : "";
  });
  winIds.forEach((id) => { if (id && schoolRows.has(id)) schoolRows.get(id).wins += 1; });
  const allRows = [...schoolRows.values()];
  const rowHasAwards = (row) => row.totalHonors > 0;
  const teamAwardCount = (row) => row.gold + row.silver + row.bronze + row.white;
  const categoryCount = (row, category) => category === "team" ? teamAwardCount(row) : category === "individual" ? row.fullCourse : category === "otherOnly" ? row.other : category === "all" ? row.totalHonors : row[category];
  const orderedRows = allRows.filter(rowHasAwards).sort((a, b) => {
    for (const key of [leaderboardSortKey, ...leaderboardSortPriority.filter((item) => item !== leaderboardSortKey)]) {
      const difference = (a[key] - b[key]) * leaderboardSortDirections[key];
      if (difference) return difference;
    }
    return store.entityName(a.id, a.id).localeCompare(store.entityName(b.id, b.id), "zh-Hant");
  });
  const medalLabel = (key) => ({ gold: "冠", silver: "亞", bronze: "季", white: "殿" }[key]);
  const medalCell = (row, key) => `<td class="medal-cell"><span class="trophy-medal ${key}">${medalLabel(key)}</span><strong>${row[key]}</strong></td>`;
  const awardCell = (parts) => `<td class="award-symbol-cell">${parts.filter(([, , count]) => count > 0).map(([tone, label, count, title]) => `<span class="award-symbol-group" title="${title} ${count} 筆"><span class="trophy-medal ${tone}">${label}</span><strong>${count}</strong></span>`).join("") || "—"}</td>`;
  const topRows = orderedRows.slice(0, 10);
  els.schoolLeaderboard.innerHTML = topRows.map((row, index) => `<tr><td class="rank-position">${index + 1}</td><th scope="row" class="school-column">${entityPageLink(row.id, store.entityName(row.id, row.id))}</th>${medalCell(row, "gold")}${medalCell(row, "silver")}${medalCell(row, "bronze")}${medalCell(row, "white")}${awardCell([["gold", "佳", row.fullBest, "全程最佳辯士"], ["silver", "優", row.fullExcellent, "全程優秀辯士"]])}<td class="total-honors-cell"><strong>${row.totalHonors}</strong></td>${awardCell([["white", "佳", row.singleBest, "單場最佳辯士"], ["white", "獎", row.otherAwards, "其他榮譽"]])}</tr>`).join("") || '<tr><td class="olympic-empty" colspan="9">目前沒有符合條件的榮譽紀錄。</td></tr>';
  const mobileTotal = (row) => [...mobileHonorFilters].reduce((sum, category) => sum + categoryCount(row, category), 0);
  const mobileRows = allRows.filter((row) => mobileTotal(row) > 0).sort((a, b) => mobileTotal(b) - mobileTotal(a) || b.totalHonors - a.totalHonors || store.entityName(a.id, a.id).localeCompare(store.entityName(b.id, b.id), "zh-Hant")).slice(0, 10);
  const mobileAwardValue = (tone, label, count) => `<span class="mobile-award-value"><i class="trophy-medal ${tone}">${label}</i><b>${count}</b></span>`;
  const mobileIndividualAwards = (row) => [
    row.fullBest ? mobileAwardValue("gold", "佳", row.fullBest) : "",
    row.fullExcellent ? mobileAwardValue("silver", "優", row.fullExcellent) : "",
  ].join("");
  const mobileTeamAwards = (row) => `<span class="mobile-team-awards">${[
    row.gold ? mobileAwardValue("gold", "冠", row.gold) : "",
    row.silver ? mobileAwardValue("silver", "亞", row.silver) : "",
    row.bronze ? mobileAwardValue("bronze", "季", row.bronze) : "",
    row.white ? mobileAwardValue("white", "殿", row.white) : "",
  ].join("")}</span>`;
  const mobileCount = (row) => `${mobileHonorFilters.has("team") ? mobileTeamAwards(row) : ""}${mobileHonorFilters.has("individual") ? mobileIndividualAwards(row) : ""}${mobileHonorFilters.has("otherOnly") ? mobileAwardValue("white", "獎", row.other) : ""}<span class="mobile-total-value">${mobileTotal(row)}<small>項</small></span>`;
  if (els.mobileHonorRanking) els.mobileHonorRanking.innerHTML = mobileRows.map((row, index) => `<li><span class="mobile-honor-rank">${index + 1}</span><strong>${entityPageLink(row.id, store.entityName(row.id, row.id))}</strong><span class="mobile-honor-values">${mobileCount(row)}</span></li>`).join("") || '<li class="mobile-honor-empty">目前沒有符合選取類別的榮譽</li>';
  document.querySelectorAll("[data-honor-filter]").forEach((button) => {
    const filter = button.dataset.honorFilter;
    const active = mobileHonorFilters.has(filter);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-rank-sort]").forEach((button) => {
    const key = button.dataset.rankSort;
    const direction = leaderboardSortDirections[key];
    const marker = direction < 0 ? "↓" : "↑";
    const label = button.textContent.replace(/[↓↑]/g, "").trim();
    button.innerHTML = `${escapeHtml(label)} <span aria-hidden="true">${marker}</span>`;
    button.classList.toggle("is-sort-primary", key === leaderboardSortKey);
    button.setAttribute("aria-label", `${label}排序，${direction < 0 ? "降冪" : "升冪"}${key === leaderboardSortKey ? "，目前主要排序" : ""}`);
  });
  const rows = (key, unit) => allRows.filter((row) => row[key] > 0).sort((a, b) => b[key] - a[key] || store.entityName(a.id, a.id).localeCompare(store.entityName(b.id, b.id), "zh-Hant")).slice(0, 10).map((row) => `<li><div><strong>${escapeHtml(store.entityName(row.id, row.id))}</strong></div><span class="rank-count">${row[key]} ${unit}</span></li>`).join("");
  els.gamesLeaderboard.innerHTML = rows("games", "場");
  els.winsLeaderboard.innerHTML = rows("wins", "勝");
  const period = honorRange === "all" ? "全年度" : "近年度";
  const title = `${period}榮譽榜`;
  if (els.honorLeaderboardTitle) els.honorLeaderboardTitle.textContent = title;
  if (els.mobileHonorTitle) els.mobileHonorTitle.textContent = title;
  if (els.gamesLeaderboardTitle) els.gamesLeaderboardTitle.textContent = `${period}參賽場次`;
  if (els.winsLeaderboardTitle) els.winsLeaderboardTitle.textContent = `${period}總勝場`;
  if (els.leaderboardBand) els.leaderboardBand.dataset.range = honorRange;
  if (els.honorRangeToggle) {
    els.honorRangeToggle.textContent = honorRange === "all" ? "目前：全部年度　切換近年度" : "目前：近兩年　切換全年";
    els.honorRangeToggle.setAttribute("aria-pressed", String(honorRange === "all"));
    els.honorRangeToggle.classList.toggle("is-all-years", honorRange === "all");
  }
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

function renderSearch(query) {
  const needle = normalize(query);
  if (!needle) {
    els.searchMeta.textContent = "";
    els.searchResults.innerHTML = '<div class="search-empty"><div><span aria-hidden="true">🗂️</span><strong>從一個名字開始</strong><p>學校、隊伍或選手姓名都可以搜尋。</p></div></div>';
    return;
  }

  const allPlayers = knownPlayers();
  const matchedEntities = store.entities.filter((entity) => [entity.code, entity.name, ...(entity.aliases || "").split("|")].some((name) => normalize(name).includes(needle)));
  const matchedPlayers = allPlayers.filter((name) => normalize(name).includes(needle));
  const matchedTopics = topics.filter((item) => normalize(`${item.topic} ${item.explanation} ${item.competitionName}`).includes(needle));
  const entityIdSet = new Set(matchedEntities.map((entity) => entity.code));
  const playerSet = new Set(matchedPlayers);
  const matchedRecords = records.filter((item) => entityIdSet.has(item.teamIds?.affirmative) || entityIdSet.has(item.teamIds?.negative)).sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const matchedHonors = honors.filter((item) => entityIdSet.has(item.teamId) || playerSet.has(item.recipient)).sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const entityResultCount = matchedEntities.length + matchedPlayers.length;
  const resultCount = entityResultCount + matchedTopics.length;
  els.searchMeta.textContent = resultCount ? `找到 ${matchedEntities.length} 個學校／隊伍、${matchedPlayers.length} 位選手、${matchedTopics.length} 筆辯題` : `沒有找到「${query}」`;
  if (!entityIdSet.has(selectedEntityId)) selectedEntityId = "";

  const entitySection = entityResultCount ? `<section class="result-section"><h2>符合名稱</h2><div class="entity-grid">
    ${matchedEntities.map((entity) => {
      const games = records.filter((item) => item.teamIds?.affirmative === entity.code || item.teamIds?.negative === entity.code).length;
      const awards = honors.filter((item) => item.teamId === entity.code).length;
      const aliases = (entity.aliases || "").split("|").filter(Boolean);
      return `<button class="entity-card${selectedEntityId === entity.code ? " is-selected" : ""}" type="button" data-entity-id="${escapeHtml(entity.code)}"><h3>🏫 ${escapeHtml(entity.name)}</h3><p>${games} 場公開賽果 · ${awards} 筆相關榮譽</p><small>${escapeHtml(entity.code)}${aliases.length ? ` · 別名：${aliases.map(escapeHtml).join("、")}` : ""}</small></button>`;
    }).join("")}
    ${matchedPlayers.map((name) => {
      const personHonors = honors.filter((item) => item.honorType === "player" && item.recipient === name);
      const personRosters = playerRosterEntries(name);
      const teams = unique([...personHonors.map((item) => item.team), ...personRosters.map((roster) => roster.team)].filter(Boolean));
      return `<button type="button" class="entity-card player" data-player-route="${escapeHtml(name)}"><h3><span class="player-icon" aria-hidden="true">🎤</span>${escapeHtml(name)}</h3><p>${escapeHtml(teams.join("、") || "所屬學校未載明")} · ${personHonors.length} 筆榮譽${personRosters.length ? ` · ${personRosters.length} 筆隊伍名單` : ""}</p></button>`;
    }).join("")}
  </div></section>` : "";

  const topicMatches = [...new Map(matchedTopics.map((item) => [item.topicId, { ...item, entries: matchedTopics.filter((candidate) => candidate.topicId === item.topicId) }])).values()];
  const topicSection = topicMatches.length ? `<section class="result-section"><h2>符合辯題</h2><div class="overview-topic-list search-topic-list">${topicMatches.map((item) => `<article class="overview-topic-card"><span>${item.entries.length} 場賽事</span><button class="topic-title-link" type="button" data-topic-route="${escapeHtml(item.topicId)}">${escapeHtml(item.topic)}</button>${item.entries.map((entry) => `<button class="topic-event-link" type="button" data-event-route="${escapeHtml(entry.competitionName)}">${escapeHtml(entry.competitionName)} →</button>`).join("")}</article>`).join("")}</div></section>` : "";

  const selectedEntity = store.entityById.get(selectedEntityId);
  const entityDetail = selectedEntity ? renderEntityDetail(selectedEntity) : "";

  const histories = [
    ...matchedRecords.map((item) => ({ date: item.matchDate, title: `${item.teams?.affirmative} ${matchScoreLabel(item)} ${item.teams?.negative}`, meta: item.competitionName, badge: item.note || "比賽" })),
    ...matchedHonors.map((item) => ({ date: item.matchDate, dateLabel: honorDateLabel(item, events.find((event) => event.name === item.competitionName) || { records: [], dates: [], metadata: {} }), title: `${item.honorName}｜${honorSubject(item)}`, meta: `${item.competitionName}${item.team ? ` · ${item.team}` : ""}`, badge: "榮譽" })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30);

  const historySection = histories.length ? `<section class="result-section"><h2>最近紀錄</h2><div class="history-list">${histories.map((item) => `<article class="history-item"><span class="history-date">${escapeHtml(item.dateLabel || formatDate(item.date))}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.meta)}</p></div><span class="history-badge">${escapeHtml(item.badge)}</span></article>`).join("")}</div></section>` : "";
  els.searchResults.innerHTML = entitySection + topicSection + entityDetail + (selectedEntity ? "" : historySection) || '<div class="search-empty"><div><span aria-hidden="true">🤔</span><strong>目前沒有相符資料</strong><p>可以縮短關鍵字再試一次。</p></div></div>';
}

function selectEntity(entityId) {
  if (!store.entityById.has(entityId)) return;
  showView(`school/${encodeURIComponent(entityId)}`);
}

window.DebateInteractions.setupInteractions({ els, showView, renderEvent, renderSearch, renderEventFinder, renderOverviewStats, selectEntity, renderOverviewTeams, renderOverviewTopics, selectOverviewTeam, showOverviewTab });
els.honorRangeToggle?.addEventListener("click", () => {
  honorRange = honorRange === "all" ? "recent" : "all";
  renderLeaderboards();
});
document.querySelectorAll("[data-honor-filter]").forEach((button) => button.addEventListener("click", () => {
  const filter = button.dataset.honorFilter;
  if (mobileHonorFilters.has(filter)) mobileHonorFilters.delete(filter);
  else mobileHonorFilters.add(filter);
  renderLeaderboards();
}));
document.querySelectorAll("[data-rank-sort]").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.rankSort;
  if (key === leaderboardSortKey) leaderboardSortDirections[key] *= -1;
  leaderboardSortKey = key;
  renderLeaderboards();
}));


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
  renderSiteIntroduction();
  renderStats();
  renderTimeline();
  renderRecentEvents();
  renderMobileUpcomingEvents();
  renderLeaderboards();
  renderEventOptions();
  renderOverview();
  window.DebatePersonalRecords?.init({ events: events.map((event) => ({ name: event.name, date: event.latestDate })) });
  window.DebateTeamRecords?.init({ events: events.map((event) => ({ name: event.name, date: event.latestDate })) });
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
