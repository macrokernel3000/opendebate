(function () {
  const STORAGE_KEY = "opendebate.personal-records.v1";
  const CSV_HEADERS = ["盃賽", "此盃第幾場", "比賽日期", "姓名", "裁判姓名", "論點分", "論點滿分", "申論", "申論滿分", "質詢", "質詢滿分", "答辯", "答辯滿分", "結辯", "結辯滿分", "無結辯", "該單獲勝", "排名為1", "建立時間"];
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

  function saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (_error) {
      showMessage("瀏覽器無法儲存資料，請先下載 CSV，並確認未使用限制儲存的模式。", true);
      return false;
    }
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
      closing: els.noClosing.checked ? "" : fieldNumber(els.closing),
      closingMax: positiveNumber(els.closingMax.value, 10),
      noClosing: els.noClosing.checked,
      win: els.win.checked,
      rankFirst: els.rankFirst.checked,
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
    els.noClosing.checked = false;
    els.win.checked = false;
    els.rankFirst.checked = false;
    els.closing.disabled = false;
    els.closingMax.disabled = false;
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
    els.noClosing.checked = Boolean(record.noClosing);
    els.win.checked = Boolean(record.win);
    els.rankFirst.checked = Boolean(record.rankFirst);
    els.closing.disabled = els.noClosing.checked;
    els.closingMax.disabled = els.noClosing.checked;
    els.nextButton.disabled = true;
    els.cancelEdit.classList.remove("is-hidden");
    els.submitButton.textContent = "儲存修正";
    showMessage("正在修正這一場，儲存後會更新原紀錄。", false);
    els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForNextMatch() {
    els.judge.focus();
  }

  function addDraft({ continueEntry = false } = {}) {
    if (editingId) {
      const index = records.findIndex((record) => record.id === editingId);
      if (index < 0) return;
      const previousRecord = records[index];
      records[index] = getDraft(previousRecord);
      if (!saveRecords()) records[index] = previousRecord;
      exitEditMode({ clearForm: true });
      render();
      showMessage("修正已儲存，原紀錄已更新。", false);
      return;
    }
    records.push(getDraft());
    if (!saveRecords()) records.pop();
    render();
    const current = records.at(-1);
    const sameMatchCount = current?.matchNumber === "" ? 1 : records.filter((record) => record.competition === current.competition && String(record.matchNumber) === String(current.matchNumber)).length;
    const ballotWarning = sameMatchCount > 3 ? `提醒：這個盃賽第 ${current.matchNumber} 場已有 ${sameMatchCount} 張裁單；系統仍已保留本張資料。` : "";
    showMessage(ballotWarning || (continueEntry ? "這一張已暫存，所有欄位都已保留，可以直接調整下一張。" : "輸入完成，平均分數已更新。"), false);
    if (continueEntry) resetForNextMatch();
    else document.querySelector("#recordSummaryTitle")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  }

  function renderBallot(record, index) {
    return `<article class="personal-record-item">
      <div class="personal-record-title"><div><span>第 ${index + 1} 張${record.win ? " · 獲勝" : ""}${record.rankFirst ? " · 排名 1" : ""} · ${escapeHtml(record.matchDate || "日期未填")}</span><strong>${escapeHtml(record.judge || "未填裁判")}</strong><small>${escapeHtml(record.name || "未填姓名")}</small></div><div class="personal-record-controls"><button type="button" data-edit-record="${escapeHtml(record.id)}" aria-label="修正第 ${index + 1} 張">修正</button><button type="button" data-delete-record="${escapeHtml(record.id)}" aria-label="刪除第 ${index + 1} 張">刪除</button></div></div>
      <div class="personal-record-scores">${METRICS.map((metric) => `<span>${metric.label} <b>${record.noClosing && metric.key === "closing" ? "無" : formatScorePair(record, metric)}</b></span>`).join("")}</div>
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
    const wins = records.filter((record) => record.win).length;
    els.count.textContent = `${records.length} 張`;
    els.draftStatus.textContent = `第 ${records.length + 1} 張`;
    els.stats.innerHTML = `
      <article class="record-stat record-stat-primary"><span>平均申論分</span><strong>${formatAverage(average("speech"))}</strong></article>
      <article class="record-stat"><span>平均質詢分</span><strong>${formatAverage(average("question"))}</strong></article>
      <article class="record-stat"><span>平均答辯分</span><strong>${formatAverage(average("defense"))}</strong></article>
      <article class="record-stat"><span>獲勝裁單</span><strong>${wins}<small> / ${records.length}</small></strong></article>
      <article class="record-stat"><span>排名 1</span><strong>${records.filter((record) => record.rankFirst).length}</strong></article>`;
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

  function closeExpandedCharts() {
    document.querySelectorAll(".record-chart.is-expanded").forEach((chart) => {
      chart.classList.remove("is-expanded");
      const button = chart.querySelector("[data-expand-chart]");
      if (button) {
        button.textContent = "⛶";
        button.setAttribute("aria-label", button.dataset.collapsedLabel || "放大圖表");
        button.title = "放大圖表";
      }
    });
    document.body.classList.remove("chart-expanded");
  }

  function toggleChartExpansion(button) {
    const chart = button.closest(".record-chart");
    if (!chart) return;
    const shouldExpand = !chart.classList.contains("is-expanded");
    closeExpandedCharts();
    if (!shouldExpand) return;
    button.dataset.collapsedLabel ||= button.getAttribute("aria-label") || "放大圖表";
    chart.classList.add("is-expanded");
    document.body.classList.add("chart-expanded");
    button.textContent = "×";
    button.setAttribute("aria-label", "縮小圖表");
    button.title = "縮小圖表";
  }

  function renderCompetitionSuggestions() {
    const needle = els.competition.value.trim().toLocaleLowerCase("zh-Hant");
    const matches = needle ? eventNames.filter((name) => name.toLocaleLowerCase("zh-Hant").includes(needle)).slice(0, 8) : [];
    els.competitionSuggestions.innerHTML = matches.map((name) => `<button type="button" role="option" data-competition-suggestion="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("");
    els.competitionSuggestions.classList.toggle("is-hidden", !matches.length);
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
      record.noClosing ? "是" : "否", record.win ? "是" : "否", record.rankFirst ? "是" : "否", record.createdAt,
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
    return Number.isFinite(number) ? number : "";
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
        argumentMax: positiveNumber(get(row, "論點滿分"), 10),
        speech: importedNumber(get(row, "申論")),
        speechMax: positiveNumber(get(row, "申論滿分"), 20),
        question: importedNumber(get(row, "質詢")),
        questionMax: positiveNumber(get(row, "質詢滿分"), 20),
        defense: importedNumber(get(row, "答辯")),
        defenseMax: positiveNumber(get(row, "答辯滿分"), 20),
        closing: importedNumber(get(row, "結辯")),
        closingMax: positiveNumber(get(row, "結辯滿分"), 10),
        noClosing: parseBoolean(get(row, "無結辯")),
        win: parseBoolean(get(row, "該單獲勝", "勝場")),
        rankFirst: parseBoolean(get(row, "排名為1", "排名為 1")),
        createdAt: get(row, "建立時間") || new Date().toISOString(),
      })).map(normalizeRecord);
      const key = (record) => [record.competition, record.matchNumber, record.matchDate, record.name, record.judge, ...METRICS.flatMap((metric) => [record[metric.key], record[metric.maxKey]]), record.noClosing, record.win, record.rankFirst, record.createdAt].join("|");
      const existing = new Set(records.map(key));
      const additions = imported.filter((record) => !existing.has(key(record)));
      records.push(...additions);
      saveRecords();
      render();
      showMessage(`已匯入 ${additions.length} 張裁單${imported.length !== additions.length ? "，重複資料已略過" : ""}。`, false);
    } catch (_error) {
      showMessage("匯入失敗，請選擇由本頁下載的 CSV，或確認欄位包含「盃賽、姓名、申論」。", true);
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
      noClosing: document.querySelector("#personalNoClosing"),
      win: document.querySelector("#personalWin"),
      rankFirst: document.querySelector("#personalRankFirst"),
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
      renderCompetitionSuggestions();
      els.matchDate.value = eventDateByName.get(els.competition.value.trim()) || defaultJulyDate();
    });
    els.competition.addEventListener("focus", renderCompetitionSuggestions);
    els.competition.addEventListener("blur", () => window.setTimeout(() => els.competitionSuggestions.classList.add("is-hidden"), 120));
    els.competitionSuggestions.addEventListener("click", (event) => {
      const option = event.target.closest("[data-competition-suggestion]");
      if (!option) return;
      els.competition.value = option.dataset.competitionSuggestion;
      els.matchDate.value = eventDateByName.get(els.competition.value) || defaultJulyDate();
      els.competitionSuggestions.classList.add("is-hidden");
      els.name.focus();
    });
    els.noClosing.addEventListener("change", () => {
      els.closing.disabled = els.noClosing.checked;
      els.closingMax.disabled = els.noClosing.checked;
      if (els.noClosing.checked) els.closing.value = "";
    });
    els.nextButton.addEventListener("click", () => addDraft({ continueEntry: true }));
    els.cancelEdit.addEventListener("click", () => { exitEditMode({ clearForm: true }); showMessage("已取消修正。", false); });
    els.form.addEventListener("submit", (event) => { event.preventDefault(); addDraft(); });
    els.exportButton.addEventListener("click", exportCsv);
    els.deleteAllButton.addEventListener("click", () => {
      if (!records.length || !window.confirm(`確定要刪除全部 ${records.length} 張裁單嗎？這個動作無法復原。`)) return;
      records = [];
      saveRecords();
      exitEditMode({ clearForm: true });
      render();
      showMessage("所有個人成績已刪除。", false);
    });
    els.importInput.addEventListener("change", () => importCsv(els.importInput.files?.[0]));
    document.querySelectorAll("[data-expand-chart]").forEach((button) => button.addEventListener("click", () => toggleChartExpansion(button)));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeExpandedCharts(); });
    els.list.addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit-record]");
      if (editButton) { startEdit(editButton.dataset.editRecord); return; }
      const button = event.target.closest("[data-delete-record]");
      if (!button) return;
      if (editingId === button.dataset.deleteRecord) exitEditMode({ clearForm: true });
      records = records.filter((record) => record.id !== button.dataset.deleteRecord);
      saveRecords(); render(); showMessage("該張裁單已刪除。", false);
    });
    render();
  }

  window.DebatePersonalRecords = { init };
}());
