(function () {
  const STORAGE_KEY = "opendebate.personal-records.v1";
  const RecordCsv = window.DebateRecordCsv;
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
  let storageReadFailed = false;
  let eventNames = [];
  let editingId = "";
  let expandedChartTrigger = null;
  let expandedChartDialog = null;
  let expandedChartPlaceholder = null;
  let expandedChartParent = null;
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

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function normalizeRecord(record) {
    const normalized = { ...record };
    METRICS.forEach((metric) => { normalized[metric.maxKey] = positiveNumber(record[metric.maxKey], metric.defaultMax); });
    normalized.matchDate = record.matchDate || "";
    return normalized;
  }

  function readRecords() {
    const result = window.DebateRecordStorage.load(() => localStorage, STORAGE_KEY);
    if (!result.ok) {
      storageReadFailed = true;
      return [];
    }
    return result.records.map(normalizeRecord);
  }

  function showStorageReadFailure() {
    if (els.storageError) {
      els.storageError.textContent = window.DebateRecordStorage.loadFailureMessage();
      els.storageError.classList.remove("is-hidden");
    }
  }

  function saveRecords(nextRecords) {
    if (storageReadFailed) {
      showStorageReadFailure();
      return false;
    }
    if (!window.DebateRecordStorage.save(() => localStorage, STORAGE_KEY, nextRecords)) {
      showMessage(window.DebateRecordStorage.saveFailureMessage(records.length), true);
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
      matchDate: els.matchDate.value || "",
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

  function syncMetricConstraint(metric) {
    const maximum = positiveNumber(els[metric.maxKey].value, metric.defaultMax);
    const scoreInput = els[metric.key];
    scoreInput.max = String(maximum);
    const score = fieldNumber(scoreInput);
    scoreInput.setCustomValidity(score !== "" && score > maximum ? `${metric.label}分數不可超過滿分 ${maximum} 分。` : "");
  }

  function syncMetricConstraints() {
    METRICS.forEach(syncMetricConstraint);
  }

  function validateDraft(draft) {
    try {
      RecordCsv.validateRecord(draft, METRICS);
      return null;
    } catch (error) {
      return error;
    }
  }

  function reportDraftValidationError(error, draft) {
    const metric = METRICS.find((item) => item.key === error.fieldKey || item.maxKey === error.fieldKey);
    const message = metric
      ? error.fieldKey === metric.maxKey
        ? `${metric.label}滿分需大於 0，並以 0.1 分為單位。`
        : `${metric.label}需介於 0 至滿分 ${draft[metric.maxKey]}，並以 0.1 分為單位。`
      : error.fieldKey === "matchNumber" ? "場次需為大於 0 的整數。"
        : error.fieldKey === "rank" ? "排名需為 1 至 6 的整數。"
          : "場次、排名或分數格式不符合欄位範圍。";
    const input = error.fieldKey ? els[error.fieldKey] : null;
    input?.setCustomValidity?.(message);
    input?.reportValidity?.();
    showMessage(message, true);
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
    els.matchDate.value = "";
    METRICS.forEach((metric) => { els[metric.maxKey].value = String(metric.defaultMax); });
    syncMetricConstraints();
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
    syncMetricConstraints();
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
    syncMetricConstraints();
    if (!window.DebateRecordStorage.isValid(els.form)) return;
    if (editingId) {
      const index = records.findIndex((record) => record.id === editingId);
      if (index < 0) return;
      const nextRecords = [...records];
      const draft = getDraft(records[index]);
      const validationError = validateDraft(draft);
      if (validationError) {
        reportDraftValidationError(validationError, draft);
        return;
      }
      nextRecords[index] = draft;
      if (!saveRecords(nextRecords)) return;
      exitEditMode({ clearForm: true });
      render();
      showMessage("修正已儲存，原紀錄已更新。", false);
      return;
    }
    const draft = getDraft();
    const validationError = validateDraft(draft);
    if (validationError) {
      reportDraftValidationError(validationError, draft);
      return;
    }
    if (!saveRecords([...records, draft])) return;
    render();
    const current = draft;
    const sameMatchCount = current?.matchNumber === "" ? 1 : records.filter((record) => record.competition === current.competition && String(record.matchNumber) === String(current.matchNumber)).length;
    const ballotWarning = sameMatchCount > 3 ? `提醒：這個盃賽第 ${current.matchNumber} 場已有 ${sameMatchCount} 張裁單；系統仍已保留本張資料。` : "";
    showMessage(ballotWarning || (continueEntry ? "這一張已暫存；已填寫的分數會納入平均，可以繼續輸入下一張。" : "裁單已儲存；已填寫的分數會納入平均。"), false);
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
    const dataTable = window.DebateChartDataTable.render({
      caption: "能力雷達圖各項目平均分數比例",
      headers: ["評分項目", "平均比例"],
      rows: active.map((metric) => [metric.label, formatPercent(metric.value)]),
    });
    els.radarChart.innerHTML = `<svg class="radar-svg" viewBox="0 0 340 340" role="img" aria-label="${active.length} 維能力雷達圖"><g class="radar-grid">${grid}${axes}</g><polygon class="radar-data" points="${dataPoints}" />${active.map((metric, index) => { const point = polarPoint(index, active.length, 110 * metric.value / 100); return `<circle cx="${point.x}" cy="${point.y}" r="4" />`; }).join("")}</svg>${dataTable}`;
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
    const dataTable = window.DebateChartDataTable.render({
      caption: "依比賽日期排列的各項分數比例",
      headers: ["比賽日期", ...CHART_METRICS.map((metric) => metric.label)],
      rows: chronological.map((match) => [match.matchDate, ...CHART_METRICS.map((metric) => formatPercent(match.values[metric.key]))]),
    });
    els.progressChart.innerHTML = `<div class="progress-legend">${legend}</div><div class="progress-scroll"><svg class="progress-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="依日期排列的分數進步折線圖"><g class="progress-grid">${grid}</g><g class="progress-series">${series}</g><g class="progress-dates">${dateLabels}</g></svg></div>${dataTable}`;
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
    els.exportButton.disabled = storageReadFailed || !records.length;
    els.deleteAllButton.disabled = storageReadFailed || !records.length;
    els.list.innerHTML = renderRecordGroups();
  }

  function showMessage(message, isError) {
    els.message.textContent = message;
    els.message.classList.toggle("is-error", Boolean(isError));
  }

  function closeExpandedCharts({ restoreFocus = false } = {}) {
    const chart = expandedChartDialog?.querySelector(".record-chart.is-expanded");
    if (chart && expandedChartParent) {
      chart.classList.remove("is-expanded");
      const button = chart.querySelector("[data-expand-chart]");
      if (button) {
        button.textContent = "⛶";
        const available = button.dataset.chartAvailable !== "false";
        button.disabled = !available;
        button.setAttribute("aria-label", available ? button.dataset.collapsedLabel || "放大圖表" : button.dataset.unavailableLabel || "資料不足，無法放大圖表");
        button.title = available ? "放大圖表" : button.dataset.unavailableLabel || "資料不足，無法放大圖表";
      }
      if (expandedChartPlaceholder?.parentNode) expandedChartPlaceholder.parentNode.replaceChild(chart, expandedChartPlaceholder);
      else expandedChartParent.append(chart);
    }
    const dialog = expandedChartDialog;
    expandedChartDialog = null;
    expandedChartParent = null;
    expandedChartPlaceholder = null;
    if (dialog?.open) dialog.close();
    dialog?.remove();
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
    const title = chart.querySelector("h3");
    if (!title?.id) return;
    expandedChartParent = chart.parentNode;
    expandedChartPlaceholder = document.createComment("圖表原位置");
    expandedChartParent.insertBefore(expandedChartPlaceholder, chart);
    expandedChartDialog = document.createElement("dialog");
    expandedChartDialog.className = "record-chart-dialog";
    expandedChartDialog.setAttribute("aria-labelledby", title.id);
    expandedChartDialog.addEventListener("keydown", (event) => {
      window.DebateInteractions.keepDialogTabFocus(expandedChartDialog, event);
    });
    expandedChartDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeExpandedCharts({ restoreFocus: true });
    });
    expandedChartDialog.append(chart);
    document.body.append(expandedChartDialog);
    chart.classList.add("is-expanded");
    expandedChartDialog.showModal();
    document.body.classList.add("chart-expanded");
    button.textContent = "×";
    button.setAttribute("aria-label", "縮小圖表");
    button.title = "縮小圖表";
    button.focus({ preventScroll: true });
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

  function exportCsv() {
    if (storageReadFailed) {
      showMessage(window.DebateRecordStorage.loadFailureMessage(), true);
      return;
    }
    if (!records.length) return;
    const rows = [CSV_HEADERS, ...records.map((record) => [
      record.competition, record.matchNumber, record.matchDate, record.name, record.judge,
      record.argument, record.argumentMax, record.speech, record.speechMax, record.question, record.questionMax,
      record.defense, record.defenseMax, record.closing, record.closingMax,
      record.rank ?? "", record.createdAt,
    ])];
    const csv = RecordCsv.serialize(rows, { spreadsheetSafe: true });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `我的辯論成績-${window.DebateRecordStorage.localDateStamp()}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showMessage(`已下載 ${records.length} 張裁單，請妥善保存這份 CSV。`, false);
  }

  async function importCsv(file) {
    if (!file) return;
    try {
      const imported = RecordCsv.parsePersonalRecords(await file.text()).map(normalizeRecord);
      const key = (record) => JSON.stringify([record.competition, record.matchNumber, record.matchDate, record.name, record.judge, ...METRICS.flatMap((metric) => [record[metric.key], record[metric.maxKey]]), record.rank, record.createdAt]);
      const additions = RecordCsv.uniqueImportedRecords(records, imported, key);
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
      storageError: document.querySelector("#personalStorageError"),
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
    const eventEntries = events.map((event) => typeof event === "string" ? { name: event } : event).filter((event) => event.name);
    eventNames = eventEntries.map((event) => event.name).sort((a, b) => b.localeCompare(a, "zh-Hant"));
    records = readRecords().map(normalizeRecord);
    if (storageReadFailed) {
      [els.nextButton, els.submitButton, els.exportButton, els.deleteAllButton, els.importInput].forEach((control) => { control.disabled = true; });
      showStorageReadFailure();
    }
    els.matchDate.value = "";
    syncMetricConstraints();
    els.competition.addEventListener("input", () => {
      activeCompetitionIndex = -1;
      renderCompetitionSuggestions();
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
    METRICS.forEach((metric) => {
      els[metric.key].addEventListener("input", () => syncMetricConstraint(metric));
      els[metric.maxKey].addEventListener("input", () => syncMetricConstraint(metric));
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

  window.DebatePersonalRecords = { init, closeExpandedCharts, validateDraft };
}());
