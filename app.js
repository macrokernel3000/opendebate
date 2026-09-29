const { escapeHtml, formatDate, countBy, unique, normalize, groupByDate, createStore } = window.DebateCore;
const store = createStore(window.DEBATE_PUBLIC_DATA);
let records = store.records;
let honors = store.honors;
let topics = store.topics;
let events = [];
let selectedEntityId = "";
let selectedOverviewEntityId = "";
let honorRange = "recent";
let honorCategoryFilter = "all";
const leaderboardSortDirections = { gold: -1, silver: -1, bronze: -1, white: -1, fullCourse: -1, other: -1, totalHonors: -1 };
const leaderboardSortPriority = ["gold", "silver", "bronze", "white", "fullCourse", "other", "totalHonors"];
let leaderboardSortKey = "gold";

const els = {
  homeBrand: document.querySelector("#homeBrand"),
  navButtons: document.querySelectorAll("[data-view]"),
  views: document.querySelectorAll("[data-view-panel]"),
  statsBand: document.querySelector("#statsBand"),
  dataFreshness: document.querySelector("#dataFreshness"),
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
  eventFinderMeta: document.querySelector("#eventFinderMeta"),
  eventFinderResults: document.querySelector("#eventFinderResults"),
  eventDetail: document.querySelector("#eventDetail"),
  eventPageDetail: document.querySelector("#eventPageDetail"),
  schoolPageDetail: document.querySelector("#schoolPageDetail"),
  playerPageDetail: document.querySelector("#playerPageDetail"),
  overviewTabs: document.querySelectorAll("[data-overview-tab]"),
  overviewEventsPanel: document.querySelector("#overviewEventsPanel"),
  overviewView: document.querySelector("#overviewView"),
  overviewSchoolsPanel: document.querySelector("#overviewSchoolsPanel"),
  overviewTopicsPanel: document.querySelector("#overviewTopicsPanel"),
  overviewEventCount: document.querySelector("#overviewEventCount"),
  overviewSchoolCount: document.querySelector("#overviewSchoolCount"),
  overviewTopicCount: document.querySelector("#overviewTopicCount"),
  overviewSchoolFilter: document.querySelector("#overviewSchoolFilter"),
  overviewEntitySortBy: document.querySelector("#overviewEntitySortBy"),
  overviewEntitySortDirection: document.querySelector("#overviewEntitySortDirection"),
  overviewSchoolMeta: document.querySelector("#overviewSchoolMeta"),
  overviewSchoolGrid: document.querySelector("#overviewSchoolGrid"),
  overviewSchoolDetail: document.querySelector("#overviewSchoolDetail"),
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
  const names = unique([...records.map((item) => item.competitionName), ...honors.map((item) => item.competitionName), ...topics.map((item) => item.competitionName)]);
  return names.map((name) => {
    const eventRecords = records.filter((item) => item.competitionName === name);
    const eventHonors = honors.filter((item) => item.competitionName === name);
    const eventMetadata = metadata[name] || {};
    const dates = unique([eventMetadata.startDate, eventMetadata.endDate, ...eventRecords.map((item) => item.matchDate), ...eventHonors.map((item) => item.matchDate)]).sort();
    const eventTopics = topics.filter((item) => item.competitionName === name);
    const teamCount = unique(eventRecords.flatMap((item) => Object.values(item.teams || {})).filter(Boolean)).length;
    return { name, records: eventRecords, honors: eventHonors, topics: eventTopics, dates, latestDate: dates.at(-1) || "", teamCount, metadata: metadata[name] || {} };
  }).sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name, "zh-Hant"));
}

function knownPlayers() {
  return unique([
    ...honors.filter((item) => item.honorType === "player").map((item) => item.recipient),
    ...records.flatMap((record) => Object.values(record.players || {}).flat()),
  ].filter(Boolean));
}



let hasRenderedRoute = false;
function showView(name) {
  const requested = name === "events" ? "overview" : name;
  const eventRoute = requested.match(/^event\/(.+)$/);
  const schoolRoute = requested.match(/^school\/(.+)$/);
  const playerRoute = requested.match(/^player\/(.+)$/);
  let eventName = "";
  let schoolId = "";
  let playerName = "";
  if (eventRoute) {
    try { eventName = decodeURIComponent(eventRoute[1]); } catch { eventName = ""; }
    if (!events.some((event) => event.name === eventName)) eventName = "";
  }
  if (schoolRoute) {
    try { schoolId = decodeURIComponent(schoolRoute[1]); } catch { schoolId = ""; }
    if (!store.entityById.has(schoolId)) schoolId = "";
  }
  if (playerRoute) {
    try { playerName = decodeURIComponent(playerRoute[1]); } catch { playerName = ""; }
    if (!knownPlayers().includes(playerName)) playerName = "";
  }
  const target = eventName ? "event-page" : schoolId ? "school-page" : playerName ? "player-page" : (["home", "overview", "search", "archive", "reports"].includes(requested) ? requested : "home");
  els.views.forEach((view) => view.classList.toggle("is-hidden", view.dataset.viewPanel !== target));
  els.navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.view === target));
  els.overviewView.classList.remove("is-event-open");
  els.overviewEventsPanel.classList.remove("is-event-open");
  if (eventName) renderEvent(eventName, els.eventPageDetail);
  if (schoolId) els.schoolPageDetail.innerHTML = renderEntityDetail(store.entityById.get(schoolId), "schoolPageEntityDetail", true);
  if (playerName) els.playerPageDetail.innerHTML = renderPlayerDetail(playerName);
  if (target === "overview") els.eventDetail.innerHTML = "";
  const routeHash = eventName ? `#event/${encodeURIComponent(eventName)}` : schoolId ? `#school/${encodeURIComponent(schoolId)}` : playerName ? `#player/${encodeURIComponent(playerName)}` : `#${target}`;
  if (location.hash !== routeHash) {
    if (!hasRenderedRoute) history.replaceState(null, "", routeHash);
    else history.pushState({ from: location.hash || "#home" }, "", routeHash);
  }
  hasRenderedRoute = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (target === "search") requestAnimationFrame(() => els.globalSearch.focus());
}

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

function renderDataFreshness() {
  if (!els.dataFreshness) return;
  const generatedAt = window.DEBATE_PUBLIC_DATA?.generatedAt || "";
  const [, month, day] = generatedAt.slice(0, 10).split("-");
  const dateLabel = month && day ? `${Number(month)} 月 ${Number(day)} 日` : "日期未載明";
  els.dataFreshness.innerHTML = `<strong>資料狀態</strong><span>上次修改是 ${escapeHtml(dateLabel)}，目前有 ${events.length} 個比賽的訊息</span>`;
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
    <article class="mobile-upcoming-card">
      <span class="mobile-upcoming-date">${escapeHtml(dateLabel(event))}</span>
      <h3>${escapeHtml(event.name)}</h3>
      <p>${escapeHtml(event.location || "地點未提供")}</p>
      <small><b>辯題：</b>${escapeHtml(event.topic || "未提供")}</small>
    </article>`).join("");
}

function honorSubject(honor) {
  return honor.honorType === "player" ? honor.recipient : honor.recipient || honor.team;
}

function isSingleMatchBest(honor) {
  return ["單場最佳辯士", "最佳辯士", "單場最佳"].includes(honor.honorName?.trim());
}

function isFullCourseBest(honor) {
  return honor.honorName?.trim() === "全程最佳辯士";
}

function isFullCourseExcellent(honor) {
  return honor.honorName?.trim() === "全程優秀辯士";
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
  const progressions = [];
  const fullCourseBestHonors = [];
  const fullCourseExcellentHonors = [];
  for (const honor of event.honors) {
    const honorName = honor.honorName?.trim() || "";
    if (honorName === "晉級") {
      progressions.push(honor);
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
  const fullCourseRows = fullCourseBestHonors.map((honor) => `<div class="event-honor"><span>全程最佳辯士</span><strong>${playerPageLink(honor.recipient)}</strong>${honor.team ? `<small>${entityPageLink(honor.teamId, honor.team)}</small>` : ""}<small class="honor-date">${escapeHtml(honorDateLabel(honor, event))}</small></div>`).join("");
  const fullCourseExcellentRows = fullCourseExcellentHonors.map((honor) => `<div class="event-honor"><span>全程優秀辯士</span><strong>${playerPageLink(honor.recipient)}</strong>${honor.team ? `<small>${entityPageLink(honor.teamId, honor.team)}</small>` : ""}<small class="honor-date">${escapeHtml(honorDateLabel(honor, event))}</small></div>`).join("");
  const singleExcellentRows = [...singleExcellentGroups.values()].map((group) => `<div class="event-honor"><span>單場優秀辯士</span><strong>${playerPageLink(group.recipient)}${group.count > 1 ? `<span class="honor-count-badge" aria-label="獲獎 ${group.count} 次">*${group.count}</span>` : ""}</strong>${group.team ? `<small>${entityPageLink(group.teamId, group.team)}</small>` : ""}<small class="honor-date">${escapeHtml([...group.dateLabels].join("、"))}</small></div>`).join("");
  const otherRows = otherHonors.map((honor) => `<div class="event-honor"><span>${escapeHtml(honor.honorName)}</span><strong>${honor.honorType === "player" ? playerPageLink(honor.recipient) : entityPageLink(honor.teamId, honorSubject(honor))}</strong>${honor.team ? `<small>${entityPageLink(honor.teamId, honor.team)}</small>` : ""}<small class="honor-date">${escapeHtml(honorDateLabel(honor, event))}</small></div>`).join("");
  const progressionRows = progressions.map((honor) => `<div class="event-honor"><span>晉級</span><strong>${entityPageLink(honor.teamId, honor.recipient)}</strong>${honor.note ? `<small>${escapeHtml(honor.note)}</small>` : ""}<small class="honor-date">${escapeHtml(honorDateLabel(honor, event))}</small></div>`).join("");
  return `${podiumRows ? `<h4 class="event-honor-section-title">賽事名次</h4>${podiumRows}` : ""}${progressionRows ? `<h4 class="event-honor-section-title">晉級隊伍</h4>${progressionRows}` : ""}${fullCourseRows ? `<h4 class="event-honor-section-title">全程最佳辯士</h4>${fullCourseRows}` : ""}${fullCourseExcellentRows ? `<h4 class="event-honor-section-title">全程優秀辯士</h4>${fullCourseExcellentRows}` : ""}${bestRows ? `<h4 class="event-honor-section-title">單場最佳辯士</h4>${bestRows}` : ""}${singleExcellentRows ? `<h4 class="event-honor-section-title">單場優秀辯士</h4>${singleExcellentRows}` : ""}${otherRows ? `<h4 class="event-honor-section-title">其他公開榮譽</h4>${otherRows}` : ""}`;
}

function eventRouteLink(name) {
  return `<button type="button" class="entity-event-link" data-event-route="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
}

function renderPlayerDetail(playerName) {
  const playerHonors = honors.filter((honor) => honor.honorType === "player" && honor.recipient === playerName)
    .sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "") || a.competitionName.localeCompare(b.competitionName, "zh-Hant"));
  const playerMatches = records.filter((record) => Object.values(record.players || {}).some((names) => names.includes(playerName)))
    .sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const affiliations = unique(playerHonors.map((honor) => honor.team).filter(Boolean));
  const honorRows = playerHonors.map((honor) => {
    const event = events.find((item) => item.name === honor.competitionName) || { records: [], dates: [], metadata: {} };
    return `<article class="entity-match"><span class="history-date">${escapeHtml(honorDateLabel(honor, event))}</span><div><strong>${escapeHtml(honor.honorName)}</strong><p>${eventRouteLink(honor.competitionName)}${honor.team ? ` · ${entityPageLink(honor.teamId, honor.team)}` : " · 所屬隊伍未載明"}${honor.note ? ` · ${escapeHtml(honor.note)}` : ""}</p></div></article>`;
  }).join("");
  const matchRows = playerMatches.map((record) => `<article class="entity-match"><span class="history-date">${escapeHtml(formatDate(record.matchDate))}</span><div><strong>${entityPageLink(record.teamIds?.affirmative, record.teams?.affirmative)} ${record.scores?.affirmative ?? 0}：${record.scores?.negative ?? 0} ${entityPageLink(record.teamIds?.negative, record.teams?.negative)}</strong><p>${eventRouteLink(record.competitionName)} · 時段 ${escapeHtml(record.period || "-")} · 會場 ${escapeHtml(record.venue || "-")}</p></div></article>`).join("");
  return `<section class="result-section entity-detail"><button class="event-back-button" type="button" data-detail-back>← 返回上一頁</button><div class="entity-detail-heading"><div><p class="kicker">選手紀錄</p><h2>${escapeHtml(playerName)}的辯論紀錄</h2></div><div><strong>${playerHonors.length}</strong> 項個人榮譽 · <strong>${playerMatches.length}</strong> 場登場紀錄</div></div><p class="player-affiliations">${affiliations.length ? affiliations.map((team) => entityPageLink(store.entityForName(team)?.code, team)).join("、") : "部分原始榮譽未載明所屬隊伍"}</p><h3>公開榮譽</h3><div class="history-list">${honorRows || "<p>目前沒有個人公開榮譽。</p>"}</div><h3>登場紀錄</h3><div class="history-list">${matchRows || "<p>目前沒有逐場選手名單；此頁僅列出可查證的個人榮譽。</p>"}</div></section>`;
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
  const timelineEvents = [...events].sort((a, b) => (b.latestDate || "").localeCompare(a.latestDate || ""));
  els.eventTimeline.innerHTML = timelineEvents.map((event, index) => `
    <button class="timeline-node" type="button" data-event-name="${escapeHtml(event.name)}" aria-label="${escapeHtml(`${event.name}，${formatDate(event.latestDate)}，冠軍 ${eventChampion(event)}`)}">
      <span class="timeline-date">${escapeHtml(formatDate(event.latestDate))}</span>
      <span class="timeline-dot" aria-hidden="true">${index === 0 ? "★" : ""}</span>
      <span class="timeline-name">${escapeHtml(event.name)}</span>
      <span class="timeline-tooltip" role="tooltip"><small>冠軍</small><strong>${escapeHtml(eventChampion(event))}</strong><em>點擊查看完整賽果</em></span>
    </button>`).join("");
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
    row.totalHonors += 1;
    const rank = rankByHonor(honor);
    if (rank) row[rank] += 1;
    else if (honor.honorType === "player" && isCoursePlayerHonor(honor)) {
      row.fullCourse += 1;
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
  const rowHasAwards = (row) => row.gold + row.silver + row.bronze + row.white + row.fullCourse + row.other > 0;
  const rowHasCategory = (row) => honorCategoryFilter === "all" ? rowHasAwards(row) : row[honorCategoryFilter] > 0;
  const orderedRows = allRows.filter(rowHasCategory).sort((a, b) => {
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
  els.schoolLeaderboard.innerHTML = topRows.map((row, index) => `<tr><td class="rank-position">${index + 1}</td><th scope="row" class="school-column">${escapeHtml(store.entityName(row.id, row.id))}</th>${medalCell(row, "gold")}${medalCell(row, "silver")}${medalCell(row, "bronze")}${medalCell(row, "white")}${awardCell([["gold", "佳", row.fullBest, "全程最佳辯士"], ["silver", "優", row.fullExcellent, "全程優秀辯士"]])}${awardCell([["white", "佳", row.singleBest, "單場最佳辯士"], ["white", "獎", row.otherAwards, "其他榮譽"]])}<td class="total-honors-cell"><strong>${row.totalHonors}</strong></td></tr>`).join("") || '<tr><td class="olympic-empty" colspan="9">目前沒有符合條件的榮譽紀錄。</td></tr>';
  document.querySelectorAll("[data-rank-sort]").forEach((button) => {
    const key = button.dataset.rankSort;
    const direction = leaderboardSortDirections[key];
    const marker = direction < 0 ? "↓" : "↑";
    const label = button.textContent.replace(/[↓↑]/g, "").trim();
    button.innerHTML = `${escapeHtml(label)} <span aria-hidden="true">${marker}</span>`;
    button.classList.toggle("is-sort-primary", key === leaderboardSortKey);
    button.setAttribute("aria-label", `${label}排序，${direction < 0 ? "降冪" : "升冪"}${key === leaderboardSortKey ? "，目前主要排序" : ""}`);
  });
  const rows = (key, unit) => allRows.filter((row) => row[key] > 0).sort((a, b) => b[key] - a[key] || store.entityName(a.id, a.id).localeCompare(store.entityName(b.id, b.id), "zh-Hant")).slice(0, 10).map((row, index) => `<li><div><strong>${escapeHtml(store.entityName(row.id, row.id))}</strong></div><span class="rank-count">${index + 1} · ${row[key]} ${unit}</span></li>`).join("");
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

function renderEventOptions() {
  const years = unique(events.map((event) => event.latestDate.slice(0, 4))).sort((a, b) => b.localeCompare(a));
  els.eventYear.innerHTML = '<option value="">全部年份</option>' + years.map((year) => `<option value="${year}">${year} 年</option>`).join("");
  renderEventFinder();
}

function renderEventFinder() {
  const needle = normalize(els.eventSearch.value);
  const year = els.eventYear.value;
  const filtered = events.filter((event) => {
    const matchesYear = !year || event.latestDate.startsWith(year);
    const topicText = event.topics.flatMap((item) => [item.topic, item.explanation]).join(" ");
    return matchesYear && (!needle || normalize(`${event.name} ${topicText}`).includes(needle));
  });
  const isMobileTimeline = window.matchMedia("(max-width: 640px)").matches;
  const visibleEvents = isMobileTimeline
    ? [...filtered].sort((a, b) => (b.latestDate || "").localeCompare(a.latestDate || "") || a.name.localeCompare(b.name, "zh-Hant"))
    : filtered;
  els.eventFinderMeta.textContent = `找到 ${visibleEvents.length} 個賽事`;
  let previousYear = null;
  const timelineCards = visibleEvents.map((event, index) => {
    const eventYear = event.latestDate?.slice(0, 4) || "年份未載明";
    const yearMarker = isMobileTimeline && eventYear !== previousYear ? `<div class="event-year-divider"><span>${escapeHtml(eventYear)}${eventYear === "年份未載明" ? "" : " 年"}</span></div>` : "";
    previousYear = eventYear;
    const dateLabel = isMobileTimeline ? (event.latestDate ? formatDate(event.latestDate) : "日期未載明") : eventYear;
    const side = index % 2 === 0 ? "left" : "right";
    return `${yearMarker}<button class="event-result-card" type="button" data-event-name="${escapeHtml(event.name)}" data-timeline-side="${side}">
      <span class="event-result-year">${escapeHtml(dateLabel)}</span>
      <strong>${escapeHtml(event.name)}</strong>
      <small>${event.teamCount} 隊 · ${event.records.length} 場 · ${event.honors.length} 榮譽</small>
    </button>`;
  }).join("");
  els.eventFinderResults.innerHTML = timelineCards || '<div class="event-finder-empty">沒有符合的賽事，請縮短關鍵字或切換年份。</div>';
}

function renderEvent(name, target = els.eventDetail) {
  const event = events.find((item) => item.name === name);
  if (!event) return;
  const singleHonorsFor = (match) => {
    const teamNames = Object.values(match.teams || {});
    const grouped = new Map();
    event.honors.filter((honor) => {
      if (!isSingleMatchHonor(honor) || honor.matchDate !== match.matchDate) return false;
      if (honor.period && Number(honor.period) !== Number(match.period)) return false;
      if (honor.team && !teamNames.includes(honor.team)) return false;
      if (honor.note) {
        const keyedNote = normalize(honor.note);
        if (teamNames.every((team) => keyedNote.includes(normalize(team)))) {
          const pairMatches = event.records.filter((record) => {
            if (record.matchDate !== honor.matchDate) return false;
            if (honor.period && Number(record.period) !== Number(honor.period)) return false;
            return teamNames.every((team) => Object.values(record.teams || {}).includes(team));
          });
          return pairMatches.length === 1 && pairMatches[0] === match;
        }
        if (!match.note || !keyedNote.includes(normalize(match.note))) return false;
      }
      if (!honor.team) return false;
      const candidates = event.records.filter((record) => {
        if (record.matchDate !== honor.matchDate) return false;
        if (honor.period && Number(record.period) !== Number(honor.period)) return false;
        return Object.values(record.teams || {}).includes(honor.team);
      });
      return candidates.length === 1 && candidates[0] === match;
    }).forEach((honor) => {
      const label = isSingleMatchExcellent(honor) ? "單場優秀辯士" : "單場最佳辯士";
      const key = `${label}\u0000${honor.recipient}`;
      const group = grouped.get(key) || { label, recipient: honor.recipient };
      grouped.set(key, group);
    });
    return [...grouped.values()];
  };
  const grouped = groupByDate([...event.records].sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "") || Number(a.period) - Number(b.period) || Number(a.venue) - Number(b.venue)));
  const matchDays = Object.entries(grouped).map(([date, matches]) => `
    <section class="match-day">
      <h3 class="match-day-title"><span aria-hidden="true">📅</span>${escapeHtml(formatDate(date))}</h3>
      <div class="match-list">${matches.map((match) => {
        const a = Number(match.scores?.affirmative) || 0;
        const n = Number(match.scores?.negative) || 0;
        const singleHonors = singleHonorsFor(match);
        return `<div class="match-row">
          <span class="match-place">時段 ${escapeHtml(match.period || "-")}<br>會場 ${escapeHtml(match.venue || "-")}${match.groupName ? `<small class="match-group-name" aria-label="循環／分組：${escapeHtml(match.groupName)}">↻ ${escapeHtml(match.groupName)}</small>` : ""}</span>
          <span class="team-name">${entityPageLink(match.teamIds?.affirmative, match.teams?.affirmative, "team-name-link")}</span>
          <span class="match-score"><span class="${a > n ? "winner-score" : ""}">${a}</span><span>:</span><span class="${n > a ? "winner-score" : ""}">${n}</span></span>
          <span class="team-name negative">${entityPageLink(match.teamIds?.negative, match.teams?.negative, "team-name-link")}</span>
          <span class="match-note">${escapeHtml(match.note || "公開賽果")}${singleHonors.map((honor) => `<span class="match-single-best"><b>${honor.label}</b>${playerPageLink(honor.recipient)}</span>`).join("")}</span>
        </div>`;
      }).join("")}</div>
    </section>`).join("");
  const eventHonors = [...event.honors].sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const metadata = event.metadata || {};
  const metadataSection = metadata.organizer || metadata.location || metadata.note ? `<div class="event-metadata"><span>賽事資訊</span>${metadata.organizer ? `<strong>主辦單位：${escapeHtml(metadata.organizer)}</strong>` : ""}${metadata.location ? `<strong>舉辦地點：${escapeHtml(metadata.location)}</strong>` : ""}${metadata.note ? `<small>${escapeHtml(metadata.note)}</small>` : ""}</div>` : "";
  const topicSection = event.topics.length ? `<section class="event-topics"><div class="subheading-row"><h3 class="subheading">💡 比賽辯題</h3><span>${event.topics.length} 題</span></div>${event.topics.map((item, index) => `<article class="topic-card"><span>辯題 ${index + 1}</span><strong>${escapeHtml(item.topic)}</strong></article>`).join("")}</section>` : "";
  target.innerHTML = `
    <button class="event-back-button" type="button" data-detail-back>← 返回上一頁</button>
    <div class="event-summary">
      <div><h2>${escapeHtml(event.name)}</h2><p>${event.metadata.startDate && event.metadata.endDate ? `${formatDate(event.metadata.startDate)}–${formatDate(event.metadata.endDate)}` : event.dates.map(formatDate).join("、")}</p></div>
      <div class="event-summary-count"><span class="count-chip">${event.teamCount} 隊</span><span class="count-chip">${event.records.length} 場</span><span class="count-chip">${event.honors.length} 榮譽</span></div>
    </div>
    ${topicSection}
    ${metadataSection}
    <div class="event-content-grid">
      <div class="event-scores"><h3 class="subheading">比賽結果</h3>${matchDays || '<div class="search-empty"><p>尚無公開戰果</p></div>'}</div>
      <aside class="event-honors"><h3 class="subheading">🏆 公開榮譽</h3>${eventHonors.length ? renderEventHonors(event) : "<p>尚無公開榮譽。</p>"}</aside>
    </div>`;
}

function renderOverview() {
  const teams = store.entities;
  els.overviewEventCount.textContent = events.length;
  els.overviewSchoolCount.textContent = teams.length;
  els.overviewTopicCount.textContent = topics.length;
  renderOverviewSchools();
  renderOverviewTopics();
}

function renderOverviewTopics() {
  const needle = normalize(els.overviewTopicFilter.value);
  const filteredTopics = topics.filter((item) => !needle || normalize(`${item.topic} ${item.explanation} ${item.competitionName}`).includes(needle));
  els.overviewTopicMeta.textContent = `目前顯示 ${filteredTopics.length} 筆辯題`;
  els.overviewTopicList.innerHTML = filteredTopics.length ? [...filteredTopics]
    .sort((a, b) => a.competitionName.localeCompare(b.competitionName, "zh-Hant") || a.topic.localeCompare(b.topic, "zh-Hant"))
    .map((item) => `<button class="overview-topic-card" type="button" data-topic-event="${escapeHtml(item.competitionName)}"><span>${escapeHtml(item.competitionName)}</span><strong>${escapeHtml(item.topic)}</strong>${item.explanation ? `<p>${escapeHtml(item.explanation)}</p>` : ""}<small>查看該屆比賽 →</small></button>`).join("")
    : '<div class="search-empty"><div><span aria-hidden="true">💬</span><strong>沒有符合的辯題</strong><p>請縮短關鍵字再試一次。</p></div></div>';
}

function renderOverviewSchools() {
  const needle = normalize(els.overviewSchoolFilter.value);
  const sortBy = els.overviewEntitySortBy.value;
  const direction = els.overviewEntitySortDirection.value === "asc" ? 1 : -1;
  const teams = store.entities.filter((entity) => [entity.name, ...(entity.aliases || "").split("|")].some((name) => normalize(name).includes(needle)))
    .map((entity) => {
      const schoolRecords = records.filter((item) => item.teamIds?.affirmative === entity.code || item.teamIds?.negative === entity.code);
      const schoolHonors = honors.filter((item) => item.teamId === entity.code);
      const wins = schoolRecords.filter((match) => matchResultForEntity(match, entity.code) === "勝").length;
      const eventCount = unique(schoolRecords.map((item) => item.competitionName)).length;
      return { entity, games: schoolRecords.length, wins, honors: schoolHonors.length, eventCount };
    })
    .sort((a, b) => {
      const comparison = sortBy === "name"
        ? a.entity.name.localeCompare(b.entity.name, "zh-Hant")
        : a[sortBy] - b[sortBy];
      return comparison * direction || a.entity.name.localeCompare(b.entity.name, "zh-Hant");
    });
  const schools = teams.filter((item) => item.entity.type === "s");
  const groups = teams.filter((item) => item.entity.type !== "s");
  els.overviewSchoolMeta.textContent = `目前顯示 ${schools.length} 所學校、${groups.length} 支組隊`;
  const renderCards = (items, type) => items.length ? items.map(({ entity, games, wins, honors: awardCount, eventCount }) => `
    <button class="overview-school-card ${type}${selectedOverviewEntityId === entity.code ? " is-selected" : ""}" type="button" data-overview-entity-id="${escapeHtml(entity.code)}">
      <span class="overview-school-code">${escapeHtml(entity.code)}</span><strong>${escapeHtml(entity.name)}</strong>
      <small>${games} 場 · ${wins} 勝 · ${eventCount} 個賽事 · ${awardCount} 項榮譽</small>
    </button>`).join("") : '<p class="overview-empty-group">目前沒有符合項目。</p>';
  els.overviewSchoolGrid.innerHTML = `
    <section class="overview-entity-group school-group" aria-labelledby="overviewSchoolGroupTitle">
      <h3 id="overviewSchoolGroupTitle">學校 <span>${schools.length}</span></h3>
      <div class="overview-entity-list">${renderCards(schools, "school")}</div>
    </section>
    <section class="overview-entity-group team-group" aria-labelledby="overviewTeamGroupTitle">
      <h3 id="overviewTeamGroupTitle">組隊 <span>${groups.length}</span></h3>
      <div class="overview-entity-list">${renderCards(groups, "team")}</div>
    </section>`;
  if (selectedOverviewEntityId && !teams.some((item) => item.entity.code === selectedOverviewEntityId)) selectedOverviewEntityId = "";
  els.overviewSchoolDetail.innerHTML = "";
}

function selectOverviewEntity(entityId) {
  selectedOverviewEntityId = entityId;
  renderOverviewSchools();
  showView(`school/${encodeURIComponent(entityId)}`);
}

function showOverviewTab(tabName) {
  const target = ["events", "schools", "topics"].includes(tabName) ? tabName : "events";
  els.overviewTabs.forEach((tab) => {
    const active = tab.dataset.overviewTab === target;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  els.overviewEventsPanel.classList.toggle("is-hidden", target !== "events");
  els.overviewSchoolsPanel.classList.toggle("is-hidden", target !== "schools");
  els.overviewTopicsPanel.classList.toggle("is-hidden", target !== "topics");
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
      const personHonors = honors.filter((item) => item.recipient === name);
      return `<button type="button" class="entity-card player" data-player-route="${escapeHtml(name)}"><h3><span class="player-icon" aria-hidden="true">🎤</span>${escapeHtml(name)}</h3><p>${escapeHtml(unique(personHonors.map((item) => item.team)).join("、") || "所屬學校未載明")} · ${personHonors.length} 筆榮譽</p></button>`;
    }).join("")}
  </div></section>` : "";

  const topicSection = matchedTopics.length ? `<section class="result-section"><h2>符合辯題</h2><div class="overview-topic-list search-topic-list">${matchedTopics.map((item) => `<button class="overview-topic-card" type="button" data-topic-event="${escapeHtml(item.competitionName)}"><span>${escapeHtml(item.competitionName)}</span><strong>${escapeHtml(item.topic)}</strong>${item.explanation ? `<p>${escapeHtml(item.explanation)}</p>` : ""}<small>查看該屆比賽 →</small></button>`).join("")}</div></section>` : "";

  const selectedEntity = store.entityById.get(selectedEntityId);
  const entityDetail = selectedEntity ? renderEntityDetail(selectedEntity) : "";

  const histories = [
    ...matchedRecords.map((item) => ({ date: item.matchDate, title: `${item.teams?.affirmative} ${item.scores?.affirmative}：${item.scores?.negative} ${item.teams?.negative}`, meta: item.competitionName, badge: item.note || "比賽" })),
    ...matchedHonors.map((item) => ({ date: item.matchDate, dateLabel: honorDateLabel(item, events.find((event) => event.name === item.competitionName) || { records: [], dates: [], metadata: {} }), title: `${item.honorName}｜${honorSubject(item)}`, meta: `${item.competitionName}${item.team ? ` · ${item.team}` : ""}`, badge: "榮譽" })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30);

  const historySection = histories.length ? `<section class="result-section"><h2>最近紀錄</h2><div class="history-list">${histories.map((item) => `<article class="history-item"><span class="history-date">${escapeHtml(item.dateLabel || formatDate(item.date))}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.meta)}</p></div><span class="history-badge">${escapeHtml(item.badge)}</span></article>`).join("")}</div></section>` : "";
  els.searchResults.innerHTML = entitySection + topicSection + entityDetail + (selectedEntity ? "" : historySection) || '<div class="search-empty"><div><span aria-hidden="true">🤔</span><strong>目前沒有相符資料</strong><p>可以縮短關鍵字再試一次。</p></div></div>';
}

function renderEntityDetail(entity, detailId = "entityDetail", standalone = false) {
  if (!entity) return "";
  const entityRecords = records.filter((item) => item.teamIds?.affirmative === entity.code || item.teamIds?.negative === entity.code)
    .sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "") || Number(b.period) - Number(a.period));
  const entityHonors = honors.filter((item) => item.teamId === entity.code).sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const wins = entityRecords.filter((match) => matchResultForEntity(match, entity.code) === "勝").length;
  const participatedEvents = unique([...entityRecords.map((item) => item.competitionName), ...entityHonors.map((item) => item.competitionName)]);
  const entityLink = entityPageLink;
  const eventLink = (name, className = "") => `<button type="button" class="entity-event-link ${className}" data-event-route="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
  const matchRows = entityRecords.map((match) => {
    const result = matchResultForEntity(match, entity.code);
    return `<article class="entity-match"><span class="history-date">${escapeHtml(formatDate(match.matchDate))}</span><div><strong>${entityLink(match.teamIds?.affirmative, match.teams?.affirmative)} ${match.scores?.affirmative ?? 0}：${match.scores?.negative ?? 0} ${entityLink(match.teamIds?.negative, match.teams?.negative)}</strong><p>${eventLink(match.competitionName)} · 時段 ${escapeHtml(match.period || "-")} · 會場 ${escapeHtml(match.venue || "-")}</p></div><span class="result-badge result-${result === "勝" ? "win" : result === "敗" ? "loss" : "draw"}">${result}</span></article>`;
  }).join("");
  const podium = (honorName) => {
    const name = honorName?.trim() || "";
    if (name.endsWith("冠軍")) return { label: "冠軍", rank: "冠", tone: "gold", order: 0 };
    if (name.endsWith("亞軍")) return { label: "亞軍", rank: "亞", tone: "silver", order: 1 };
    if (name.endsWith("季軍")) return { label: "季軍", rank: "季", tone: "bronze", order: 2 };
    if (name.endsWith("殿軍")) return { label: "殿軍", rank: "殿", tone: "white", order: 3 };
    return null;
  };
  const awardGroups = new Map();
  entityHonors.forEach((honor) => {
    const group = awardGroups.get(honor.competitionName) || { name: honor.competitionName, awards: [], honors: [] };
    const rank = honor.honorType === "team" ? podium(honor.honorName) : null;
    if (rank) {
      if (!group.awards.some((item) => item.label === rank.label)) group.awards.push(rank);
    } else {
      const kind = isFullCourseBest(honor) ? "full-course" : isFullCourseExcellent(honor) ? "full-course-excellence" : isSingleMatchBest(honor) ? "single-match" : isSingleMatchExcellent(honor) ? "single-excellence" : "other";
      group.honors.push({ honor, kind });
    }
    awardGroups.set(honor.competitionName, group);
  });
  const trophyRows = [...awardGroups.values()].map((group) => {
    group.awards.sort((a, b) => a.order - b.order);
    const medals = group.awards.length ? `<span class="entity-trophy-medals">${group.awards.map((award) => `<span class="trophy-medal ${award.tone}" aria-label="${award.label}">${award.rank}</span>`).join("")}</span>` : "";
    const groupedHonors = new Map();
    group.honors.forEach(({ honor, kind }) => {
      const key = kind === "single-match" ? `${kind}|${honor.recipient}` : `${kind}|${honor.honorName}|${honor.recipient}`;
      const entry = groupedHonors.get(key) || { honor, kind, count: 0 };
      entry.count += 1;
      if ((honor.matchDate || "") > (entry.honor.matchDate || "")) entry.honor = honor;
      groupedHonors.set(key, entry);
    });
    const honorsForEvent = [...groupedHonors.values()].map(({ honor, kind, count }) => {
      const badge = kind === "other" ? "獎" : kind === "full-course-excellence" ? "優" : "佳";
      const subject = honor.honorType === "player" ? playerPageLink(honor.recipient) : entityLink(honor.teamId, honorSubject(honor));
      const date = honor.matchDate ? `<small>${escapeHtml(formatDate(honor.matchDate))}</small>` : "";
      const repeat = count > 1 ? `<span class="trophy-honor-count">×${count}</span>` : "";
      const label = kind === "full-course" ? "全程最佳辯士" : kind === "full-course-excellence" ? "全程優秀辯士" : kind === "single-match" ? "單場最佳辯士" : kind === "single-excellence" ? "單場優秀辯士" : honor.honorName;
      return `<div class="entity-trophy-honor ${kind}"><span class="trophy-honor-badge" aria-label="${escapeHtml(label)}">${badge}</span><span class="trophy-honor-copy"><strong>${escapeHtml(label)}</strong><span>${subject}</span></span>${repeat}${date}</div>`;
    }).join("");
    return `<article class="entity-trophy-card"><div class="entity-trophy-title"><strong>${eventLink(group.name)}</strong>${medals}</div>${honorsForEvent ? `<div class="entity-trophy-honors">${honorsForEvent}</div>` : ""}</article>`;
  }).join("");
  const eventsByYear = new Map();
  participatedEvents.forEach((name) => {
    const event = events.find((item) => item.name === name);
    const year = (event?.latestDate || "").slice(0, 4) || "年份未載明";
    eventsByYear.set(year, [...(eventsByYear.get(year) || []), name]);
  });
  const participatedRows = [...eventsByYear.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([year, names]) => `<section class="entity-event-year"><h4>${escapeHtml(year)}</h4><div class="entity-event-list">${names.map((name) => eventLink(name)).join("")}</div></section>`).join("");
  return `<section id="${detailId}" class="result-section entity-detail">${standalone ? '<button class="event-back-button" type="button" data-detail-back>← 返回上一頁</button>' : ""}<div class="entity-detail-heading"><div><p class="kicker">${escapeHtml(entity.code)}</p><h2>${escapeHtml(entity.name)}的完整紀錄</h2></div><div><strong>${participatedEvents.length}</strong> 個賽事 · <strong>${entityRecords.length}</strong> 場 · <strong>${wins}</strong> 勝 · <strong>${entityHonors.length}</strong> 項榮譽</div></div><h3 class="entity-trophy-heading">獲獎盃賽</h3><div class="entity-trophy-list">${trophyRows || "<p>尚無盃賽名次或榮譽。</p>"}</div><h3>參加賽事</h3><div class="entity-event-years">${participatedRows || "<p>尚無參賽紀錄。</p>"}</div><details class="entity-records-disclosure"><summary><span>所有戰績</span><span>${entityRecords.length} 場</span></summary><div class="history-list">${matchRows || "<p>尚無公開戰績。</p>"}</div></details></section>`;
}

function selectEntity(entityId) {
  if (!store.entityById.has(entityId)) return;
  showView(`school/${encodeURIComponent(entityId)}`);
}

window.DebateInteractions.setupInteractions({ els, showView, renderEvent, renderSearch, renderEventFinder, selectEntity, renderOverviewSchools, renderOverviewTopics, selectOverviewEntity, showOverviewTab });
els.honorRangeToggle?.addEventListener("click", () => {
  honorRange = honorRange === "all" ? "recent" : "all";
  renderLeaderboards();
});
document.querySelectorAll("[data-honor-filter]").forEach((button) => button.addEventListener("click", () => {
  honorCategoryFilter = button.dataset.honorFilter;
  document.querySelectorAll("[data-honor-filter]").forEach((item) => {
    const active = item === button;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-pressed", String(active));
  });
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
  renderDataFreshness();
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
  showView(initialQuery ? "search" : (/^(?:event|school|player)\/.+/.test(initialView) || ["events", "overview", "search", "archive", "reports"].includes(initialView) ? initialView : "home"));
  if (initialView === "events") showOverviewTab("events");
}

events = eventSummaries();
renderAll();
