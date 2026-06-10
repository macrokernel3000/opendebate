const data = window.DEBATE_PUBLIC_DATA || { records: [], honors: [] };
let records = data.records || [];
let honors = data.honors || [];
let events = [];

const els = {
  navButtons: document.querySelectorAll("[data-view]"),
  views: document.querySelectorAll("[data-view-panel]"),
  statsBand: document.querySelector("#statsBand"),
  recentEvents: document.querySelector("#recentEvents"),
  latestHonors: document.querySelector("#latestHonors"),
  schoolLeaderboard: document.querySelector("#schoolLeaderboard"),
  playerLeaderboard: document.querySelector("#playerLeaderboard"),
  eventSelect: document.querySelector("#eventSelect"),
  eventDetail: document.querySelector("#eventDetail"),
  globalSearch: document.querySelector("#globalSearch"),
  clearSearch: document.querySelector("#clearSearch"),
  searchMeta: document.querySelector("#searchMeta"),
  searchResults: document.querySelector("#searchResults"),
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function formatDate(value) {
  if (!value) return "日期未載明";
  const [year, month, day] = value.split("-");
  return `${year}.${Number(month)}.${Number(day)}`;
}

function countBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (key) map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function eventSummaries() {
  const names = unique([...records.map((item) => item.competitionName), ...honors.map((item) => item.competitionName)]);
  return names.map((name) => {
    const eventRecords = records.filter((item) => item.competitionName === name);
    const eventHonors = honors.filter((item) => item.competitionName === name);
    const dates = unique([...eventRecords.map((item) => item.matchDate), ...eventHonors.map((item) => item.matchDate)]).sort();
    return { name, records: eventRecords, honors: eventHonors, dates, latestDate: dates.at(-1) || "" };
  }).sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name, "zh-Hant"));
}



function showView(name) {
  els.views.forEach((view) => view.classList.toggle("is-hidden", view.dataset.viewPanel !== name));
  els.navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.view === name));
  history.replaceState(null, "", `#${name}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "search") requestAnimationFrame(() => els.globalSearch.focus());
}

function renderStats() {
  const schools = unique(records.flatMap((item) => [item.teams?.affirmative, item.teams?.negative]));
  const players = unique(honors.filter((item) => item.honorType === "player").map((item) => item.recipient));
  const values = [
    ["📣 已收錄賽事", events.length],
    ["⚔️ 公開戰果", records.length],
    ["🏫 參賽學校／隊伍", schools.length],
    ["🏆 公開榮譽", honors.length + (players.length ? 0 : 0)],
  ];
  els.statsBand.innerHTML = values.map(([label, value]) => `<div class="stat-item"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderRecentEvents() {
  els.recentEvents.innerHTML = events.slice(0, 4).map((event) => `
    <button class="event-card" type="button" data-event-name="${escapeHtml(event.name)}">
      <span class="event-date">${escapeHtml(formatDate(event.latestDate))}</span>
      <h3>${escapeHtml(event.name)}</h3>
      <span class="event-card-meta"><span>${event.records.length} 場戰果</span><span>${event.honors.length} 筆榮譽</span></span>
    </button>`).join("");
}

function honorSubject(honor) {
  return honor.honorType === "player" ? honor.recipient : honor.recipient || honor.team;
}

function renderLatestHonors() {
  els.latestHonors.innerHTML = [...honors].sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "")).slice(0, 6).map((honor) => `
    <div class="honor-feed-item">
      <span class="honor-icon" aria-hidden="true">${/冠軍/.test(honor.honorName) ? "🥇" : /亞軍/.test(honor.honorName) ? "🥈" : /季軍/.test(honor.honorName) ? "🥉" : "🎤"}</span>
      <div><strong>${escapeHtml(honor.honorName)}｜${escapeHtml(honorSubject(honor))}</strong><span>${escapeHtml(honor.team || honor.competitionName)} · ${escapeHtml(formatDate(honor.matchDate))}</span></div>
    </div>`).join("");
}

function renderLeaderboards() {
  const schoolAwards = countBy(honors, (honor) => honor.honorType === "player" ? honor.team : honor.recipient || honor.team).slice(0, 7);
  const playerAwards = countBy(honors.filter((honor) => honor.honorType === "player"), (honor) => honor.recipient).slice(0, 7);
  const rows = (items, type) => items.map(([name, count]) => `<li><div><strong>${escapeHtml(name)}</strong><span>${type}</span></div><span class="rank-count">${count} 項</span></li>`).join("");
  els.schoolLeaderboard.innerHTML = rows(schoolAwards, "公開團體與選手榮譽");
  els.playerLeaderboard.innerHTML = rows(playerAwards, "個人辯士榮譽");
}

function renderEventOptions() {
  els.eventSelect.innerHTML = events.map((event) => `<option value="${escapeHtml(event.name)}">${escapeHtml(event.name)}</option>`).join("");
  if (events[0]) renderEvent(events[0].name);
}

function groupByDate(items) {
  return items.reduce((groups, item) => {
    const key = item.matchDate || "日期未載明";
    (groups[key] ||= []).push(item);
    return groups;
  }, {});
}

function renderEvent(name) {
  const event = events.find((item) => item.name === name);
  if (!event) return;
  els.eventSelect.value = name;
  const grouped = groupByDate([...event.records].sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "") || Number(a.period) - Number(b.period) || Number(a.venue) - Number(b.venue)));
  const matchDays = Object.entries(grouped).map(([date, matches]) => `
    <section class="match-day">
      <h3 class="match-day-title"><span aria-hidden="true">📅</span>${escapeHtml(formatDate(date))}</h3>
      <div class="match-list">${matches.map((match) => {
        const a = Number(match.scores?.affirmative) || 0;
        const n = Number(match.scores?.negative) || 0;
        return `<div class="match-row">
          <span class="match-place">時段 ${escapeHtml(match.period || "-")}<br>會場 ${escapeHtml(match.venue || "-")}</span>
          <span class="team-name">${escapeHtml(match.teams?.affirmative)}</span>
          <span class="match-score"><span class="${a > n ? "winner-score" : ""}">${a}</span><span>:</span><span class="${n > a ? "winner-score" : ""}">${n}</span></span>
          <span class="team-name negative">${escapeHtml(match.teams?.negative)}</span>
          <span class="match-note">${escapeHtml(match.note || "公開賽果")}</span>
        </div>`;
      }).join("")}</div>
    </section>`).join("");
  const eventHonors = [...event.honors].sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  els.eventDetail.innerHTML = `
    <div class="event-summary">
      <div><h2>${escapeHtml(event.name)}</h2><p>${event.dates.map(formatDate).join("、")}</p></div>
      <div class="event-summary-count"><span class="count-chip">${event.records.length} 場比賽</span><span class="count-chip">${event.honors.length} 筆榮譽</span></div>
    </div>
    <div class="event-content-grid">
      <div><h3 class="subheading">比賽結果</h3>${matchDays || '<div class="search-empty"><p>尚無公開戰果</p></div>'}</div>
      <aside class="event-honors"><h3 class="subheading">🏆 公開榮譽</h3>${eventHonors.length ? eventHonors.map((honor) => `<div class="event-honor"><span>${escapeHtml(honor.honorName)}</span><strong>${escapeHtml(honorSubject(honor))}</strong>${honor.team ? `<small>${escapeHtml(honor.team)}</small>` : ""}</div>`).join("") : "<p>尚無公開榮譽。</p>"}</aside>
    </div>`;
}

function normalize(value) { return String(value || "").toLocaleLowerCase("zh-Hant").replace(/\s+/g, ""); }

function renderSearch(query) {
  const needle = normalize(query);
  if (!needle) {
    els.searchMeta.textContent = "輸入名稱後，即時顯示最近參賽與獲獎紀錄。";
    els.searchResults.innerHTML = '<div class="search-empty"><div><span aria-hidden="true">🗂️</span><strong>從一個名字開始</strong><p>學校、隊伍或選手姓名都可以搜尋。</p></div></div>';
    return;
  }

  const allSchools = unique([
    ...records.flatMap((item) => [item.teams?.affirmative, item.teams?.negative]),
    ...honors.map((item) => item.team),
    ...honors.filter((item) => item.honorType !== "player").map((item) => item.recipient),
  ]);
  const allPlayers = unique(honors.filter((item) => item.honorType === "player").map((item) => item.recipient));
  const matchedSchools = allSchools.filter((name) => normalize(name).includes(needle));
  const matchedPlayers = allPlayers.filter((name) => normalize(name).includes(needle));
  const schoolSet = new Set(matchedSchools);
  const playerSet = new Set(matchedPlayers);
  const matchedRecords = records.filter((item) => schoolSet.has(item.teams?.affirmative) || schoolSet.has(item.teams?.negative)).sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const matchedHonors = honors.filter((item) => schoolSet.has(item.team) || schoolSet.has(item.recipient) || playerSet.has(item.recipient)).sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const resultCount = matchedSchools.length + matchedPlayers.length;
  els.searchMeta.textContent = resultCount ? `找到 ${matchedSchools.length} 個學校／隊伍、${matchedPlayers.length} 位選手` : `沒有找到「${query}」`;

  const entitySection = resultCount ? `<section class="result-section"><h2>符合名稱</h2><div class="entity-grid">
    ${matchedSchools.map((name) => {
      const games = records.filter((item) => item.teams?.affirmative === name || item.teams?.negative === name).length;
      const awards = honors.filter((item) => item.team === name || (item.honorType !== "player" && item.recipient === name)).length;
      return `<article class="entity-card"><h3>🏫 ${escapeHtml(name)}</h3><p>${games} 場公開賽果 · ${awards} 筆相關榮譽</p></article>`;
    }).join("")}
    ${matchedPlayers.map((name) => {
      const personHonors = honors.filter((item) => item.recipient === name);
      return `<article class="entity-card player"><h3><span class="player-icon" aria-hidden="true">🎤</span>${escapeHtml(name)}</h3><p>${escapeHtml(unique(personHonors.map((item) => item.team)).join("、") || "所屬學校未載明")} · ${personHonors.length} 筆榮譽</p></article>`;
    }).join("")}
  </div></section>` : "";

  const histories = [
    ...matchedRecords.map((item) => ({ date: item.matchDate, title: `${item.teams?.affirmative} ${item.scores?.affirmative}：${item.scores?.negative} ${item.teams?.negative}`, meta: item.competitionName, badge: item.note || "比賽" })),
    ...matchedHonors.map((item) => ({ date: item.matchDate, title: `${item.honorName}｜${honorSubject(item)}`, meta: `${item.competitionName}${item.team ? ` · ${item.team}` : ""}`, badge: "榮譽" })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30);

  const historySection = histories.length ? `<section class="result-section"><h2>最近紀錄</h2><div class="history-list">${histories.map((item) => `<article class="history-item"><span class="history-date">${escapeHtml(formatDate(item.date))}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.meta)}</p></div><span class="history-badge">${escapeHtml(item.badge)}</span></article>`).join("")}</div></section>` : "";
  els.searchResults.innerHTML = entitySection + historySection || '<div class="search-empty"><div><span aria-hidden="true">🤔</span><strong>目前沒有相符資料</strong><p>可以縮短關鍵字再試一次。</p></div></div>';
}

els.navButtons.forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll("[data-go-search]").forEach((button) => button.addEventListener("click", () => showView("search")));
document.querySelectorAll("[data-go-events]").forEach((button) => button.addEventListener("click", () => showView("events")));
els.recentEvents.addEventListener("click", (event) => {
  const card = event.target.closest("[data-event-name]");
  if (!card) return;
  renderEvent(card.dataset.eventName);
  showView("events");
});
els.eventSelect.addEventListener("change", () => renderEvent(els.eventSelect.value));
els.globalSearch.addEventListener("input", () => renderSearch(els.globalSearch.value.trim()));
els.clearSearch.addEventListener("click", () => { els.globalSearch.value = ""; renderSearch(""); els.globalSearch.focus(); });


function renderAll() {
  renderStats();
  renderRecentEvents();
  renderLatestHonors();
  renderLeaderboards();
  renderEventOptions();
  const initialQuery = new URLSearchParams(location.search).get("q") || "";
  els.globalSearch.value = initialQuery;
  renderSearch(initialQuery);
  showView(initialQuery ? "search" : (["events", "search"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "home"));
}

events = eventSummaries();
renderAll();
