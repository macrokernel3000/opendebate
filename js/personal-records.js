(function () {
  const STORAGE_KEY = "opendebate.personal-records.v1";
  const CSV_HEADERS = ["盃賽", "此盃第幾場", "比賽日期", "姓名", "裁判姓名", "論點分", "論點滿分", "申論", "申論滿分", "質詢", "質詢滿分", "答辯", "答辯滿分", "結辯", "結辯滿分", "排名", "建立時間"];
  const METRICS = [
    { key: "argument", label: "論點", maxKey: "argumentMax", defaultMax: 10, color: "#ef654f" },
    { key: "speech", label: "申論", maxKey: "speechMax", defaultMax: 20, color: "#176b52" },
    { key: "question", label: "質詢", maxKey: "questionMax", defaultMax: 20, color: "#2c8c88" },
    { key: "defense", label: "答辯", maxKey: "defenseMax", defaultMax: 20, color: "#8b6bb5" },
    { key: "closing", label: "結辯", maxKey: "closingMax", defaultMax: 10, color: "#c59316" },
  ];
  const CHART_METRICS = METRICS.filter((metric) => ["speech", "question", "defense"].includes(metric.key));
  let initialized = false;
  let records = [];
  let eventNames = [];
  let eventDateByName = new Map();
  let editingId = "";
  let expandedChartTrigger = null;
  let activeCompetitionIndex = -1;
  let els = {};

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function defaultJulyDate(year = new Date().getFullYear()) {
    return `${year}-07-01`;
  }

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function normalizeRecord(record) {
    const createdYear = String(record.createdAt || "").slice(0, 4);
    const normalized = { ...record };
    METRICS.forEach((metric) => { normalized[metric.maxKey] = positiveNumber(record[metric.maxKey], metric.defaultMax); });
    normalized.matchDate = record.matchDate || eventDateByName.get(record.competition) || defaultJulyDate(/^\d{4}$/.test(createdYear) ? createdYear : undefined);
    return normalized;
  }

  function readRecords() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(stored) ? stored.map(normalizeRecord) : [];
    } catch (_error) {
      return [];
    }
  }

  function saveRecords(nextRecords) {
    if (!window.DebateRecordStorage.save(localStorage, STORAGE_KEY, nextRecords)) {
      showMessage("瀏覽器無法儲存資料，請先下載 CSV，並確認未使用限制儲存的模式。", true);
      return false;
    }
    records = nextRecords;
    return true;
  }

  function fieldNumber(element) {
    if (!element || element.value === "") return "";
    const value = Number(element.value);
    return Number.isFinite(value) ? value : "";
  }

  function getDraft(existingRecord = null) {
    return {
      id: existingRecord?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      competition: els.competition.value.trim(),
      matchNumber: fieldNumber(els.matchNumber),
      matchDate: els.matchDate.value || defaultJulyDate(),
      name: els.name.value.trim(),
      judge: els.judge.value.trim(),
      argument: fieldNumber(els.argument),
      argumentMax: positiveNumber(els.argumentMax.value, 10),
      speech: fieldNumber(els.speech),
      speechMax: positiveNumber(els.speechMax.value, 20),
      question: fieldNumber(els.question),
      questionMax: positiveNumber(els.questionMax.value, 20),
      defense: fieldNumber(els.defense),
      defenseMax: positiveNumber(els.defenseMax.value, 20),
      closing: fieldNumber(els.closing),
      closingMax: positiveNumber(els.closingMax.value, 10),
      rank: fieldNumber(els.rank),
      createdAt: existingRecord?.createdAt || new Date().toISOString(),
    };
  }

  function setInputValue(element, value) {
    element.value = value === "" || value === null || value === undefined ? "" : String(value);
  }

  function exitEditMode({ clearForm = false } = {}) {
    editingId = "";
    els.nextButton.disabled = false;
    els.cancelEdit.classList.add("is-hidden");
    els.submitButton.textContent = "輸入完成";
    if (!clearForm) return;
    [els.competition, els.matchNumber, els.name, els.judge, els.argument, els.speech, els.question, els.defense, els.closing].forEach((input) => { input.value = ""; });
    els.matchDate.value = defaultJulyDate();
    METRICS.forEach((metric) => { els[metric.maxKey].value = String(metric.defaultMax); });
    els.rank.value = "";
  }

  function startEdit(recordId) {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    editingId = recordId;
    setInputValue(els.competition, record.competition);
    setInputValue(els.matchNumber, record.matchNumber);
    setInputValue(els.matchDate, record.matchDate);
    setInputValue(els.name, record.name);
    setInputValue(els.judge, record.judge);
    setInputValue(els.argument, record.argument);
    setInputValue(els.argumentMax, record.argumentMax);
    setInputValue(els.speech, record.speech);
    setInputValue(els.speechMax, record.speechMax);
    setInputValue(els.question, record.question);
    setInputValue(els.questionMax, record.questionMax);
    setInputValue(els.defense, record.defense);
    setInputValue(els.defenseMax, record.defenseMax);
    setInputValue(els.closing, record.closing);
    setInputValue(els.closingMax, record.closingMax);
    setInputValue(els.rank, record.rank);
    els.nextButton.disabled = true;
    els.cancelEdit.classList.remove("is-hidden");
    els.submitButton.textContent = "儲存修正";
    showMessage("正在修正這一場，儲存後會更新原紀錄。", false);
    els.form.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function resetForNextMatch() {
    els.judge.focus();
  }

  function addDraft({ continueEntry = false } = {}) {
    if (!window.DebateRecordStorage.isValid(els.form)) return;
    if (editingId) {
      const index = records.findIndex((record) => record.id === editingId);
      if (index < 0) return;
      const nextRecords = [...records];
      nextRecords[index] = getDraft(records[index]);
      if (!saveRecords(nextRecords)) return;
      exitEditMode({ clearForm: true });
      render();
      showMessage("修正已儲存，原紀錄已更新。", false);
      return;
    }
    const draft = getDraft();
    if (!saveRecords([...records, draft])) return;
    render();
    const current = draft;
    const sameMatchCount = current?.matchNumber === "" ? 1 : records.filter((record) => record.competition === current.competition && String(record.matchNumber) === String(current.matchNumber)).length;
    const ballotWarning = sameMatchCount > 3 ? `提醒：這個盃賽第 ${current.matchNumber} 場已有 ${sameMatchCount} 張裁單；系統仍已保留本張資料。` : "";
    showMessage(ballotWarning || (continueEntry ? "這一張已暫存，所有欄位都已保留，可以直接調整下一張。" : "輸入完成，平均分數已更新。"), false);
    if (continueEntry) resetForNextMatch();
    else document.querySelector("#recordSummaryTitle")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function average(key) {
    const values = records.filter((record) => record[key] !== "" && record[key] !== null && record[key] !== undefined)
      .map((record) => Number(record[key])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function formatAverage(value) {
    return value === null ? "—" : Number(value.toFixed(2)).toString();
  }

  function formatScore(value) {
    return value === "" || value === null || value === undefined ? "—" : String(value);
  }

  function hasScore(record, key) {
    return record[key] !== "" && record[key] !== null && record[key] !== undefined && Number.isFinite(Number(record[key]));
  }

  function scorePercent(record, metric) {
    if (!hasScore(record, metric.key)) return null;
    const maximum = positiveNumber(record[metric.maxKey], metric.defaultMax);
    return Math.max(0, Math.min(100, Number(record[metric.key]) / maximum * 100));
  }

  function averagePercent(metric) {
    const values = records.map((record) => scorePercent(record, metric)).filter((value) => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function formatPercent(value) {
    return value === null ? "—" : `${Number(value.toFixed(1))}%`;
  }

  function formatScorePair(record, metric) {
    if (!hasScore(record, metric.key)) return "—";
    return `${formatScore(record[metric.key])} / ${formatScore(positiveNumber(record[metric.maxKey], metric.defaultMax))}`;
  }

  function polarPoint(index, count, radius, center = 170) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
  }

  function renderRadarChart() {
    const active = CHART_METRICS.map((metric) => ({ ...metric, value: averagePercent(metric) })).filter((metric) => metric.value !== null);
    if (active.length < 3) {
      els.radarChart.innerHTML = '<div class="record-chart-empty"><strong>需要申論、質詢、答辯三項分數</strong><p>三項都有資料後，這裡會形成三角能力雷達圖。</p></div>';
      window.DebateInteractions.setChartExpansionAvailability(els.radarChart, false, "資料不足，需三項分數才能放大能力雷達圖");
      return;
    }
    const grid = [20, 40, 60, 80, 100].map((level) => `<polygon points="${active.map((_, index) => { const point = polarPoint(index, active.length, 110 * level / 100); return `${point.x},${point.y}`; }).join(" ")}" />`).join("");
    const axes = active.map((metric, index) => {
      const point = polarPoint(index, active.length, 110);
      const label = polarPoint(index, active.length, 142);
      const anchor = label.x < 155 ? "end" : label.x > 185 ? "start" : "middle";
      return `<line x1="170" y1="170" x2="${point.x}" y2="${point.y}" /><text x="${label.x}" y="${label.y}" text-anchor="${anchor}">${escapeHtml(metric.label)} ${formatPercent(metric.value)}</text>`;
    }).join("");
    const dataPoints = active.map((metric, index) => { const point = polarPoint(index, active.length, 110 * metric.value / 100); return `${point.x},${point.y}`; }).join(" ");
    els.radarChart.innerHTML = `<svg class="radar-svg" viewBox="0 0 340 340" role="img" aria-label="${active.length} 維能力雷達圖"><g class="radar-grid">${grid}${axes}</g><polygon class="radar-data" points="${dataPoints}" />${active.map((metric, index) => { const point = polarPoint(index, active.length, 110 * metric.value / 100); return `<circle cx="${point.x}" cy="${point.y}" r="4" />`; }).join("")}</svg>`;
    window.DebateInteractions.setChartExpansionAvailability(els.radarChart, true, "");
  }

  function renderProgressChart() {
    const matchGroups = new Map();
    records.forEach((record) => {
      const key = record.matchNumber === "" || record.matchNumber === null || record.matchNumber === undefined ? `single:${record.id}` : `${record.competition}|${record.matchNumber}`;
      if (!matchGroups.has(key)) matchGroups.set(key, []);
      matchGroups.get(key).push(record);
    });
    const chronological = [...matchGroups.values()].map((ballots) => {
      const values = {};
      CHART_METRICS.forEach((metric) => {
        const scores = ballots.map((record) => scorePercent(record, metric)).filter((value) => value !== null);
        values[metric.key] = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
      });
      return { matchDate: ballots.map((record) => record.matchDate).filter(Boolean).sort()[0] || "", createdAt: ballots[0]?.createdAt || "", values };
    }).filter((match) => match.matchDate).sort((a, b) => a.matchDate.localeCompare(b.matchDate) || String(a.createdAt).localeCompare(String(b.createdAt)));
    if (chronological.length < 2) {
      els.progressChart.innerHTML = '<div class="record-chart-empty"><strong>至少需要兩場紀錄</strong><p>累積下一場後，這裡會依日期顯示申論、質詢與答辯趨勢。</p></div>';
      window.DebateInteractions.setChartExpansionAvailability(els.progressChart, false, "資料不足，需兩場紀錄才能放大進步折線圖");
      return;
    }
    const hasTrend = CHART_METRICS.some((metric) => chronological.filter((match) => match.values[metric.key] !== null).length >= 2);
    if (!hasTrend) {
      els.progressChart.innerHTML = '<div class="record-chart-empty"><strong>至少需要兩場同項分數</strong><p>任一評分項目累積兩場資料後，這裡會顯示分數變化。</p></div>';
      window.DebateInteractions.setChartExpansionAvailability(els.progressChart, false, "資料不足，需兩場同項分數才能放大進步折線圖");
      return;
    }
    const width = 720;
    const height = 300;
    const left = 46;
    const right = 18;
    const top = 22;
    const bottom = 48;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const xFor = (index) => left + (chronological.length === 1 ? plotWidth / 2 : index * plotWidth / (chronological.length - 1));
    const yFor = (value) => top + plotHeight - value / 100 * plotHeight;
    const grid = [0, 25, 50, 75, 100].map((value) => `<line x1="${left}" y1="${yFor(value)}" x2="${width - right}" y2="${yFor(value)}" /><text x="${left - 8}" y="${yFor(value) + 4}" text-anchor="end">${value}%</text>`).join("");
    const series = CHART_METRICS.map((metric) => {
      const points = chronological.map((match, index) => ({ value: match.values[metric.key], x: xFor(index) })).filter((point) => point.value !== null);
      if (!points.length) return "";
      const polyline = points.length > 1 ? `<polyline points="${points.map((point) => `${point.x},${yFor(point.value)}`).join(" ")}" style="stroke:${metric.color}" />` : "";
      return `${polyline}${points.map((point) => `<circle cx="${point.x}" cy="${yFor(point.value)}" r="4" style="fill:${metric.color}" />`).join("")}`;
    }).join("");
    const dateLabels = chronological.map((record, index) => `<text x="${xFor(index)}" y="${height - 18}" text-anchor="middle">${escapeHtml(record.matchDate.slice(5).replace("-", "/"))}</text>`).join("");
    const legend = CHART_METRICS.filter((metric) => chronological.some((match) => match.values[metric.key] !== null)).map((metric) => `<span><i style="background:${metric.color}"></i>${metric.label}</span>`).join("");
    els.progressChart.innerHTML = `<div class="progress-legend">${legend}</div><div class="progress-scroll"><svg class="progress-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="依日期排列的分數進步折線圖"><g class="progress-grid">${grid}</g><g class="progress-series">${series}</g><g class="progress-dates">${dateLabels}</g></svg></div>`;
    window.DebateInteractions.setChartExpansionAvailability(els.progressChart, true, "");
  }

  function renderBallot(record, index) {
    return `<article class="personal-record-item">
      <div class="personal-record-title"><div><span>第 ${index + 1} 張${record.rank ? ` · 排名 ${escapeHtml(record.rank)}` : ""} · ${escapeHtml(record.matchDate || "日期未填")}</span><strong>${escapeHtml(record.judge || "未填裁判")}</strong><small>${escapeHtml(record.name || "未填姓名")}</small></div><div class="personal-record-controls"><button type="button" data-edit-record="${escapeHtml(record.id)}" aria-label="修正第 ${index + 1} 張">修正</button><button type="button" data-delete-record="${escapeHtml(record.id)}" aria-label="刪除第 ${index + 1} 張">刪除</button></div></div>
      <div class="personal-record-scores">${METRICS.map((metric) => `<span>${metric.label} <b>${formatScorePair(record, metric)}</b></span>`).join("")}</div>
    </article>`;
  }

  function renderRecordGroups() {
    if (!records.length) return '<div class="record-empty"><span aria-hidden="true">✍️</span><strong>還沒有裁單紀錄</strong><p>輸入一張裁單，或匯入之前下載的 CSV。</p></div>';
    const groups = new Map();
    records.forEach((record, index) => {
      const key = record.matchNumber === "" || record.matchNumber === null || record.matchNumber === undefined ? `single:${record.id}` : `${record.competition}|${record.matchNumber}`;
      if (!groups.has(key)) groups.set(key, { competition: record.competition, matchNumber: record.matchNumber, items: [], latestIndex: index });
      const group = groups.get(key);
      group.items.push({ record, index });
      group.latestIndex = index;
    });
    return [...groups.values()].sort((a, b) => b.latestIndex - a.latestIndex).map((group) => `<section class="ballot-group">
      <div class="ballot-group-heading"><div><span>${escapeHtml(group.competition || "未填盃賽")}</span><strong>${group.matchNumber === "" ? "場次未填" : `第 ${escapeHtml(group.matchNumber)} 場`}</strong></div><small>${group.items.length} 張裁單${group.items.length > 3 ? " · 超過一般三張" : ""}</small></div>
      <div class="ballot-group-list">${[...group.items].reverse().map(({ record, index }) => renderBallot(record, index)).join("")}</div>
    </section>`).join("");
  }

  function render() {
    const eventKeys = new Set(records.filter((record) => record.matchNumber !== "" && record.matchNumber !== undefined).map((record) => `${record.competition}|${record.matchNumber}`));
    els.count.textContent = `${eventKeys.size} 場 · ${records.length} 張`;
    els.draftStatus.textContent = `第 ${records.length + 1} 張`;
    els.stats.innerHTML = `
      <article class="record-stat record-stat-primary"><span>平均申論分</span><strong>${formatAverage(average("speech"))}</strong></article>
      <article class="record-stat"><span>平均質詢分</span><strong>${formatAverage(average("question"))}</strong></article>
      <article class="record-stat"><span>平均答辯分</span><strong>${formatAverage(average("defense"))}</strong></article>
      <article class="record-stat"><span>已填排名</span><strong>${records.filter((record) => record.rank !== "" && record.rank !== undefined).length}<small> / ${records.length}</small></strong></article>
      <article class="record-stat"><span>累積賽事</span><strong>${new Set(records.filter((record) => record.matchNumber !== "" && record.matchNumber !== undefined).map((record) => `${record.competition}|${record.matchNumber}`)).size}</strong></article>`;
    renderRadarChart();
    renderProgressChart();
    els.exportButton.disabled = !records.length;
    els.deleteAllButton.disabled = !records.length;
    els.list.innerHTML = renderRecordGroups();
  }

  function showMessage(message, isError) {
    els.message.textContent = message;
    els.message.classList.toggle("is-error", Boolean(isError));
  }

  function closeExpandedCharts({ restoreFocus = false } = {}) {
    document.querySelectorAll(".record-chart.is-expanded").forEach((chart) => {
      chart.classList.remove("is-expanded");
      chart.removeAttribute("role");
      chart.removeAttribute("aria-modal");
      chart.removeAttribute("aria-label");
      chart.removeAttribute("tabindex");
      const button = chart.querySelector("[data-expand-chart]");
      if (button) {
        button.textContent = "⛶";
        const available = button.dataset.chartAvailable !== "false";
        button.disabled = !available;
        button.setAttribute("aria-label", available ? button.dataset.collapsedLabel || "放大圖表" : button.dataset.unavailableLabel || "資料不足，無法放大圖表");
        button.title = available ? "放大圖表" : button.dataset.unavailableLabel || "資料不足，無法放大圖表";
      }
    });
    document.body.classList.remove("chart-expanded");
    const trigger = expandedChartTrigger;
    expandedChartTrigger = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  function toggleChartExpansion(button) {
    const chart = button.closest(".record-chart");
    if (!chart || button.disabled) return;
    const shouldExpand = !chart.classList.contains("is-expanded");
    closeExpandedCharts({ restoreFocus: !shouldExpand });
    if (!shouldExpand) return;
    expandedChartTrigger = button;
    button.dataset.collapsedLabel ||= button.getAttribute("aria-label") || "放大圖表";
    chart.classList.add("is-expanded");
    chart.setAttribute("role", "dialog");
    chart.setAttribute("aria-modal", "true");
    chart.setAttribute("aria-label", chart.querySelector("h3")?.textContent || "放大圖表");
    chart.tabIndex = -1;
    document.body.classList.add("chart-expanded");
    button.textContent = "×";
    button.setAttribute("aria-label", "縮小圖表");
    button.title = "縮小圖表";
    button.focus({ preventScroll: true });
  }

  function handleChartKeydown(event) {
    const chart = document.querySelector(".record-chart.is-expanded");
    if (!chart) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeExpandedCharts({ restoreFocus: true });
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...chart.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      chart.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!chart.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function renderCompetitionSuggestions() {
    const needle = els.competition.value.trim().toLocaleLowerCase("zh-Hant");
    const matches = needle ? eventNames.filter((name) => name.toLocaleLowerCase("zh-Hant").includes(needle)).slice(0, 8) : [];
    activeCompetitionIndex = matches.length ? Math.min(activeCompetitionIndex, matches.length - 1) : -1;
    els.competitionSuggestions.innerHTML = matches.map((name, index) => `<button id="personalCompetitionOption${index}" type="button" role="option" aria-selected="${index === activeCompetitionIndex}" tabindex="-1" data-competition-suggestion="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("");
    els.competitionSuggestions.classList.toggle("is-hidden", !matches.length);
    els.competition.setAttribute("aria-expanded", String(matches.length > 0));
    if (activeCompetitionIndex >= 0) els.competition.setAttribute("aria-activedescendant", `personalCompetitionOption${activeCompetitionIndex}`);
    else els.competition.removeAttribute("aria-activedescendant");
  }

  function selectCompetitionSuggestion(option) {
    if (!option) return;
    els.competition.value = option.dataset.competitionSuggestion;
    els.matchDate.value = eventDateByName.get(els.competition.value) || defaultJulyDate();
    activeCompetitionIndex = -1;
    els.competitionSuggestions.classList.add("is-hidden");
    els.competition.setAttribute("aria-expanded", "false");
    els.competition.removeAttribute("aria-activedescendant");
    els.name.focus();
  }

  function handleCompetitionKeydown(event) {
    if (event.isComposing || event.keyCode === 229) return;
    const options = [...els.competitionSuggestions.querySelectorAll('[role="option"]')];
    if (event.key === "Escape" && !els.competitionSuggestions.classList.contains("is-hidden")) {
      event.preventDefault();
      activeCompetitionIndex = -1;
      els.competitionSuggestions.classList.add("is-hidden");
      els.competition.setAttribute("aria-expanded", "false");
      els.competition.removeAttribute("aria-activedescendant");
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) renderCompetitionSuggestions();
      const currentOptions = [...els.competitionSuggestions.querySelectorAll('[role="option"]')];
      if (!currentOptions.length) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeCompetitionIndex = activeCompetitionIndex < 0
        ? (direction > 0 ? 0 : currentOptions.length - 1)
        : (activeCompetitionIndex + direction + currentOptions.length) % currentOptions.length;
      renderCompetitionSuggestions();
      return;
    }
    if (event.key === "Enter" && options.length && !els.competitionSuggestions.classList.contains("is-hidden")) {
      const index = activeCompetitionIndex < 0 ? 0 : activeCompetitionIndex;
      event.preventDefault();
      selectCompetitionSuggestion(options[index]);
    }
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    if (!records.length) return;
    const rows = [CSV_HEADERS, ...records.map((record) => [
      record.competition, record.matchNumber, record.matchDate, record.name, record.judge,
      record.argument, record.argumentMax, record.speech, record.speechMax, record.question, record.questionMax,
      record.defense, record.defenseMax, record.closing, record.closingMax,
      record.rank ?? "", record.createdAt,
    ])];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `我的辯論成績-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showMessage(`已下載 ${records.length} 張裁單，請妥善保存這份 CSV。`, false);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = text.replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted && character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += character;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((item) => item.some((value) => value.trim() !== ""));
  }

  function parseBoolean(value) {
    return ["是", "true", "1", "勝", "yes"].includes(String(value || "").trim().toLowerCase());
  }

  function importedNumber(value) {
    if (String(value ?? "").trim() === "") return "";
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("invalid number");
    return number;
  }

  function importedMaximum(value, fallback) {
    if (String(value ?? "").trim() === "") return fallback;
    const number = importedNumber(value);
    if (number < 0.1 || Math.abs(number * 10 - Math.round(number * 10)) > 1e-7) throw new Error("invalid score maximum");
    return number;
  }

  function validateImportedRecord(record) {
    const validStep = (value, minimum, step, maximum = Number.POSITIVE_INFINITY) => value === "" || (Number.isFinite(Number(value))
      && Number(value) >= minimum && Number(value) <= maximum
      && Math.abs(Number(value) / step - Math.round(Number(value) / step)) < 1e-7);
    if (!validStep(record.matchNumber, 1, 1) || !validStep(record.rank, 1, 1, 6)) throw new Error("invalid match number or rank");
    METRICS.forEach((metric) => {
      if (!validStep(record[metric.key], 0, 0.1) || !validStep(record[metric.maxKey], 0.1, 0.1)) throw new Error("invalid score");
    });
  }

  async function importCsv(file) {
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      const headers = rows.shift()?.map((header) => header.trim()) || [];
      const get = (row, ...names) => {
        const index = names.map((name) => headers.indexOf(name)).find((candidate) => candidate >= 0);
        return index === undefined ? "" : row[index];
      };
      if (!headers.includes("申論") && !headers.includes("盃賽")) throw new Error("unsupported csv");
      const imported = rows.map((row) => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        competition: get(row, "盃賽", "盃賽名稱"),
        matchNumber: importedNumber(get(row, "此盃第幾場", "場次")),
        matchDate: get(row, "比賽日期", "日期"),
        name: get(row, "姓名", "選手姓名"),
        judge: get(row, "裁判姓名", "裁判"),
        argument: importedNumber(get(row, "論點分", "該場論點分")),
        argumentMax: importedMaximum(get(row, "論點滿分"), 10),
        speech: importedNumber(get(row, "申論")),
        speechMax: importedMaximum(get(row, "申論滿分"), 20),
        question: importedNumber(get(row, "質詢")),
        questionMax: importedMaximum(get(row, "質詢滿分"), 20),
        defense: importedNumber(get(row, "答辯")),
        defenseMax: importedMaximum(get(row, "答辯滿分"), 20),
        closing: importedNumber(get(row, "結辯")),
        closingMax: importedMaximum(get(row, "結辯滿分"), 10),
        rank: importedNumber(get(row, "排名", "排名為1", "排名為 1")),
        createdAt: get(row, "建立時間") || new Date().toISOString(),
      })).map(normalizeRecord);
      imported.forEach(validateImportedRecord);
      const key = (record) => [record.competition, record.matchNumber, record.matchDate, record.name, record.judge, ...METRICS.flatMap((metric) => [record[metric.key], record[metric.maxKey]]), record.rank, record.createdAt].join("|");
      const existing = new Set(records.map(key));
      const additions = imported.filter((record) => !existing.has(key(record)));
      if (!saveRecords([...records, ...additions])) return;
      render();
      showMessage(`已匯入 ${additions.length} 張裁單${imported.length !== additions.length ? "，重複資料已略過" : ""}。`, false);
    } catch (_error) {
      showMessage("匯入失敗，請確認 CSV 欄位正確，場次、排名與分數符合欄位範圍。", true);
    } finally {
      els.importInput.value = "";
    }
  }

  function init({ events = [] } = {}) {
    if (initialized) return;
    initialized = true;
    els = {
      form: document.querySelector("#personalRecordForm"),
      competition: document.querySelector("#personalCompetition"),
      competitionSuggestions: document.querySelector("#personalCompetitionSuggestions"),
      matchNumber: document.querySelector("#personalMatchNumber"),
      matchDate: document.querySelector("#personalMatchDate"),
      name: document.querySelector("#personalName"),
      judge: document.querySelector("#personalJudge"),
      argument: document.querySelector("#personalArgument"),
      argumentMax: document.querySelector("#personalArgumentMax"),
      speech: document.querySelector("#personalSpeech"),
      speechMax: document.querySelector("#personalSpeechMax"),
      question: document.querySelector("#personalQuestion"),
      questionMax: document.querySelector("#personalQuestionMax"),
      defense: document.querySelector("#personalDefense"),
      defenseMax: document.querySelector("#personalDefenseMax"),
      closing: document.querySelector("#personalClosing"),
      closingMax: document.querySelector("#personalClosingMax"),
      rank: document.querySelector("#personalRank"),
      nextButton: document.querySelector("#personalNextMatch"),
      cancelEdit: document.querySelector("#personalCancelEdit"),
      submitButton: document.querySelector("#personalSubmitRecord"),
      message: document.querySelector("#personalRecordMessage"),
      draftStatus: document.querySelector("#personalDraftStatus"),
      count: document.querySelector("#personalRecordCount"),
      stats: document.querySelector("#personalRecordStats"),
      radarChart: document.querySelector("#personalRadarChart"),
      progressChart: document.querySelector("#personalProgressChart"),
      exportButton: document.querySelector("#personalExportCsv"),
      deleteAllButton: document.querySelector("#personalDeleteAll"),
      importInput: document.querySelector("#personalImportCsv"),
      list: document.querySelector("#personalRecordList"),
    };
    if (!els.form) return;
    const eventEntries = events.map((event) => typeof event === "string" ? { name: event, date: "" } : event).filter((event) => event.name);
    eventNames = eventEntries.map((event) => event.name).sort((a, b) => b.localeCompare(a, "zh-Hant"));
    eventDateByName = new Map(eventEntries.map((event) => [event.name, event.date || ""]));
    records = readRecords().map(normalizeRecord);
    els.matchDate.value = defaultJulyDate();
    els.competition.addEventListener("input", () => {
      activeCompetitionIndex = -1;
      renderCompetitionSuggestions();
      els.matchDate.value = eventDateByName.get(els.competition.value.trim()) || defaultJulyDate();
    });
    els.competition.addEventListener("focus", renderCompetitionSuggestions);
    els.competition.addEventListener("keydown", handleCompetitionKeydown);
    els.competition.addEventListener("blur", () => window.setTimeout(() => {
      els.competitionSuggestions.classList.add("is-hidden");
      els.competition.setAttribute("aria-expanded", "false");
      els.competition.removeAttribute("aria-activedescendant");
      activeCompetitionIndex = -1;
    }, 120));
    els.competitionSuggestions.addEventListener("mousedown", (event) => event.preventDefault());
    els.competitionSuggestions.addEventListener("click", (event) => {
      const option = event.target.closest("[data-competition-suggestion]");
      selectCompetitionSuggestion(option);
    });
    els.nextButton.addEventListener("click", () => addDraft({ continueEntry: true }));
    els.cancelEdit.addEventListener("click", () => { exitEditMode({ clearForm: true }); showMessage("已取消修正。", false); });
    els.form.addEventListener("submit", (event) => { event.preventDefault(); addDraft(); });
    els.exportButton.addEventListener("click", exportCsv);
    els.deleteAllButton.addEventListener("click", () => {
      if (!records.length || !window.confirm(`確定要刪除全部 ${records.length} 張裁單嗎？這個動作無法復原。`)) return;
      if (!saveRecords([])) return;
      exitEditMode({ clearForm: true });
      render();
      showMessage("所有個人成績已刪除。", false);
    });
    els.importInput.addEventListener("change", () => importCsv(els.importInput.files?.[0]));
    document.querySelectorAll("[data-expand-chart]").forEach((button) => button.addEventListener("click", () => toggleChartExpansion(button)));
    document.addEventListener("keydown", handleChartKeydown);
    els.list.addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit-record]");
      if (editButton) { startEdit(editButton.dataset.editRecord); return; }
      const button = event.target.closest("[data-delete-record]");
      if (!button) return;
      const nextRecords = records.filter((record) => record.id !== button.dataset.deleteRecord);
      if (!saveRecords(nextRecords)) return;
      if (editingId === button.dataset.deleteRecord) exitEditMode({ clearForm: true });
      render(); showMessage("該張裁單已刪除。", false);
    });
    render();
  }

  window.DebatePersonalRecords = { init, closeExpandedCharts };
}());
