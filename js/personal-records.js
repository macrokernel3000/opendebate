(function () {
  const STORAGE_KEY = "opendebate.personal-records.v1";
  const CSV_HEADERS = ["盃賽", "姓名", "申論", "質詢", "答辯", "結辯", "無結辯", "勝場", "建立時間"];
  let initialized = false;
  let records = [];
  let els = {};

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readRecords() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(stored) ? stored : [];
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

  function getDraft() {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      competition: els.competition.value.trim(),
      name: els.name.value.trim(),
      speech: fieldNumber(els.speech),
      question: fieldNumber(els.question),
      defense: fieldNumber(els.defense),
      closing: els.noClosing.checked ? "" : fieldNumber(els.closing),
      noClosing: els.noClosing.checked,
      win: els.win.checked,
      createdAt: new Date().toISOString(),
    };
  }

  function resetForNextMatch() {
    [els.speech, els.question, els.defense, els.closing].forEach((input) => { input.value = ""; });
    els.noClosing.checked = false;
    els.win.checked = false;
    els.closing.disabled = false;
    els.speech.focus();
  }

  function addDraft({ continueEntry = false } = {}) {
    records.push(getDraft());
    if (!saveRecords()) records.pop();
    render();
    showMessage(continueEntry ? "這一場已暫存，可以繼續輸入下一場。" : "輸入完成，平均分數已更新。", false);
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

  function render() {
    const wins = records.filter((record) => record.win).length;
    els.count.textContent = `${records.length} 場`;
    els.draftStatus.textContent = `第 ${records.length + 1} 場`;
    els.stats.innerHTML = `
      <article class="record-stat record-stat-primary"><span>平均申論分</span><strong>${formatAverage(average("speech"))}</strong></article>
      <article class="record-stat"><span>平均質詢分</span><strong>${formatAverage(average("question"))}</strong></article>
      <article class="record-stat"><span>平均答辯分</span><strong>${formatAverage(average("defense"))}</strong></article>
      <article class="record-stat"><span>勝場</span><strong>${wins}<small> / ${records.length}</small></strong></article>`;
    els.exportButton.disabled = !records.length;
    els.list.innerHTML = records.length ? [...records].reverse().map((record, reverseIndex) => {
      const index = records.length - reverseIndex - 1;
      return `<article class="personal-record-item">
        <div class="personal-record-title"><div><span>第 ${index + 1} 場${record.win ? " · 勝" : ""}</span><strong>${escapeHtml(record.competition || "未填盃賽")}</strong><small>${escapeHtml(record.name || "未填姓名")}</small></div><button type="button" data-delete-record="${escapeHtml(record.id)}" aria-label="刪除第 ${index + 1} 場">刪除</button></div>
        <div class="personal-record-scores"><span>申論 <b>${formatScore(record.speech)}</b></span><span>質詢 <b>${formatScore(record.question)}</b></span><span>答辯 <b>${formatScore(record.defense)}</b></span><span>結辯 <b>${record.noClosing ? "無" : formatScore(record.closing)}</b></span></div>
      </article>`;
    }).join("") : '<div class="record-empty"><span aria-hidden="true">✍️</span><strong>還沒有個人成績</strong><p>輸入一場比賽，或匯入之前下載的 CSV。</p></div>';
  }

  function showMessage(message, isError) {
    els.message.textContent = message;
    els.message.classList.toggle("is-error", Boolean(isError));
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    if (!records.length) return;
    const rows = [CSV_HEADERS, ...records.map((record) => [
      record.competition, record.name, record.speech, record.question, record.defense, record.closing,
      record.noClosing ? "是" : "否", record.win ? "是" : "否", record.createdAt,
    ])];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `我的辯論成績-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showMessage(`已下載 ${records.length} 場成績，請妥善保存這份 CSV。`, false);
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
        name: get(row, "姓名", "選手姓名"),
        speech: importedNumber(get(row, "申論")),
        question: importedNumber(get(row, "質詢")),
        defense: importedNumber(get(row, "答辯")),
        closing: importedNumber(get(row, "結辯")),
        noClosing: parseBoolean(get(row, "無結辯")),
        win: parseBoolean(get(row, "勝場")),
        createdAt: get(row, "建立時間") || new Date().toISOString(),
      }));
      const key = (record) => [record.competition, record.name, record.speech, record.question, record.defense, record.closing, record.noClosing, record.win, record.createdAt].join("|");
      const existing = new Set(records.map(key));
      const additions = imported.filter((record) => !existing.has(key(record)));
      records.push(...additions);
      saveRecords();
      render();
      showMessage(`已匯入 ${additions.length} 場成績${imported.length !== additions.length ? "，重複資料已略過" : ""}。`, false);
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
      name: document.querySelector("#personalName"),
      speech: document.querySelector("#personalSpeech"),
      question: document.querySelector("#personalQuestion"),
      defense: document.querySelector("#personalDefense"),
      closing: document.querySelector("#personalClosing"),
      noClosing: document.querySelector("#personalNoClosing"),
      win: document.querySelector("#personalWin"),
      nextButton: document.querySelector("#personalNextMatch"),
      message: document.querySelector("#personalRecordMessage"),
      draftStatus: document.querySelector("#personalDraftStatus"),
      count: document.querySelector("#personalRecordCount"),
      stats: document.querySelector("#personalRecordStats"),
      exportButton: document.querySelector("#personalExportCsv"),
      importInput: document.querySelector("#personalImportCsv"),
      list: document.querySelector("#personalRecordList"),
    };
    if (!els.form) return;
    els.competition.innerHTML = '<option value="">未選擇盃賽</option>' + [...events].sort((a, b) => b.localeCompare(a, "zh-Hant")).map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
    records = readRecords();
    els.noClosing.addEventListener("change", () => {
      els.closing.disabled = els.noClosing.checked;
      if (els.noClosing.checked) els.closing.value = "";
    });
    els.nextButton.addEventListener("click", () => addDraft({ continueEntry: true }));
    els.form.addEventListener("submit", (event) => { event.preventDefault(); addDraft(); });
    els.exportButton.addEventListener("click", exportCsv);
    els.importInput.addEventListener("change", () => importCsv(els.importInput.files?.[0]));
    els.list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-record]");
      if (!button) return;
      records = records.filter((record) => record.id !== button.dataset.deleteRecord);
      saveRecords(); render(); showMessage("該場成績已刪除。", false);
    });
    render();
  }

  window.DebatePersonalRecords = { init };
}());
