(function () {
  function createHomePages({
    els,
    getEvents,
    getRecords,
    getHonors,
    getUpcomingEvents,
    getSiteContent,
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
  }) {
    let honorRange = "recent";
    const mobileHonorFilters = new Set(["team", "individual"]);
    const leaderboardSortDirections = { gold: -1, silver: -1, bronze: -1, white: -1, fullCourse: -1, other: -1, totalHonors: -1 };
    const leaderboardSortPriority = ["gold", "silver", "bronze", "white", "fullCourse", "other", "totalHonors"];
    let leaderboardSortKey = "totalHonors";

    function renderStats() {
      const events = getEvents();
      const records = getRecords();
      const honors = getHonors();
      const schools = unique(records.flatMap((item) => [item.teamIds?.affirmative || item.teams?.affirmative, item.teamIds?.negative || item.teams?.negative]));
      const values = [
        ["📣 已收錄賽事", events.length],
        ["⚔️ 公開戰果", records.length],
        ["🏫 參賽學校／隊伍", schools.length],
        ["🏆 公開榮譽", honors.length],
      ];
      els.statsBand.innerHTML = values.map(([label, value]) => `<div class="stat-item"><span>${label}</span><strong>${value}</strong></div>`).join("");
    }

    function renderSiteIntroduction() {
      const content = getSiteContent() || {};
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
      const events = getEvents();
      const records = getRecords();
      const renderCard = (event, compact = false) => {
        const topicPreview = event.topics.slice(0, 2).map((item) => `<p class="event-card-topic"><span>辯題：</span>${escapeHtml(item.topic)}</p>`).join("");
        const resultCounts = event.records.length
          ? `<span>${event.teamCount} 隊</span><span>${event.records.length} 場</span>`
          : `<span>逐場賽果未收錄</span>`;
        const honorCount = event.honors.length ? `<span>${event.honors.length} 榮譽</span>` : "";
        return `
          <button class="event-card" type="button" data-event-name="${escapeHtml(event.name)}">
            ${compact ? `<span class="event-card-time"><i class="event-time-point" aria-hidden="true"></i><span class="event-date">${escapeHtml(formatDate(event.latestDate))}</span></span>` : `<span class="event-date">${escapeHtml(formatDate(event.latestDate))}</span>`}
            <div class="event-card-body">
              <h3>${escapeHtml(event.name)}</h3>
              ${topicPreview ? `<div class="event-card-topics">${topicPreview}</div>` : ""}
            </div>
            ${renderEventPodium(event)}
            <span class="event-card-meta">${resultCounts}${honorCount}</span>
          </button>`;
      };
      els.recentEvents.innerHTML = events.map(renderCard).join("");
      if (els.mobileEventCount) els.mobileEventCount.textContent = events.length;
      if (els.mobileMatchCount) els.mobileMatchCount.textContent = records.length;
      if (els.mobileRecentEvents) els.mobileRecentEvents.innerHTML = events.slice(0, 8).map((event) => renderCard(event, true)).join("");
    }

    function renderMobileUpcomingEvents() {
      if (!els.mobileUpcomingEvents) return;
      const upcoming = [...getUpcomingEvents()].sort((a, b) => a.startDate.localeCompare(b.startDate));
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
      const events = getEvents();
      const upcomingEventsData = getUpcomingEvents();
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const upcomingEvents = [...upcomingEventsData]
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
      const events = getEvents();
      const records = getRecords();
      const honors = getHonors();
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

    function renderHome() {
      renderSiteIntroduction();
      renderStats();
      renderTimeline();
      renderRecentEvents();
      renderMobileUpcomingEvents();
      renderLeaderboards();
    }

    function toggleHonorRange() {
      honorRange = honorRange === "all" ? "recent" : "all";
      renderLeaderboards();
    }

    function toggleMobileHonorFilter(filter) {
      if (mobileHonorFilters.has(filter)) mobileHonorFilters.delete(filter);
      else mobileHonorFilters.add(filter);
      renderLeaderboards();
    }

    function sortLeaderboard(key) {
      if (!Object.hasOwn(leaderboardSortDirections, key)) return;
      if (key === leaderboardSortKey) leaderboardSortDirections[key] *= -1;
      leaderboardSortKey = key;
      renderLeaderboards();
    }

    return { renderHome, renderLeaderboards, toggleHonorRange, toggleMobileHonorFilter, sortLeaderboard };
  }

  window.DebateHomePages = { createHomePages };
})();
