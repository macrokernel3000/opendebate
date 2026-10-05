(function () {
  function createSearchPages({
    els,
    getEvents,
    getRecords,
    getHonors,
    getTopics,
    getRosters,
    store,
    normalize,
    escapeHtml,
    unique,
    formatDate,
    matchScoreLabel,
    honorSubject,
    honorDateLabel,
    playerRosterEntries,
  }) {
    function getKnownPlayers() {
      const rosterPeople = Object.values(getRosters() || {}).flatMap((entries) =>
        entries.flatMap((roster) => [...(roster.leaders || []), ...(roster.players || [])])
      );
      return unique([
        ...getHonors().filter((item) => item.honorType === "player").map((item) => item.recipient),
        ...getRecords().flatMap((record) => Object.values(record.players || {}).flat()),
        ...rosterPeople,
      ].filter(Boolean));
    }

    function renderSearch(query) {
      const needle = normalize(query);
      if (!needle) {
        els.searchMeta.textContent = "";
        els.searchResults.innerHTML = '<div class="search-empty"><div><span aria-hidden="true">🗂️</span><strong>從一個名字開始</strong><p>學校、隊伍或選手姓名都可以搜尋。</p></div></div>';
        return;
      }

      const records = getRecords();
      const honors = getHonors();
      const topics = getTopics();
      const events = getEvents();
      const allPlayers = getKnownPlayers();
      const matchedEntities = store.entities.filter((entity) => [entity.code, entity.name, ...(entity.aliases || "").split("|")]
        .some((name) => normalize(name).includes(needle)));
      const matchedPlayers = allPlayers.filter((name) => normalize(name).includes(needle));
      const matchedTopics = topics.filter((item) => normalize(`${item.topic} ${item.explanation} ${item.competitionName}`).includes(needle));
      const entityIdSet = new Set(matchedEntities.map((entity) => entity.code));
      const playerSet = new Set(matchedPlayers);
      const matchedRecords = records.filter((item) => entityIdSet.has(item.teamIds?.affirmative) || entityIdSet.has(item.teamIds?.negative))
        .sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
      const matchedHonors = honors.filter((item) => entityIdSet.has(item.teamId) || playerSet.has(item.recipient))
        .sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
      const entityResultCount = matchedEntities.length + matchedPlayers.length;
      const resultCount = entityResultCount + matchedTopics.length;
      els.searchMeta.textContent = resultCount
        ? `找到 ${matchedEntities.length} 個學校／隊伍、${matchedPlayers.length} 位選手、${matchedTopics.length} 筆辯題`
        : `沒有找到「${query}」`;

      const entitySection = entityResultCount ? `<section class="result-section"><h2>符合名稱</h2><div class="entity-grid">
        ${matchedEntities.map((entity) => {
          const games = records.filter((item) => item.teamIds?.affirmative === entity.code || item.teamIds?.negative === entity.code).length;
          const awards = honors.filter((item) => item.teamId === entity.code).length;
          const aliases = (entity.aliases || "").split("|").filter(Boolean);
          return `<button class="entity-card" type="button" data-entity-id="${escapeHtml(entity.code)}"><h3>🏫 ${escapeHtml(entity.name)}</h3><p>${games} 場公開賽果 · ${awards} 筆相關榮譽</p>${aliases.length ? `<small>別名：${aliases.map(escapeHtml).join("、")}</small>` : ""}</button>`;
        }).join("")}
        ${matchedPlayers.map((name) => {
          const personHonors = honors.filter((item) => item.honorType === "player" && item.recipient === name);
          const personRosters = playerRosterEntries(name);
          const teams = unique([...personHonors.map((item) => item.team), ...personRosters.map((roster) => roster.team)].filter(Boolean));
          return `<button type="button" class="entity-card player" data-player-route="${escapeHtml(name)}"><h3><span class="player-icon" aria-hidden="true">🎤</span>${escapeHtml(name)}</h3><p>${escapeHtml(teams.join("、") || "所屬學校未載明")} · ${personHonors.length} 筆榮譽${personRosters.length ? ` · ${personRosters.length} 筆隊伍名單` : ""}</p></button>`;
        }).join("")}
      </div></section>` : "";

      const topicMatches = [...new Map(matchedTopics.map((item) => [item.topicId, {
        ...item,
        entries: matchedTopics.filter((candidate) => candidate.topicId === item.topicId),
      }])).values()];
      const topicSection = topicMatches.length ? `<section class="result-section"><h2>符合辯題</h2><div class="overview-topic-list search-topic-list">${topicMatches.map((item) => `<article class="overview-topic-card"><span>${item.entries.length} 場賽事</span><button class="topic-title-link" type="button" data-topic-route="${escapeHtml(item.topicId)}">${escapeHtml(item.topic)}</button>${item.entries.map((entry) => `<button class="topic-event-link" type="button" data-event-route="${escapeHtml(entry.competitionName)}">${escapeHtml(entry.competitionName)} →</button>`).join("")}</article>`).join("")}</div></section>` : "";

      const histories = [
        ...matchedRecords.map((item) => ({
          date: item.matchDate,
          title: `${item.teams?.affirmative || "正方"} ${matchScoreLabel(item)} ${item.teams?.negative || "反方"}`,
          meta: item.competitionName,
          badge: item.note || "比賽",
        })),
        ...matchedHonors.map((item) => ({
          date: item.matchDate,
          dateLabel: honorDateLabel(item, events.find((event) => event.name === item.competitionName) || { records: [], dates: [], metadata: {} }),
          title: `${item.honorName}｜${honorSubject(item)}`,
          meta: `${item.competitionName}${item.team ? ` · ${item.team}` : ""}`,
          badge: "榮譽",
        })),
      ].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30);

      const historySection = histories.length ? `<section class="result-section"><h2>最近紀錄</h2><div class="history-list">${histories.map((item) => `<article class="history-item"><span class="history-date">${escapeHtml(item.dateLabel || formatDate(item.date))}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.meta || "")}</p></div><span class="history-badge">${escapeHtml(item.badge)}</span></article>`).join("")}</div></section>` : "";
      const content = entitySection + topicSection + historySection;
      els.searchResults.innerHTML = content || '<div class="search-empty"><div><span aria-hidden="true">🤔</span><strong>目前沒有相符資料</strong><p>可以縮短關鍵字再試一次。</p></div></div>';
    }

    return { renderSearch, getKnownPlayers };
  }

  window.DebateSearchPages = { createSearchPages };
}());
