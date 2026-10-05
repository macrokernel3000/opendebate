const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(root, "js/record-csv.js"), "utf8"), { window, Number, String, Math, Error });
const csv = window.DebateRecordCsv;
const metrics = [
  { key: "speech", maxKey: "speechMax" },
  { key: "question", maxKey: "questionMax" },
  { key: "defense", maxKey: "defenseMax" },
];

test("personal CSV round-trips BOM, CRLF, commas, quotes and multiline cells", () => {
  const rows = [
    ["盃賽", "備註"],
    ["測試,年度", '引用 "來源"\n第二行'],
  ];
  const serialized = csv.serialize(rows).replaceAll("\n", "\r\n");

  assert.equal(serialized.charCodeAt(0), 0xFEFF);
  const expected = [rows[0], [rows[1][0], rows[1][1].replace("\n", "\r\n")]];
  assert.deepEqual(Array.from(csv.parse(serialized), (row) => Array.from(row)), expected);
});

test("personal CSV rejects malformed quotation instead of silently shifting fields", () => {
  assert.throws(() => csv.parse('標題,備註\n測試,"引號未結束'), /unterminated csv quote/);
  assert.throws(() => csv.parse('標題,備註\n錯誤欄位,未"跳脫'), /invalid csv quoting/);
  assert.throws(() => csv.parse('標題,備註\n"引號已結束"多餘文字,其他'), /invalid csv quoting/);
});

test("personal CSV number and maximum validation accepts blanks and decimal scoring", () => {
  assert.equal(csv.number(""), "");
  assert.equal(csv.number(" 2.5 "), 2.5);
  assert.equal(csv.maximum("", 20), 20);
  assert.equal(csv.maximum("10.5", 20), 10.5);
  assert.throws(() => csv.number("不是數字"), /invalid number/);
  assert.throws(() => csv.maximum("0", 20), /invalid score maximum/);
  assert.throws(() => csv.maximum("10.55", 20), /invalid score maximum/);
});

test("personal CSV records reject invalid ranks and scores above their declared maximum", () => {
  const record = { matchNumber: 1, rank: 3, speech: 18, speechMax: 20, question: 16, questionMax: 20, defense: 15, defenseMax: 20 };
  assert.doesNotThrow(() => csv.validateRecord(record, metrics));
  assert.throws(() => csv.validateRecord({ ...record, rank: 7 }, metrics), (error) => error.message === "invalid rank" && error.fieldKey === "rank");
  assert.throws(() => csv.validateRecord({ ...record, speech: 20.1 }, metrics), (error) => error.message === "invalid score" && error.fieldKey === "speech");
  assert.throws(() => csv.validateRecord({ ...record, question: 21, questionMax: 20 }, metrics), (error) => error.message === "invalid score" && error.fieldKey === "question");
  assert.throws(() => csv.validateRecord({ ...record, speechMax: 20.05 }, metrics), (error) => error.message === "invalid score maximum" && error.fieldKey === "speechMax");
});

test("personal CSV import maps exported columns without inventing dates", () => {
  const headers = ["盃賽", "此盃第幾場", "比賽日期", "姓名", "裁判姓名", "論點分", "論點滿分", "申論", "申論滿分", "質詢", "質詢滿分", "答辯", "答辯滿分", "結辯", "結辯滿分", "排名", "建立時間"];
  const row = ["測試,盃", "2", "", "陳\"選手", "裁判甲", "8.5", "10", "18", "20", "19.5", "20", "20", "20", "9", "10", "1", "2026-01-01T00:00:00.000Z"];
  const csvText = csv.serialize([headers, row]);
  let id = 0;
  const imported = csv.parsePersonalRecords(csvText, { createId: () => `test-${++id}` });

  assert.deepEqual(Array.from(imported, (record) => ({
    id: record.id,
    competition: record.competition,
    matchNumber: record.matchNumber,
    matchDate: record.matchDate,
    name: record.name,
    argument: record.argument,
    question: record.question,
    createdAt: record.createdAt,
  })), [{
    id: "test-1",
    competition: "測試,盃",
    matchNumber: 2,
    matchDate: "",
    name: "陳\"選手",
    argument: 8.5,
    question: 19.5,
    createdAt: "2026-01-01T00:00:00.000Z",
  }]);
});

test("personal CSV import accepts legacy column aliases and rejects over-limit scores", () => {
  const headers = ["盃賽名稱", "場次", "日期", "選手姓名", "裁判", "該場論點分", "申論", "排名為1"];
  const row = ["舊檔", "1", "2025-05-03", "林選手", "裁判乙", "8", "21", "1"];
  const csvText = csv.serialize([headers, row]);
  assert.throws(() => csv.parsePersonalRecords(csvText), /invalid score/);
  const validCsv = csv.serialize([headers, ["舊檔", "1", "2025-05-03", "林選手", "裁判乙", "8", "20", "1"]]);
  const [imported] = csv.parsePersonalRecords(validCsv, { createId: () => "legacy" });

  assert.equal(imported.competition, "舊檔");
  assert.equal(imported.matchDate, "2025-05-03");
  assert.equal(imported.name, "林選手");
  assert.equal(imported.rank, 1);
  assert.equal(imported.argumentMax, 10);
  assert.equal(imported.speechMax, 20);
});
