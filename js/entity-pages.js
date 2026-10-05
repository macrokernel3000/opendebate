(function () {
  function createEntityPages({
    els,
    getEvents,
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
  }) {
    function eventRouteLink(name) {
      return `<button type="button" class="entity-event-link" data-event-route="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
    }

    function renderPlayerDetail(playerName) {
      const playerHonors = honors.filter((honor) => honor.honorType === "player" && honor.recipient === playerName)
        .sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "") || a.competitionName.localeCompare(b.competitionName, "zh-Hant"));
      const playerMatches = records.filter((record) => Object.values(record.players || {}).some((names) => names.includes(playerName)))
        .sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
      const playerRosters = playerRosterEntries(playerName);
      const affiliations = unique([...playerHonors.map((honor) => honor.team), ...playerRosters.map((roster) => roster.team)].filter(Boolean));
      const rosterRows = playerRosters.map((roster) => `<article class="entity-match"><span class="history-date">名單</span><div><strong>${entityPageLink(store.entityForName(roster.team)?.code, roster.team)}</strong><p>${eventRouteLink(roster.competitionName)} · ${roster.players?.includes(playerName) ? "選手" : "領隊"}</p></div></article>`).join("");
      const playerHonorsByEvent = new Map();
      playerHonors.forEach((honor) => {
        const group = playerHonorsByEvent.get(honor.competitionName) || { name: honor.competitionName, awards: new Map() };
        const kind = isFullCourseBest(honor) ? "full-course" : isFullCourseExcellent(honor) ? "full-course-excellence" : isSingleMatchBest(honor) ? "single-match" : isSingleMatchExcellent(honor) ? "single-excellence" : "other";
        const key = `${kind}|${honor.honorName}|${honor.team || ""}`;
        const award = group.awards.get(key) || { honor, kind, count: 0 };
        award.count += 1;
        if ((honor.matchDate || "") > (award.honor.matchDate || "")) award.honor = honor;
        group.awards.set(key, award);
        playerHonorsByEvent.set(honor.competitionName, group);
      });
      const honorCards = [...playerHonorsByEvent.values()].map((group) => {
        const event = getEvents().find((item) => item.name === group.name) || { records: [], dates: [], metadata: {} };
        const awards = [...group.awards.values()].map(({ honor, kind, count }) => {
          const badge = kind === "full-course-excellence" || kind === "single-excellence" ? "優" : kind === "other" ? "獎" : "佳";
          const levelLabel = kind === "full-course" ? "全程最佳辯士" : kind === "full-course-excellence" ? "全程優秀辯士" : kind === "single-match" ? "單場最佳辯士" : kind === "single-excellence" ? "單場優秀辯士" : honor.honorName;
          const affiliation = honor.team ? entityPageLink(honor.teamId, honor.team) : "所屬隊伍未載明";
          const repeat = count > 1 ? `<span class="trophy-honor-count">×${count}</span>` : "";
          return `<div class="entity-trophy-honor ${kind}"><span class="trophy-honor-badge" aria-label="${escapeHtml(levelLabel)}">${badge}</span><span class="trophy-honor-copy"><strong>${escapeHtml(honor.honorName)}</strong><span>${affiliation}</span></span>${repeat}<small>${escapeHtml(honorDateLabel(honor, event))}</small></div>`;
        }).join("");
        return `<article class="entity-trophy-card"><div class="entity-trophy-title"><strong>${eventRouteLink(group.name)}</strong></div><div class="entity-trophy-honors">${awards}</div></article>`;
      }).join("");
      const matchRows = playerMatches.map((record) => `<article class="entity-match"><span class="history-date">${escapeHtml(formatDate(record.matchDate))}</span><div><strong>${entityPageLink(record.teamIds?.affirmative, record.teams?.affirmative)} ${escapeHtml(matchScoreLabel(record))} ${entityPageLink(record.teamIds?.negative, record.teams?.negative)}</strong><p>${eventRouteLink(record.competitionName)} · 時段 ${escapeHtml(record.period || "-")} · 會場 ${escapeHtml(record.venue || "-")}</p></div></article>`).join("");
      return `<section class="result-section entity-detail"><button class="event-back-button" type="button" data-detail-back>← 返回上一頁</button><div class="entity-detail-heading"><div><p class="kicker">選手紀錄</p><h2>${escapeHtml(playerName)}的辯論紀錄</h2></div><div><strong>${playerHonors.length}</strong> 項個人榮譽 · <strong>${playerMatches.length}</strong> 場登場紀錄${playerRosters.length ? ` · <strong>${playerRosters.length}</strong> 筆隊伍名單` : ""}</div></div><p class="player-affiliations">${affiliations.length ? affiliations.map((team) => entityPageLink(store.entityForName(team)?.code, team)).join("、") : "部分原始榮譽未載明所屬隊伍"}</p>${playerRosters.length ? `<h3>隊伍名單</h3><div class="history-list">${rosterRows}</div>` : ""}<h3>公開榮譽</h3><div class="entity-trophy-list player-trophy-list">${honorCards || "<p>目前沒有個人公開榮譽。</p>"}</div><h3>登場紀錄</h3><div class="history-list">${matchRows || "<p>目前沒有逐場選手名單；此頁僅列出可查證的個人榮譽。</p>"}</div></section>`;
    }

    function renderTopic(topicId) {
      const linkedEntries = topics.filter((item) => item.topicId === topicId);
      if (!linkedEntries.length) return;
      const title = linkedEntries[0].topic;
      const pageEvents = unique(linkedEntries.map((item) => item.competitionName)).map((name) => ({
        name,
        entry: linkedEntries.find((item) => item.competitionName === name),
      }));
      els.topicPageDetail.innerHTML = `
        <button class="event-back-button" type="button" data-detail-back>← 返回上一頁</button>
        <div class="event-summary"><div><p class="kicker">辯題資料</p><h1>${escapeHtml(title)}</h1></div><div class="event-summary-count"><span class="count-chip">${pageEvents.length} 場賽事</span></div></div>
        <section class="topic-linked-events"><h2 class="subheading">採用此辯題的賽事</h2>${pageEvents.map(({ name, entry }) => `<article class="topic-linked-event"><button class="topic-event-link" type="button" data-event-route="${escapeHtml(name)}">${escapeHtml(name)} →</button>${entry.explanation ? `<details class="topic-explanation" open><summary>此賽事題解</summary><p>${escapeHtml(entry.explanation)}</p></details>` : `<p class="topic-no-explanation">此賽事尚未收錄題解。</p>`}</article>`).join("")}</section>`;
    }

    function renderEntityDetail(entity, detailId = "entityDetail", standalone = false) {
      if (!entity) return "";
      const entityRecords = records.filter((item) => item.teamIds?.affirmative === entity.code || item.teamIds?.negative === entity.code)
        .sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "") || Number(b.period) - Number(a.period));
      const entityHonors = honors.filter((item) => item.teamId === entity.code).sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
      const entityRosters = Object.values(window.DEBATE_PUBLIC_DATA?.eventRosters || {}).flat()
        .filter((roster) => store.entityForName(roster.team)?.code === entity.code);
      const wins = entityRecords.filter((match) => matchResultForEntity(match, entity.code) === "勝").length;
      const participatedEvents = unique([...entityRecords.map((item) => item.competitionName), ...entityHonors.map((item) => item.competitionName), ...entityRosters.map((item) => item.competitionName)]);
      const entityLink = entityPageLink;
      const eventLink = (name, className = "") => `<button type="button" class="entity-event-link ${className}" data-event-route="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
      const matchRows = entityRecords.map((match) => {
        const result = matchResultForEntity(match, entity.code);
        return `<article class="entity-match"><span class="history-date">${escapeHtml(formatDate(match.matchDate))}</span><div><strong>${entityLink(match.teamIds?.affirmative, match.teams?.affirmative)} ${escapeHtml(matchScoreLabel(match))} ${entityLink(match.teamIds?.negative, match.teams?.negative)}</strong><p>${eventLink(match.competitionName)} · 時段 ${escapeHtml(match.period || "-")} · 會場 ${escapeHtml(match.venue || "-")}</p></div><span class="result-badge result-${result === "勝" ? "win" : result === "敗" ? "loss" : "draw"}">${result}</span></article>`;
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
          const levelLabel = kind === "full-course" ? "全程最佳辯士" : kind === "full-course-excellence" ? "全程優秀辯士" : kind === "single-match" ? "單場最佳辯士" : kind === "single-excellence" ? "單場優秀辯士" : honor.honorName;
          return `<div class="entity-trophy-honor ${kind}"><span class="trophy-honor-badge" aria-label="${escapeHtml(levelLabel)}">${badge}</span><span class="trophy-honor-copy"><strong>${escapeHtml(honor.honorName)}</strong><span>${subject}</span></span>${repeat}${date}</div>`;
        }).join("");
        return `<article class="entity-trophy-card"><div class="entity-trophy-title"><strong>${eventLink(group.name)}</strong>${medals}</div>${honorsForEvent ? `<div class="entity-trophy-honors">${honorsForEvent}</div>` : ""}</article>`;
      }).join("");
      const eventsByYear = new Map();
      participatedEvents.forEach((name) => {
        const event = getEvents().find((item) => item.name === name);
        const year = (event?.latestDate || "").slice(0, 4) || "年份未載明";
        eventsByYear.set(year, [...(eventsByYear.get(year) || []), name]);
      });
      const rosterByEvent = new Map(entityRosters.map((roster) => [roster.competitionName, roster]));
      const rosterInEventRecord = (name) => {
        const roster = rosterByEvent.get(name);
        if (!roster) return "";
        const players = roster.players || [];
        return `<details class="entity-event-roster"><summary><span>📋 選手名單</span><span>${players.length} 位</span></summary>${roster.leaders?.length ? `<div><strong>領隊</strong><span>${roster.leaders.map(escapeHtml).join("、")}</span></div>` : ""}${players.length ? `<div><strong>選手</strong><span>${players.map(escapeHtml).join("、")}</span></div>` : ""}</details>`;
      };
      const participatedRows = [...eventsByYear.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([year, names]) => `<section class="entity-event-year"><h4>${escapeHtml(year)}</h4><div class="entity-event-list">${names.map((name) => `<article class="entity-event-entry">${eventLink(name)}${rosterInEventRecord(name)}</article>`).join("")}</div></section>`).join("");
      return `<section id="${detailId}" class="result-section entity-detail">${standalone ? '<button class="event-back-button" type="button" data-detail-back>← 返回上一頁</button>' : ""}<div class="entity-detail-heading"><div><h2>${escapeHtml(entity.name)}的完整紀錄</h2></div><div><strong>${participatedEvents.length}</strong> 個賽事 · <strong>${entityRecords.length}</strong> 場 · <strong>${wins}</strong> 勝 · <strong>${entityHonors.length}</strong> 項榮譽</div></div><h3 class="entity-trophy-heading">獲獎盃賽</h3><div class="entity-trophy-list">${trophyRows || "<p>尚無盃賽名次或榮譽。</p>"}</div><h3>參加賽事</h3><div class="entity-event-years">${participatedRows || "<p>尚無參賽紀錄。</p>"}</div><details class="entity-records-disclosure"><summary><span>所有戰績</span><span>${entityRecords.length} 場</span></summary><div class="history-list">${matchRows || "<p>尚無公開戰績。</p>"}</div></details></section>`;
    }
    return { renderEntityDetail, renderPlayerDetail, renderTopic };
  }

  window.DebateEntityPages = { createEntityPages };
})();
