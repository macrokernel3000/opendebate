(function () {
  function createEventPages({
    els,
    getEvents,
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
  }) {
    function renderMetadataNote(note) {
      const text = String(note || "");
      const sourcePattern = /https:\/\/[^\s<>「」『』【】〈〉，,。；;、]+/gi;
      let sourceIndex = 0;
      let cursor = 0;
      let html = "";
      let match;
      while ((match = sourcePattern.exec(text))) {
        html += escapeHtml(text.slice(cursor, match.index));
        sourceIndex += 1;
        html += `<a href="${escapeHtml(match[0])}" target="_blank" rel="noopener noreferrer">來源連結 ${sourceIndex}</a>`;
        cursor = match.index + match[0].length;
      }
      return html + escapeHtml(text.slice(cursor));
    }

    function renderMatchNote(note) {
      const text = String(note || "公開賽果").trim();
      if (text.length <= 28 && !/https:\/\//i.test(text)) return escapeHtml(text);
      return `<details class="match-note-disclosure"><summary>備註／來源</summary><span>${renderMetadataNote(text)}</span></details>`;
    }

    function formatEventDateRange(startDate, endDate, fallbackDates = []) {
      if (startDate && endDate) {
        return startDate === endDate
          ? formatDate(startDate)
          : `${formatDate(startDate)}–${formatDate(endDate)}`;
      }
      const singleDate = startDate || endDate;
      return singleDate ? formatDate(singleDate) : fallbackDates.map(formatDate).join("、");
    }

    function renderUpcomingEvent(event, target = els.eventPageDetail) {
      if (!event) return;
      const titleLevel = target === els.eventPageDetail ? 1 : 2;
      const sectionLevel = titleLevel + 1;
      const dateLabel = formatEventDateRange(event.startDate, event.endDate);
      const metadata = [
        event.organizer || event.executionUnit ? `<div class="event-meta-parties">${event.organizer ? `<div><span>主辦單位</span><strong>${escapeHtml(event.organizer)}</strong></div>` : ""}${event.executionUnit ? `<div><span>執行單位</span><strong>${escapeHtml(event.executionUnit)}</strong></div>` : ""}</div>` : "",
        event.location ? `<div class="event-meta-place"><span>舉辦地點</span><strong>${escapeHtml(event.location)}</strong></div>` : "",
      ].filter(Boolean).join("");
      const keyDates = (event.keyDates || []).filter((item) => item && item.label && (item.date || item.note)).map((item) => `
        <li>${item.date ? `<time datetime="${escapeHtml(item.date)}">${escapeHtml(formatDate(item.date))}${item.time ? ` ${escapeHtml(item.time)}` : ""}</time>` : ""}<div><strong>${escapeHtml(item.label)}</strong>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}</div></li>`).join("");
      target.innerHTML = `
        <button class="event-back-button" type="button" data-detail-back>← 返回上一頁</button>
        <div class="event-summary">
          <div><p class="kicker">賽事公告</p><h${titleLevel}>${escapeHtml(event.name)}</h${titleLevel}><p>${escapeHtml(dateLabel)}</p></div>
          <div class="event-summary-count"><span class="count-chip">即將舉行</span></div>
        </div>
        ${metadata ? `<div class="event-metadata">${metadata}</div>` : ""}
        ${event.topic ? `<section class="event-topics"><h${sectionLevel}>比賽辯題</h${sectionLevel}><p>${escapeHtml(event.topic)}</p>${event.topicNote ? `<p>${escapeHtml(event.topicNote)}</p>` : ""}</section>` : ""}
        ${keyDates ? `<section class="upcoming-key-dates"><h${sectionLevel}>重要時程</h${sectionLevel}><ul>${keyDates}</ul></section>` : ""}
        <p class="upcoming-event-status">目前顯示賽事公告資訊；賽果與獎項待公開後收錄。</p>`;
    }

    function renderActivity(activity, target = els.eventPageDetail) {
      if (!activity || !target) return;
      const titleLevel = target === els.eventPageDetail ? 1 : 2;
      const sectionLevel = titleLevel + 1;
      const dateLabel = `${formatDate(activity.startDate)}${activity.startTime ? ` ${activity.startTime}` : ""}${activity.endTime ? `–${activity.endTime}` : ""}`;
      const safeLink = (url, label) => /^https?:\/\//i.test(String(url || ""))
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : "";
      const links = [
        safeLink(activity.registrationUrl, "報名連結"),
        safeLink(activity.sourceUrl, "主辦方公告"),
        safeLink(activity.relatedUrl, "相關資訊"),
      ].filter(Boolean);
      target.innerHTML = `
        <button class="event-back-button" type="button" data-detail-back>← 返回上一頁</button>
        <div class="event-summary">
          <div><p class="kicker">活動資訊</p><h${titleLevel}>${escapeHtml(activity.name)}</h${titleLevel}><p>${escapeHtml(dateLabel)}</p></div>
          <div class="event-summary-count"><span class="count-chip">活動</span></div>
        </div>
        <div class="event-metadata">
          ${activity.organizer ? `<div class="event-meta-parties"><div><span>主辦單位</span><strong>${escapeHtml(activity.organizer)}</strong></div></div>` : ""}
          ${activity.location ? `<div class="event-meta-place"><span>地點</span><strong>${escapeHtml(activity.location)}</strong></div>` : ""}
        </div>
        ${activity.topic ? `<section class="event-topics"><h${sectionLevel}>辯題</h${sectionLevel}><p>${escapeHtml(activity.topic)}</p></section>` : ""}
        ${activity.note ? `<section class="event-topics"><h${sectionLevel}>活動資訊</h${sectionLevel}><p>${escapeHtml(activity.note)}</p></section>` : ""}
        <section class="event-topics"><h${sectionLevel}>相關連結</h${sectionLevel}>${links.length ? `<p class="activity-source-links">${links.join("　")}</p>` : "<p>目前沒有提供相關連結。</p>"}${activity.registrationUrl ? "" : "<p>公告未提供報名連結。</p>"}</section>`;
    }
  
    function renderEvent(name, target = els.eventDetail) {
      const event = getEvents().find((item) => item.name === name);
      if (!event) return;
      const titleLevel = target === els.eventPageDetail ? 1 : 2;
      const sectionLevel = titleLevel + 1;
      const itemLevel = sectionLevel + 1;
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
          <h${itemLevel} class="match-day-title"><span aria-hidden="true">📅</span>${escapeHtml(formatDate(date))}</h${itemLevel}>
          <div class="match-list">${matches.map((match) => {
            const a = Number(match.scores?.affirmative) || 0;
          const n = Number(match.scores?.negative) || 0;
          const hasScore = matchScoreLabel(match) !== "比分未公告";
          const winnerSide = window.DebateCore.matchWinnerSide(match, store);
          const singleHonors = singleHonorsFor(match);
          return `<div class="match-row">
            <span class="match-place">時段 ${escapeHtml(match.period || "-")}<br>會場 ${escapeHtml(match.venue || "-")}${match.groupName ? `<small class="match-group-name" aria-label="循環／分組：${escapeHtml(match.groupName)}">↻ ${escapeHtml(match.groupName)}</small>` : ""}</span>
              <span class="team-name ${winnerSide === "affirmative" ? "is-match-winner" : ""} ${!hasScore && winnerSide === "affirmative" ? "unscored-match-winner" : ""}">${entityPageLink(match.teamIds?.affirmative, match.teams?.affirmative, "team-name-link")}${winnerSide === "affirmative" ? `<small class="match-winner-marker">勝方</small>` : ""}${!hasScore && winnerSide === "affirmative" ? `<small>${match.inferenceNote ? "推定勝方" : "文件列明勝方"}</small>` : ""}</span>
              ${hasScore ? `<span class="match-score"><span class="${a > n ? "winner-score" : ""}">${a}</span><span>:</span><span class="${n > a ? "winner-score" : ""}">${n}</span></span>` : '<span class="score-unreported" aria-label="比分未公告">未公告</span>'}
              <span class="team-name negative ${winnerSide === "negative" ? "is-match-winner" : ""} ${!hasScore && winnerSide === "negative" ? "unscored-match-winner" : ""}">${entityPageLink(match.teamIds?.negative, match.teams?.negative, "team-name-link")}${winnerSide === "negative" ? `<small class="match-winner-marker">勝方</small>` : ""}${!hasScore && winnerSide === "negative" ? `<small>${match.inferenceNote ? "推定勝方" : "文件列明勝方"}</small>` : ""}</span>
              <span class="match-note">${renderMatchNote(match.note)}${singleHonors.map((honor) => `<span class="match-single-best"><b>${honor.label}</b>${playerPageLink(honor.recipient)}</span>`).join("")}</span>
            </div>`;
          }).join("")}</div>
        </section>`).join("");
      const eventHonors = [...event.honors].sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
      const metadata = event.metadata || {};
      const metadataNote = String(metadata.note || "").trim();
      const metadataNoteHasSources = /https:\/\//i.test(metadataNote);
      const metadataNoteContent = metadataNote.length > 180 || metadataNoteHasSources
        ? `<details class="event-metadata-note"><summary>${metadataNoteHasSources ? "賽事補充資訊與來源" : "賽事補充資訊"}</summary><p>${renderMetadataNote(metadataNote)}</p></details>`
        : metadataNote ? `<small>${renderMetadataNote(metadataNote)}</small>` : "";
      const metadataSection = metadata.organizer || metadata.executionUnit || metadata.location || metadataNote ? `<div class="event-metadata"><span>賽事資訊</span>${metadata.organizer || metadata.executionUnit ? `<div class="event-meta-parties">${metadata.organizer ? `<strong>主辦單位：${escapeHtml(metadata.organizer)}</strong>` : ""}${metadata.executionUnit ? `<strong>執行單位：${escapeHtml(metadata.executionUnit)}</strong>` : ""}</div>` : ""}${metadata.location ? `<small class="event-meta-place">舉辦地點：${escapeHtml(metadata.location)}</small>` : ""}${metadataNote.length <= 180 && !metadataNoteHasSources ? metadataNoteContent : ""}</div>${metadataNote.length > 180 || metadataNoteHasSources ? metadataNoteContent : ""}` : "";
      const awardCriteriaSection = metadata.awardSelectionCriteria ? `<details class="topic-explanation event-award-criteria"><summary>個人獎遴選標準</summary><p>${escapeHtml(metadata.awardSelectionCriteria)}</p></details>` : "";
      const topicSection = event.topics.length ? `<section class="event-topics"><div class="subheading-row"><h${sectionLevel} class="subheading">💡 比賽辯題</h${sectionLevel}><span>${event.topics.length} 題</span></div>${event.topics.map((item, index) => `<article class="topic-card"><span>辯題 ${index + 1}</span><button class="topic-title-link" type="button" data-topic-route="${escapeHtml(item.topicId)}">${escapeHtml(item.topic)}</button>${item.explanation ? `<details class="topic-explanation"><summary>大會辯題補充</summary><p>${escapeHtml(item.explanation)}</p></details>` : ""}</article>`).join("")}</section>` : "";
      const rosterSection = event.rosters.length ? `<details class="event-rosters"><summary><span>📋 名單與參賽身分</span><span>${event.rosters.length} 隊</span></summary><div class="event-roster-grid">${event.rosters.map((roster) => {
        const teamEntity = store.entityForName(roster.team);
        const team = teamEntity ? entityPageLink(teamEntity.code, roster.team) : escapeHtml(roster.team);
        const status = roster.status && roster.status !== "公告名單" ? `<small class="roster-source-status">${escapeHtml(roster.status)}</small>` : "";
        return `<article class="event-roster-card"><h${itemLevel + 1}>${team}${status}</h${itemLevel + 1}>${roster.leaders?.length ? `<p><strong>領隊</strong><span>${roster.leaders.map(escapeHtml).join("、")}</span></p>` : ""}${roster.players?.length ? `<p><strong>選手</strong><span>${roster.players.map(escapeHtml).join("、")}</span></p>` : ""}</article>`;
      }).join("")}</div></details>` : "";
      const eventSummaryCounts = [
        event.records.length && event.teamCount ? `<span class="count-chip">${event.teamCount} 隊</span>` : "",
        event.records.length ? `<span class="count-chip">${event.records.length} 場</span>` : "",
        event.honors.length ? `<span class="count-chip">${event.honors.length} 榮譽</span>` : "",
      ].filter(Boolean).join("");
      target.innerHTML = `
        <button class="event-back-button" type="button" data-detail-back>← 返回上一頁</button>
        <div class="event-summary">
          <div><h${titleLevel}>${escapeHtml(event.name)}</h${titleLevel}><p>${escapeHtml(formatEventDateRange(event.metadata.startDate, event.metadata.endDate, event.dates))}</p></div>
          ${eventSummaryCounts ? `<div class="event-summary-count">${eventSummaryCounts}</div>` : ""}
        </div>
        ${topicSection}
        ${metadataSection}
        ${awardCriteriaSection}
        ${rosterSection}
        <div class="event-content-grid">
          <div class="event-scores"><h${sectionLevel} class="subheading">比賽結果</h${sectionLevel}>${matchDays || '<div class="search-empty"><p>尚無公開戰果</p></div>'}</div>
          <aside class="event-honors"><h${sectionLevel} class="subheading">🏆 公開榮譽</h${sectionLevel}>${eventHonors.length ? renderEventHonors(event) : "<p>尚無公開榮譽。</p>"}</aside>
        </div>`;
    }
    return { renderUpcomingEvent, renderActivity, renderEvent };
  }

  window.DebateEventPages = { createEventPages };
})();
