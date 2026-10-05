(function () {
  const STORAGE_KEY = "opendebate.team-records.v2";
  const LEGACY_KEY = "opendebate.team-records.v1";
  const RecordCsv = window.DebateRecordCsv;
  const SIDES = ["aff", "neg"];
  const METRICS = ["Speech", "Question", "Defense"];
  const SCORE_KEYS = SIDES.flatMap((side) => [1, 2, 3].flatMap((position) => METRICS.map((metric) => `${side}P${position}${metric}`)));
  const EXTRA_KEYS = SIDES.flatMap((side) => [`${side}Argument`, `${side}Closing`]);
  const CSV_HEADERS = ["盃賽", "此盃第幾場", "比賽日期", "隊伍名稱", "我方持方", "裁判姓名", ...SIDES.flatMap((side) => [1, 2, 3].flatMap((position) => METRICS.map((metric) => `${side === "aff" ? "正" : "反"}${position}${{ Speech: "申論", Question: "質詢", Defense: "答辯" }[metric]}`))), "正方架構論點", "正方結辯", "反方架構論點", "反方結辯", "正方總分", "反方總分", "該單結果", "建立時間"];
  let records = [];
  let editingId = "";
  let storageReadFailed = false;
  let els = {};

  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function numberValue(element) { const value = element?.value; return value === "" || !Number.isFinite(Number(value)) ? "" : Number(value); }
  function display(value) { return value === "" || value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(1).replace(/\.0$/, ""); }
  function setValue(element, value) { element.value = value === "" || value === null || value === undefined ? "" : String(value); }
  function showStorageReadFailure() { if (els.storageError) { els.storageError.textContent = window.DebateRecordStorage.loadFailureMessage(); els.storageError.classList.remove("is-hidden"); } }

  function normalize(record) {
    const normalized = { ...record, side: record.side === "反" ? "反" : "正" };
    [...SCORE_KEYS, ...EXTRA_KEYS].forEach((key) => { normalized[key] = record[key] === "" || record[key] === null || record[key] === undefined ? "" : Number(record[key]); });
    normalized.matchDate ||= "";
    return normalized;
  }

  function validateImportedRecord(record) {
    const validStep = (value, minimum, step) => value === "" || (Number.isFinite(Number(value))
      && Number(value) >= minimum && Math.abs(Number(value) / step - Math.round(Number(value) / step)) < 1e-7);
    if (!validStep(record.matchNumber, 1, 1)) throw new Error("invalid match number");
    [...SCORE_KEYS, ...EXTRA_KEYS].forEach((key) => {
      if (!validStep(record[key], 0, 0.1)) throw new Error(`invalid score: ${key}`);
    });
  }

  function recordKey(record) {
    return JSON.stringify([
      record.competition, record.matchNumber, record.matchDate, record.teamName, record.side, record.judge,
      ...SCORE_KEYS.map((key) => record[key]), ...EXTRA_KEYS.map((key) => record[key]), record.createdAt,
    ]);
  }

  function uniqueImportedRecords(existing, imported) {
    const seen = new Set(existing.map(recordKey));
    const additions = [];
    imported.forEach((record) => {
      const key = recordKey(record);
      if (seen.has(key)) return;
      seen.add(key);
      additions.push(record);
    });
    return additions;
  }

  function migrateLegacy(record) {
    const side = record.side === "反" ? "neg" : "aff";
    const migrated = { id: record.id, competition: record.competition, teamName: record.teamName, judge: record.judge, matchDate: record.matchDate, matchNumber: record.matchNumber, side: record.side, createdAt: record.createdAt };
    [1, 2, 3].forEach((position) => METRICS.forEach((metric) => { migrated[`${side}P${position}${metric}`] = record[`p${position}${metric}`] ?? ""; }));
    migrated[`${side}Argument`] = record.argument ?? ""; migrated[`${side}Closing`] = record.closing ?? "";
    return normalize(migrated);
  }

  function readRecords() {
    const current = window.DebateRecordStorage.load(() => localStorage, STORAGE_KEY);
    if (!current.ok) {
      storageReadFailed = true;
      return [];
    }
    if (current.records.length) return current.records.map(normalize);
    const legacy = window.DebateRecordStorage.load(() => localStorage, LEGACY_KEY);
    if (!legacy.ok) {
      storageReadFailed = true;
      return [];
    }
    if (!legacy.records.length) return [];
    const migrated = legacy.records.map(migrateLegacy);
    if (!window.DebateRecordStorage.save(() => localStorage, STORAGE_KEY, migrated)) {
      showMessage("舊版隊伍裁單已載入，但瀏覽器暫時無法完成格式更新；請先匯出 CSV 備份。", true);
    }
    return migrated;
  }

  function saveRecords(nextRecords) { if (storageReadFailed) { showStorageReadFailure(); return false; } if (!window.DebateRecordStorage.save(() => localStorage, STORAGE_KEY, nextRecords)) { showMessage(window.DebateRecordStorage.saveFailureMessage(records.length), true); return false; } records = nextRecords; return true; }
  function sideTotal(record, side) { const values = [...SCORE_KEYS.filter((key) => key.startsWith(side)), `${side}Argument`, `${side}Closing`].map((key) => record[key]).filter((value) => value !== "" && Number.isFinite(Number(value))).map(Number); return values.length ? values.reduce((sum, value) => sum + value, 0) : null; }
  function ballotResult(record) { const aff = sideTotal(record, "aff"); const neg = sideTotal(record, "neg"); if (aff === null || neg === null) return { status: "分數未完整", win: null, aff, neg }; if (aff === neg) return { status: "同分", win: null, aff, neg }; const winningSide = aff > neg ? "正" : "反"; return { status: winningSide === record.side ? "判我方勝" : "判我方負", win: winningSide === record.side, aff, neg }; }

  function getDraft(previous = null) {
    const draft = { id: previous?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`, competition: els.competition.value.trim(), teamName: els.teamName.value.trim(), judge: els.judge.value.trim(), matchDate: els.matchDate.value || "", matchNumber: numberValue(els.matchNumber), side: els.side.value, createdAt: previous?.createdAt || new Date().toISOString() };
    [...SCORE_KEYS, ...EXTRA_KEYS].forEach((key) => { draft[key] = numberValue(els[key]); }); return draft;
  }

  function matchKey(record) { if (record.matchNumber === "" || record.matchNumber === null || record.matchNumber === undefined) return `single:${record.id}`; return [record.competition, record.matchNumber, record.matchDate, record.teamName].join("|"); }
  function groups() { const map = new Map(); records.forEach((record, index) => { const key = matchKey(record); if (!map.has(key)) map.set(key, { key, competition: record.competition, matchNumber: record.matchNumber, matchDate: record.matchDate, teamName: record.teamName, ballots: [], latestIndex: index }); const group = map.get(key); group.ballots.push(record); group.latestIndex = index; }); return [...map.values()].sort((a, b) => b.latestIndex - a.latestIndex); }
  function resolveResult(ballots) { const decided = ballots.map(ballotResult).filter((result) => result.win !== null); const votes = decided.filter((result) => result.win).length; const total = decided.length; const completed = ballots.length >= 3; if (!completed) return { status: "待補裁單", votes, total, completed, won: false, outcome: "pending" }; if (!total) return { status: "尚無可判定裁單", votes, total, completed, won: false, outcome: "pending" }; if (total < 2) return { status: "裁判票不足以判定", votes, total, completed, won: false, outcome: "pending" }; if (votes * 2 === total) return { status: "裁判票平手", votes, total, completed, won: false, outcome: "pending" }; const won = votes * 2 > total; return { status: won ? "本場獲勝" : "本場落敗", votes, total, completed, won, outcome: won ? "win" : "loss" }; }
  function resultFor(group) { return resolveResult(group.ballots); }

  function mySideValues(record, metric) { const side = record.side === "反" ? "neg" : "aff"; return [1, 2, 3].map((position) => record[`${side}P${position}${metric}`]).filter((value) => value !== "" && Number.isFinite(Number(value))).map(Number); }
  function averageMetric(metric) {
    const matchAverages = groups().map((group) => {
      const values = group.ballots.flatMap((record) => mySideValues(record, metric));
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    }).filter((value) => value !== null);
    return matchAverages.length ? Number((matchAverages.reduce((sum, value) => sum + value, 0) / matchAverages.length).toFixed(2)) : null;
  }
  function renderStats() { const matchGroups = groups(); const completed = matchGroups.map(resultFor).filter((result) => result.completed); els.stats.innerHTML = `<article class="record-stat record-stat-primary"><span>平均申論分</span><strong>${display(averageMetric("Speech"))}</strong></article><article class="record-stat"><span>平均質詢分</span><strong>${display(averageMetric("Question"))}</strong></article><article class="record-stat"><span>平均答辯分</span><strong>${display(averageMetric("Defense"))}</strong></article><article class="record-stat"><span>已收滿三張</span><strong>${completed.length}<small> / ${matchGroups.length}</small></strong></article><article class="record-stat"><span>比賽勝場</span><strong>${completed.filter((result) => result.outcome === "win").length}</strong></article>`; }

  function polarPoint(index, count, radius, center = 170) { const angle = -Math.PI / 2 + index * Math.PI * 2 / count; return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius }; }
  function renderRadar() {
    const ballotCount = records.length; const metrics = [{ key: "Speech", label: "申論" }, { key: "Question", label: "質詢" }, { key: "Defense", label: "答辯" }].map((metric) => ({ ...metric, value: averageMetric(metric.key) })).filter((metric) => metric.value !== null);
    if (ballotCount <= 2 || metrics.length < 3) { els.radar.innerHTML = `<div class="record-chart-empty"><strong>至少需要三張裁單的完整分數</strong><p>累積超過兩張裁單，且申論、質詢、答辯都有資料後，會顯示隊伍平均雷達圖。</p></div>`; window.DebateInteractions.setChartExpansionAvailability(els.radar, false, "資料不足，需三張完整裁單才能放大隊伍平均雷達圖"); return; }
    const values = metrics.map((metric) => Math.max(0, Math.min(100, metric.value / 20 * 100))); const grid = [20, 40, 60, 80, 100].map((level) => `<polygon points="${metrics.map((_, index) => { const point = polarPoint(index, 3, 110 * level / 100); return `${point.x},${point.y}`; }).join(" ")}" />`).join("");
    const axes = metrics.map((metric, index) => { const point = polarPoint(index, 3, 110); const label = polarPoint(index, 3, 142); const anchor = label.x < 155 ? "end" : label.x > 185 ? "start" : "middle"; return `<line x1="170" y1="170" x2="${point.x}" y2="${point.y}" /><text x="${label.x}" y="${label.y}" text-anchor="${anchor}">${metric.label} ${display(metric.value)}</text>`; }).join("");
    const dataTable = window.DebateChartDataTable.render({
      caption: "隊伍各項能力平均分數（滿分 20 分）",
      headers: ["評分項目", "平均分數", "滿分比例"],
      rows: metrics.map((metric, index) => [metric.label, `${display(metric.value)} / 20`, `${display(values[index])}%`]),
    });
    const dataPoints = values.map((value, index) => { const point = polarPoint(index, 3, 110 * value / 100); return `${point.x},${point.y}`; }).join(" "); els.radar.innerHTML = `<svg class="radar-svg" viewBox="0 0 340 340" role="img" aria-label="隊伍三維平均雷達圖"><g class="radar-grid">${grid}${axes}</g><polygon class="radar-data" points="${dataPoints}" />${values.map((value, index) => { const point = polarPoint(index, 3, 110 * value / 100); return `<circle cx="${point.x}" cy="${point.y}" r="4" />`; }).join("")}</svg>${dataTable}`; window.DebateInteractions.setChartExpansionAvailability(els.radar, true, "");
  }

  function sideScoreMarkup(record, side, label) { return `<div class="team-ballot-side"><strong>${label}方｜總分 ${display(sideTotal(record, side))}</strong>${[1, 2, 3].map((position) => `<div><b>${label}${["一", "二", "三"][position - 1]}</b><span>申論 ${display(record[`${side}P${position}Speech`])}</span><span>質詢 ${display(record[`${side}P${position}Question`])}</span><span>答辯 ${display(record[`${side}P${position}Defense`])}</span></div>`).join("")}<small>架構 ${display(record[`${side}Argument`])} · 結辯 ${display(record[`${side}Closing`])}</small></div>`; }
  function ballotMarkup(record, index) { const result = ballotResult(record); return `<article class="personal-record-item team-ballot-item"><div class="personal-record-title"><div><span>第 ${index + 1} 張 · ${result.status}</span><strong>${escapeHtml(record.judge || "未填裁判")}</strong><small>我方${escapeHtml(record.side)}方 · 正 ${display(result.aff)}：${display(result.neg)} 反</small></div><div class="personal-record-controls"><button type="button" data-team-edit="${escapeHtml(record.id)}">修正</button><button type="button" data-team-delete="${escapeHtml(record.id)}">刪除</button></div></div><div class="team-ballot-comparison">${sideScoreMarkup(record, "aff", "正")}${sideScoreMarkup(record, "neg", "反")}</div></article>`; }
  function renderList() { const matchGroups = groups(); if (!matchGroups.length) { els.list.innerHTML = '<div class="record-empty"><span aria-hidden="true">🏫</span><strong>還沒有隊伍裁單</strong><p>逐張輸入後，系統會自動把同一場裁單放在一起。</p></div>'; return; } els.list.innerHTML = matchGroups.map((group) => { const result = resultFor(group); const outcomeClass = result.outcome === "win" ? "is-win" : result.outcome === "loss" ? "is-loss" : "is-pending"; const undecided = group.ballots.length - result.total; return `<section class="ballot-group"><div class="ballot-group-heading"><div><span>${escapeHtml(group.competition || "未填盃賽")} · ${escapeHtml(group.matchDate)}</span><strong>${escapeHtml(group.teamName || "未填隊伍")}｜${group.matchNumber === "" ? "場次未填" : `第 ${escapeHtml(group.matchNumber)} 場`}</strong></div><small>${result.votes}：${result.total - result.votes} · ${result.status}</small></div><div class="team-match-result ${outcomeClass}"><strong>${result.status}</strong><span>已判定 ${result.total}／${group.ballots.length} 張 · 正 ${result.votes}：${result.total - result.votes} 反${undecided ? ` · ${undecided} 張尚無法判定` : ""}${group.ballots.length < 3 ? ` · 還差 ${3 - group.ballots.length} 張` : ""}</span></div><div class="ballot-group-list">${group.ballots.map(ballotMarkup).join("")}</div></section>`; }).join(""); }
  function render() { els.count.textContent = `${records.length} 張`; els.draftStatus.textContent = `第 ${records.length + 1} 張`; els.exportButton.disabled = storageReadFailed || !records.length; els.deleteAllButton.disabled = storageReadFailed || !records.length; renderStats(); renderRadar(); renderList(); }

  function updateLiveTotals() { const draft = getDraft(); els.affTotal.textContent = `總分 ${display(sideTotal(draft, "aff"))}`; els.negTotal.textContent = `總分 ${display(sideTotal(draft, "neg"))}`; const affirmative = els.side.value === "正"; els.affBadge.classList.toggle("is-hidden", !affirmative); els.negBadge.classList.toggle("is-hidden", affirmative); }
  function showMessage(message, isError = false) { els.message.textContent = message; els.message.classList.toggle("is-error", isError); }
  function clearForm() { [els.competition, els.teamName, els.judge, els.matchNumber, ...[...SCORE_KEYS, ...EXTRA_KEYS].map((key) => els[key])].forEach((input) => { input.value = ""; }); els.matchDate.value = ""; els.side.value = "正"; updateLiveTotals(); }
  function exitEdit(clear = false) { editingId = ""; els.nextButton.disabled = false; els.cancelEdit.classList.add("is-hidden"); els.submitButton.textContent = "輸入完成"; if (clear) clearForm(); }
  function startEdit(id) { const record = records.find((item) => item.id === id); if (!record) return; editingId = id; [[els.competition, record.competition], [els.teamName, record.teamName], [els.judge, record.judge], [els.matchDate, record.matchDate], [els.matchNumber, record.matchNumber], [els.side, record.side]].forEach(([element, value]) => setValue(element, value)); [...SCORE_KEYS, ...EXTRA_KEYS].forEach((key) => setValue(els[key], record[key])); updateLiveTotals(); els.nextButton.disabled = true; els.cancelEdit.classList.remove("is-hidden"); els.submitButton.textContent = "儲存修正"; showMessage("正在修正這張隊伍裁單。", false); els.form.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }
  function addRecord(continueEntry = false) { if (!window.DebateRecordStorage.isValid(els.form)) return; if (editingId) { const index = records.findIndex((record) => record.id === editingId); if (index < 0) return; const nextRecords = [...records]; nextRecords[index] = getDraft(records[index]); if (!saveRecords(nextRecords)) return; exitEdit(true); render(); showMessage("隊伍裁單修正已儲存。", false); return; } const draft = getDraft(); if (!saveRecords([...records, draft])) return; render(); const group = groups().find((item) => item.ballots.some((record) => record.id === draft.id)); const ballot = ballotResult(draft); const message = group?.ballots.length > 3 ? `提醒：這場已有 ${group.ballots.length} 張裁單，仍會依全部可判定裁判票計算。` : group?.ballots.length === 3 ? `已湊齊三張：${resultFor(group).status}。本張為${ballot.status}（正 ${display(ballot.aff)}：${display(ballot.neg)} 反）。` : `已暫存第 ${group?.ballots.length || 1} 張，本張為${ballot.status}。`; showMessage(message, false); if (continueEntry) els.judge.focus(); else { clearForm(); document.querySelector("#teamSummaryTitle")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); } }

  function exportCsv() { if (storageReadFailed) { showMessage(window.DebateRecordStorage.loadFailureMessage(), true); return; } const rows = [CSV_HEADERS, ...records.map((record) => [record.competition, record.matchNumber, record.matchDate, record.teamName, record.side, record.judge, ...SIDES.flatMap((side) => [1, 2, 3].flatMap((position) => METRICS.map((metric) => record[`${side}P${position}${metric}`]))), record.affArgument, record.affClosing, record.negArgument, record.negClosing, sideTotal(record, "aff") ?? "", sideTotal(record, "neg") ?? "", ballotResult(record).status, record.createdAt])]; const csv = RecordCsv.serialize(rows); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `我的隊伍辯論裁單-${window.DebateRecordStorage.localDateStamp()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); showMessage(`已下載 ${records.length} 張隊伍裁單，請妥善保存這份 CSV。`, false); }
  function parseTeamRecords(text, { createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`, now = () => new Date().toISOString() } = {}) {
    const rows = RecordCsv.parse(text);
    const headers = rows.shift()?.map((item) => item.trim()) || [];
    const value = (row, name) => row[headers.indexOf(name)] ?? "";
    if (!headers.includes("隊伍名稱") || !headers.includes("正1申論")) throw new Error("unsupported csv");
    const label = { Speech: "申論", Question: "質詢", Defense: "答辯" };
    return rows.map((row) => {
      const record = {
        id: createId(), competition: value(row, "盃賽"),
        matchNumber: value(row, "此盃第幾場") === "" ? "" : Number(value(row, "此盃第幾場")),
        matchDate: value(row, "比賽日期"), teamName: value(row, "隊伍名稱"), side: value(row, "我方持方"),
        judge: value(row, "裁判姓名"), affArgument: value(row, "正方架構論點"), affClosing: value(row, "正方結辯"),
        negArgument: value(row, "反方架構論點"), negClosing: value(row, "反方結辯"),
        createdAt: value(row, "建立時間") || now(),
      };
      SIDES.forEach((side) => [1, 2, 3].forEach((position) => METRICS.forEach((metric) => {
        record[`${side}P${position}${metric}`] = value(row, `${side === "aff" ? "正" : "反"}${position}${label[metric]}`);
      })));
      validateImportedRecord(record);
      return normalize(record);
    });
  }

  async function importCsv(file) {
    try {
      const imported = parseTeamRecords(await file.text());
      const additions = uniqueImportedRecords(records, imported);
      if (!saveRecords([...records, ...additions])) return;
      render();
      const skipped = imported.length - additions.length;
      showMessage(`已匯入 ${additions.length} 張隊伍裁單${skipped ? `，重複資料已略過 ${skipped} 張` : ""}。`, false);
    } catch (_error) {
      showMessage("匯入失敗，請確認 CSV 欄位正確，場次與分數符合欄位範圍。", true);
    } finally {
      els.importInput.value = "";
    }
  }

  function initModePicker() {
    const tabs = [...document.querySelectorAll("[data-archive-mode]")];
    const activate = (button) => {
      const teamMode = button.dataset.archiveMode === "team";
      document.querySelector("#personalArchivePanel").classList.toggle("is-hidden", teamMode);
      document.querySelector("#teamArchivePanel").classList.toggle("is-hidden", !teamMode);
      tabs.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
      });
    };
    tabs.forEach((button) => button.addEventListener("click", () => activate(button)));
    document.querySelector(".archive-mode-picker")?.addEventListener("keydown", (event) => {
      const current = event.target.closest("[data-archive-mode]");
      if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const index = tabs.indexOf(current);
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      const next = tabs[nextIndex];
      activate(next);
      next.focus();
    });
  }
  function init({ events = [] } = {}) {
    els = { form: document.querySelector("#teamRecordForm"), competition: document.querySelector("#teamCompetition"), teamName: document.querySelector("#teamName"), judge: document.querySelector("#teamJudge"), matchDate: document.querySelector("#teamMatchDate"), matchNumber: document.querySelector("#teamMatchNumber"), side: document.querySelector("#teamSide"), affTotal: document.querySelector("#teamAffTotal"), negTotal: document.querySelector("#teamNegTotal"), affBadge: document.querySelector("#affirmativeMySideBadge"), negBadge: document.querySelector("#negativeMySideBadge"), message: document.querySelector("#teamRecordMessage"), storageError: document.querySelector("#teamStorageError"), draftStatus: document.querySelector("#teamDraftStatus"), count: document.querySelector("#teamRecordCount"), stats: document.querySelector("#teamRecordStats"), radar: document.querySelector("#teamRadarChart"), list: document.querySelector("#teamRecordList"), nextButton: document.querySelector("#teamNextBallot"), cancelEdit: document.querySelector("#teamCancelEdit"), submitButton: document.querySelector("#teamSubmitRecord"), exportButton: document.querySelector("#teamExportCsv"), importInput: document.querySelector("#teamImportCsv"), deleteAllButton: document.querySelector("#teamDeleteAll") };
    [...SCORE_KEYS, ...EXTRA_KEYS].forEach((key) => { els[key] = document.querySelector(`#team${key[0].toUpperCase()}${key.slice(1)}`); }); if (!els.form) return;
    document.querySelector("#teamCompetitionList").innerHTML = events.map((event) => `<option value="${escapeHtml(event.name)}"></option>`).join(""); records = readRecords(); els.matchDate.value = ""; initModePicker(); updateLiveTotals();
    if (storageReadFailed) { [els.nextButton, els.submitButton, els.exportButton, els.deleteAllButton, els.importInput].forEach((control) => { control.disabled = true; }); showStorageReadFailure(); }
    els.side.addEventListener("change", updateLiveTotals); [...SCORE_KEYS, ...EXTRA_KEYS].forEach((key) => els[key].addEventListener("input", updateLiveTotals)); els.nextButton.addEventListener("click", () => addRecord(true)); els.cancelEdit.addEventListener("click", () => { exitEdit(true); showMessage("已取消修正。", false); }); els.form.addEventListener("submit", (event) => { event.preventDefault(); addRecord(false); }); els.exportButton.addEventListener("click", exportCsv); els.importInput.addEventListener("change", () => importCsv(els.importInput.files?.[0])); els.deleteAllButton.addEventListener("click", () => { if (!records.length || !confirm(`確定刪除全部 ${records.length} 張隊伍裁單嗎？`)) return; if (!saveRecords([])) return; exitEdit(true); render(); showMessage("隊伍裁單已全部刪除。", false); }); els.list.addEventListener("click", (event) => { const edit = event.target.closest("[data-team-edit]"); if (edit) return startEdit(edit.dataset.teamEdit); const remove = event.target.closest("[data-team-delete]"); if (!remove) return; if (!saveRecords(records.filter((record) => record.id !== remove.dataset.teamDelete))) return; if (editingId === remove.dataset.teamDelete) exitEdit(true); render(); showMessage("這張隊伍裁單已刪除。", false); }); render();
  }
  window.DebateTeamRecords = { init, resolveResult, uniqueImportedRecords, parseTeamRecords };
}());
