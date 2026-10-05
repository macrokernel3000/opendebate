(function () {
  function createOverviewPages({ els, getEvents, getTopics, getRecords, getHonors, store, normalize, unique, formatDate, escapeHtml, matchResultForEntity }) {
    function monthKeyFromDate(value) {
      return /^\d{4}-\d{2}/.test(value || "") ? value.slice(0, 7) : "";
    }

    function renderOverviewStats() {
      const events = getEvents();
      if (!els.overviewStatsChart) return;
      const eventCounts = new Map();
      const teamEntriesByMonth = new Map();
      const eventMonthByName = new Map();
      const unitsByEvent = new Map();
      const teamEntriesByEvent = new Map();
      events.forEach((event) => {
        const eventMonth = monthKeyFromDate(event.metadata?.startDate)
          || event.dates.map(monthKeyFromDate).find(Boolean)
          || monthKeyFromDate(event.latestDate);
        if (eventMonth) {
          eventMonthByName.set(event.name, eventMonth);
          eventCounts.set(eventMonth, (eventCounts.get(eventMonth) || 0) + 1);
        }
        const eventTeams = new Set();
        const eventUnits = new Set();
        event.records.forEach((record) => {
          Object.entries(record.teams || {}).forEach(([side, teamName]) => {
            if (!teamName) return;
            eventTeams.add(normalize(teamName));
            eventUnits.add(record.teamIds?.[side] || normalize(teamName));
          });
        });
        teamEntriesByEvent.set(event.name, eventTeams);
        unitsByEvent.set(event.name, eventUnits);
        if (eventMonth && eventTeams.size) teamEntriesByMonth.set(eventMonth, (teamEntriesByMonth.get(eventMonth) || 0) + eventTeams.size);
      });
      const current = new Date();
      const currentYear = current.getFullYear();
      const currentMonthNumber = current.getMonth() + 1;
      const years = [...new Set([...eventMonthByName.values()].map((month) => Number(month.slice(0, 4))))]
        .filter((year) => year <= currentYear).sort((a, b) => a - b);
      const focusedYear = els.overviewStatsYears.contains(document.activeElement) ? Number(document.activeElement.value) : null;
      const existingChecks = [...els.overviewStatsYears.querySelectorAll("input:checked")].map((input) => Number(input.value));
      const previouslyAvailable = [...els.overviewStatsYears.querySelectorAll("input")].map((input) => Number(input.value));
      const selectedYears = previouslyAvailable.length
        ? existingChecks.filter((year) => years.includes(year))
        : years.slice(-2);
      const palette = ["#176b55", "#e66b58", "#4f76a8", "#b28220", "#8061a5", "#278c89", "#9a654b", "#637a45"];
      const yearColor = (year) => palette[Math.max(0, years.indexOf(year)) % palette.length];
      els.overviewStatsYears.innerHTML = years.map((year) => `<label class="overview-year-toggle"><input type="checkbox" value="${year}"${selectedYears.includes(year) ? " checked" : ""} /><i style="--year-color:${yearColor(year)}"></i><span>${year}</span></label>`).join("");
      if (focusedYear !== null) els.overviewStatsYears.querySelector(`input[value="${focusedYear}"]`)?.focus({ preventScroll: true });
      const allEventTotals = new Map();
      const allTeamEntryTotals = new Map();
      const allUniqueUnitsByYear = new Map();
      eventMonthByName.forEach((month, eventName) => {
        const year = Number(month.slice(0, 4));
        const monthNumber = Number(month.slice(5, 7));
        if (year === currentYear && monthNumber > currentMonthNumber) return;
        allEventTotals.set(year, (allEventTotals.get(year) || 0) + 1);
        const teamEntries = teamEntriesByEvent.get(eventName) || new Set();
        const units = unitsByEvent.get(eventName) || new Set();
        allTeamEntryTotals.set(year, (allTeamEntryTotals.get(year) || 0) + teamEntries.size);
        if (!allUniqueUnitsByYear.has(year)) allUniqueUnitsByYear.set(year, new Set());
        units.forEach((unitKey) => allUniqueUnitsByYear.get(year).add(unitKey));
      });
      const metric = els.overviewStatsMetric.value;
      const isTeamMetric = metric === "teams";
      const metricName = isTeamMetric ? "每月參賽隊次" : "每月賽事數";
      const months = Array.from({ length: 12 }, (_, index) => index + 1);
      const yearValues = (year) => months.map((month) => {
        if (year === currentYear && month > currentMonthNumber) return null;
        const key = `${year}-${String(month).padStart(2, "0")}`;
        return isTeamMetric ? (teamEntriesByMonth.get(key) || 0) : (eventCounts.get(key) || 0);
      });
      const summaryItems = [
        ["賽事數", "場", allEventTotals],
        ["參賽隊次", "次", allTeamEntryTotals],
        ["不重複單位", "個", allUniqueUnitsByYear],
      ];
      els.overviewStatsSummary.innerHTML = selectedYears.length ? summaryItems.map(([label, unit, totals]) => {
        const values = selectedYears.map((year) => {
          const rawValue = totals.get(year);
          const value = rawValue instanceof Set ? rawValue.size : rawValue || 0;
          return `<div class="overview-stats-year-value"><i style="--year-color:${yearColor(year)}"></i><span>${year}</span><strong>${value}<small>${unit}</small></strong></div>`;
        }).join("");
        return `<article class="overview-stats-card"><span>${label}</span><div class="overview-stats-year-values">${values}</div></article>`;
      }).join("") : "";
      const selectedLabel = selectedYears.length ? `已選 ${selectedYears.join("、")} 年` : "請至少勾選一個年度";
      els.overviewStatsMeta.textContent = `${selectedLabel}　·　一月至十二月；今年尚未到的月份留白`;
      if (!selectedYears.length) {
        els.overviewStatsChart.innerHTML = '<p class="overview-stats-empty">勾選年度後即可比較逐月變化。</p>';
        return;
      }

      const width = 960;
      const height = 350;
      const plot = { left: 70, right: 28, top: 24, bottom: 62 };
      const plotWidth = width - plot.left - plot.right;
      const plotHeight = height - plot.top - plot.bottom;
      const series = selectedYears.map((year) => ({ year, values: yearValues(year), color: yearColor(year) }));
      const peak = Math.max(0, ...series.flatMap(({ values }) => values.filter((value) => value !== null)));
      const step = Math.max(1, Math.ceil(peak / 4));
      const maxY = step * 4;
      const makePoints = (values, year) => values.map((value, index) => ({
        x: plot.left + (index / (months.length - 1)) * plotWidth,
        y: value === null ? null : plot.top + plotHeight - (value / maxY) * plotHeight,
        value,
        month: months[index],
        year,
      }));
      const grid = Array.from({ length: 5 }, (_, index) => {
        const value = maxY - index * step;
        const y = plot.top + (index / 4) * plotHeight;
        return `<g class="overview-chart-tick"><line x1="${plot.left}" y1="${y}" x2="${width - plot.right}" y2="${y}" /><text x="${plot.left - 14}" y="${y + 4}" text-anchor="end">${value}</text></g>`;
      }).join("");
      const summerStartX = plot.left + (5.5 / 11) * plotWidth;
      const summerEndX = plot.left + (7.5 / 11) * plotWidth;
      const summerBand = `<rect class="overview-chart-summer" x="${summerStartX}" y="${plot.top}" width="${summerEndX - summerStartX}" height="${plotHeight}" rx="6" /><text class="overview-chart-summer-label" x="${(summerStartX + summerEndX) / 2}" y="${plot.top + 14}" text-anchor="middle">暑假</text>`;
      const xLabels = months.map((month, index) => `<text class="overview-chart-x-label" x="${plot.left + (index / 11) * plotWidth}" y="${height - 22}" text-anchor="middle">${month}月</text>`).join("");
      const makePath = (points) => {
        let path = "";
        let isSegmentStart = true;
        points.forEach((point) => {
          if (point.value === null) { isSegmentStart = true; return; }
          path += `${isSegmentStart ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)} `;
          isSegmentStart = false;
        });
        return path.trim();
      };
      const lines = series.map(({ year, values, color }) => {
        const points = makePoints(values, year);
        const safeColor = escapeHtml(color);
        const line = `<path class="overview-chart-line" style="--year-color:${safeColor}" d="${makePath(points)}" />`;
        const circles = points.filter((point) => point.value !== null).map((point) => `<circle class="overview-chart-point" style="--year-color:${safeColor}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"><title>${point.year} 年 ${point.month} 月：${point.value} ${isTeamMetric ? "隊次" : "場"}</title></circle>`).join("");
        return `${line}${circles}`;
      }).join("");
      const title = `${metricName}年度趨勢折線圖`;
      const desc = `顯示勾選年度的一月至十二月逐月資料；當年度未到月份留白，7、8 月以淡金底標示暑假。參賽隊次按賽事中的隊伍原名去重，同校 A、B 隊分開計；不重複單位則按學校／隊伍資料庫歸戶後跨賽事去重。`;
      els.overviewStatsChart.setAttribute("role", "region");
      els.overviewStatsChart.setAttribute("tabindex", "0");
      els.overviewStatsChart.setAttribute("aria-label", `${title}，可左右捲動查看月份`);
      els.overviewStatsChart.innerHTML = `<svg class="overview-stats-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="overviewChartTitle overviewChartDesc"><title id="overviewChartTitle">${escapeHtml(title)}</title><desc id="overviewChartDesc">${escapeHtml(desc)}</desc>${summerBand}${grid}<line class="overview-chart-axis" x1="${plot.left}" y1="${plot.top + plotHeight}" x2="${width - plot.right}" y2="${plot.top + plotHeight}" />${lines}${xLabels}</svg>`;
    }

    function renderEventOptions() {
      const events = getEvents();
      const years = unique(events.map((event) => event.latestDate.slice(0, 4))).sort((a, b) => b.localeCompare(a));
      els.eventYear.innerHTML = '<option value="">全部年份</option>' + years.map((year) => `<option value="${year}">${year} 年</option>`).join("");
      renderEventFinder();
    }

    function renderEventFinder() {
      const events = getEvents();
      const needle = normalize(els.eventSearch.value);
      const year = els.eventYear.value;
      const filtered = events.filter((event) => {
        const matchesYear = !year || event.latestDate.startsWith(year);
        const topicText = event.topics.flatMap((item) => [item.topic, item.explanation]).join(" ");
        return matchesYear && (!needle || normalize(`${event.name} ${topicText}`).includes(needle));
      });
      const isMobileTimeline = window.matchMedia("(max-width: 640px)").matches;
      const sortBy = els.eventSortBy?.value || "year";
      const sortDirection = els.eventSortDirection?.value === "asc" ? 1 : -1;
      const sortedEvents = [...filtered].sort((a, b) => {
        const comparison = sortBy === "teams" ? a.teamCount - b.teamCount
          : sortBy === "honors" ? a.honors.length - b.honors.length
            : (a.latestDate || "").localeCompare(b.latestDate || "");
        return comparison * sortDirection || (b.latestDate || "").localeCompare(a.latestDate || "") || a.name.localeCompare(b.name, "zh-Hant");
      });
      const visibleEvents = sortedEvents;
      els.eventFinderMeta.textContent = `找到 ${visibleEvents.length} 個賽事`;
      let previousAxisValue = null;
      const timelineCards = visibleEvents.map((event, index) => {
        const eventYear = event.latestDate?.slice(0, 4) || "年份未載明";
        const axisValue = sortBy === "teams" ? event.teamCount
          : sortBy === "honors" ? event.honors.length
            : eventYear;
        const axisLabel = sortBy === "teams" ? `${axisValue} 隊`
          : sortBy === "honors" ? `${axisValue} 項榮譽`
            : `${axisValue}${axisValue === "年份未載明" ? "" : " 年"}`;
        const axisMarker = isMobileTimeline && sortBy === "year" && axisValue !== previousAxisValue
          ? `<div class="event-year-divider"><span>${escapeHtml(axisLabel)}</span></div>`
          : "";
        const axisLabelAttribute = isMobileTimeline && sortBy !== "year" && axisValue !== previousAxisValue
          ? ` data-axis-label="${escapeHtml(axisLabel)}"`
          : "";
        previousAxisValue = axisValue;
        const dateLabel = isMobileTimeline ? (event.latestDate ? formatDate(event.latestDate) : "日期未載明") : eventYear;
        const side = index % 2 === 0 ? "left" : "right";
        return `${axisMarker}<button class="event-result-card" type="button" data-event-name="${escapeHtml(event.name)}" data-timeline-side="${side}"${axisLabelAttribute}>
          <span class="event-result-year">${escapeHtml(dateLabel)}</span>
          <strong>${escapeHtml(event.name)}</strong>
          <small>${event.teamCount} 隊 · ${event.records.length} 場 · ${event.honors.length} 榮譽</small>
        </button>`;
      }).join("");
      els.eventFinderResults.innerHTML = timelineCards || '<div class="event-finder-empty">沒有符合的賽事，請縮短關鍵字或切換年份。</div>';
    }

    function renderOverview() {
      const events = getEvents();
      const topics = getTopics();
      els.overviewEventCount.textContent = events.length;
      els.overviewTeamCount.textContent = overviewTeams().length;
      els.overviewTopicCount.textContent = new Set(topics.map((item) => item.topicId)).size;
      renderOverviewTeams();
      renderOverviewTopics();
      renderOverviewStats();
    }

    function overviewTeams() {
      const records = getRecords();
      const honors = getHonors();
      const rows = new Map();
      const ensure = (name, code = "") => {
        const entity = (code && store.entityById.get(code)) || store.entityForName(name);
        if (!entity) return null;
        if (!rows.has(entity.code)) rows.set(entity.code, { entity, matches: 0, wins: 0, honors: 0, events: new Set() });
        return rows.get(entity.code);
      };
      records.forEach((record) => {
        [[record.teams?.affirmative, record.teamIds?.affirmative], [record.teams?.negative, record.teamIds?.negative]].forEach(([name, code]) => {
          const row = ensure(name, code);
          if (!row) return;
          row.matches += 1;
          row.events.add(record.competitionName);
          if (matchResultForEntity(record, row.entity.code) === "勝") row.wins += 1;
        });
      });
      honors.forEach((honor) => {
        const row = ensure(honor.team, honor.teamId);
        if (!row) return;
        row.honors += 1;
        row.events.add(honor.competitionName);
      });
      const rosterEntries = Object.values(window.DEBATE_PUBLIC_DATA?.eventRosters || {}).flat();
      rosterEntries.forEach((roster) => {
        const row = ensure(roster.team);
        if (row) row.events.add(roster.competitionName);
      });
      return [...rows.values()];
    }

    function renderOverviewTeams() {
      const needle = normalize(els.overviewTeamFilter.value);
      const sortBy = els.overviewTeamSortBy.value;
      const direction = els.overviewTeamSortDirection.value === "asc" ? 1 : -1;
      const filtered = overviewTeams().filter((row) => !needle || normalize(`${row.entity.name} ${row.entity.code} ${row.entity.aliases || ""}`).includes(needle))
        .sort((a, b) => {
          const comparison = sortBy === "name"
            ? a.entity.name.localeCompare(b.entity.name, "zh-Hant")
            : (sortBy === "events" ? a.events.size : a[sortBy]) - (sortBy === "events" ? b.events.size : b[sortBy]);
          return comparison * direction || a.entity.name.localeCompare(b.entity.name, "zh-Hant");
        });
      const schools = filtered.filter((row) => row.entity.type === "s");
      const teams = filtered.filter((row) => row.entity.type !== "s");
      els.overviewTeamMeta.textContent = `目前顯示 ${schools.length} 所學校、${teams.length} 支隊伍`;
      const renderCards = (rows, kind) => rows.length ? rows.map((row) => `
        <button class="overview-team-card ${kind}" type="button" data-overview-team-id="${escapeHtml(row.entity.code)}">
          <strong>${escapeHtml(row.entity.name)}</strong>
          <small>${row.matches} 場 · ${row.wins} 勝 · ${row.events.size} 個賽事 · ${row.honors} 項榮譽</small>
        </button>`).join("") : '<p class="overview-empty-group">目前沒有符合項目。</p>';
      els.overviewTeamList.innerHTML = `
        <section class="overview-entity-group school-group" aria-labelledby="overviewSchoolGroupTitle">
          <h3 id="overviewSchoolGroupTitle">學校 <span>${schools.length}</span></h3>
          <div class="overview-entity-list">${renderCards(schools, "school")}</div>
        </section>
        <section class="overview-entity-group team-group" aria-labelledby="overviewTeamGroupTitle">
          <h3 id="overviewTeamGroupTitle">隊伍 <span>${teams.length}</span></h3>
          <div class="overview-entity-list">${renderCards(teams, "team")}</div>
        </section>`;
    }

    function renderOverviewTopics() {
      const topics = getTopics();
      const needle = normalize(els.overviewTopicFilter.value);
      const topicGroups = [...new Map(topics.map((item) => [item.topicId, { ...item, entries: topics.filter((candidate) => candidate.topicId === item.topicId) }])).values()];
      const filteredTopics = topicGroups.filter((item) => !needle || normalize(`${item.topic} ${item.entries.map((entry) => `${entry.explanation} ${entry.competitionName}`).join(" ")}`).includes(needle));
      els.overviewTopicMeta.textContent = `目前顯示 ${filteredTopics.length} 個辯題`;
      els.overviewTopicList.innerHTML = filteredTopics.length ? [...filteredTopics]
        .sort((a, b) => a.topic.localeCompare(b.topic, "zh-Hant"))
        .map((item) => `<article class="overview-topic-card"><span>${item.entries.length} 場賽事</span><button class="topic-title-link" type="button" data-topic-route="${escapeHtml(item.topicId)}">${escapeHtml(item.topic)}</button>${item.entries.map((entry) => `<button class="topic-event-link" type="button" data-event-route="${escapeHtml(entry.competitionName)}">${escapeHtml(entry.competitionName)} →</button>`).join("")}</article>`).join("")
        : '<div class="search-empty"><div><span aria-hidden="true">💬</span><strong>沒有符合的辯題</strong><p>請縮短關鍵字再試一次。</p></div></div>';
    }

    function showOverviewTab(tabName) {
      const target = ["events", "teams", "topics", "stats"].includes(tabName) ? tabName : "events";
      els.overviewTabs.forEach((tab) => {
        const active = tab.dataset.overviewTab === target;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      els.overviewEventsPanel.classList.toggle("is-hidden", target !== "events");
      els.overviewTeamsPanel.classList.toggle("is-hidden", target !== "teams");
      els.overviewTopicsPanel.classList.toggle("is-hidden", target !== "topics");
      els.overviewStatsPanel.classList.toggle("is-hidden", target !== "stats");
      if (target === "stats") renderOverviewStats();
    }

    return { renderEventOptions, renderEventFinder, renderOverview, renderOverviewStats, renderOverviewTeams, renderOverviewTopics, showOverviewTab };
  }

  window.DebateOverviewPages = { createOverviewPages };
})();
