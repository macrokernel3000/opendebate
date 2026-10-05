(function () {
  function cell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function serialize(rows) {
    return `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\n")}`;
  }

  function parse(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    const source = String(text ?? "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted && character === '"' && source[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === "," && !quoted) { row.push(value); value = ""; }
      else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(value); rows.push(row); row = []; value = "";
      } else value += character;
    }
    if (value || row.length) { row.push(value); rows.push(row); }
    return rows.filter((item) => item.some((entry) => entry.trim() !== ""));
  }

  function number(value) {
    if (String(value ?? "").trim() === "") return "";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error("invalid number");
    return parsed;
  }

  function maximum(value, fallback) {
    if (String(value ?? "").trim() === "") return fallback;
    const parsed = number(value);
    if (parsed < 0.1 || Math.abs(parsed * 10 - Math.round(parsed * 10)) > 1e-7) throw new Error("invalid score maximum");
    return parsed;
  }

  function validateRecord(record, metrics) {
    const validStep = (value, minimum, step, maximumValue = Number.POSITIVE_INFINITY) => value === "" || (Number.isFinite(Number(value))
      && Number(value) >= minimum && Number(value) <= maximumValue
      && Math.abs(Number(value) / step - Math.round(Number(value) / step)) < 1e-7);
    if (!validStep(record.matchNumber, 1, 1) || !validStep(record.rank, 1, 1, 6)) throw new Error("invalid match number or rank");
    metrics.forEach((metric) => {
      if (!validStep(record[metric.key], 0, 0.1, Number(record[metric.maxKey])) || !validStep(record[metric.maxKey], 0.1, 0.1)) throw new Error("invalid score");
    });
  }

  const METRICS = [
    { key: "argument", maxKey: "argumentMax", defaultMax: 10 },
    { key: "speech", maxKey: "speechMax", defaultMax: 20 },
    { key: "question", maxKey: "questionMax", defaultMax: 20 },
    { key: "defense", maxKey: "defenseMax", defaultMax: 20 },
    { key: "closing", maxKey: "closingMax", defaultMax: 10 },
  ];

  function parsePersonalRecords(text, { createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`, now = () => new Date().toISOString() } = {}) {
    const rows = parse(text);
    const headers = rows.shift()?.map((header) => header.trim()) || [];
    const get = (row, ...names) => {
      const index = names.map((name) => headers.indexOf(name)).find((candidate) => candidate >= 0);
      return index === undefined ? "" : row[index];
    };
    if (!headers.includes("申論") && !headers.includes("盃賽")) throw new Error("unsupported csv");
    const imported = rows.map((row) => ({
      id: createId(),
      competition: get(row, "盃賽", "盃賽名稱"),
      matchNumber: number(get(row, "此盃第幾場", "場次")),
      matchDate: get(row, "比賽日期", "日期"),
      name: get(row, "姓名", "選手姓名"),
      judge: get(row, "裁判姓名", "裁判"),
      argument: number(get(row, "論點分", "該場論點分")),
      argumentMax: maximum(get(row, "論點滿分"), 10),
      speech: number(get(row, "申論")),
      speechMax: maximum(get(row, "申論滿分"), 20),
      question: number(get(row, "質詢")),
      questionMax: maximum(get(row, "質詢滿分"), 20),
      defense: number(get(row, "答辯")),
      defenseMax: maximum(get(row, "答辯滿分"), 20),
      closing: number(get(row, "結辯")),
      closingMax: maximum(get(row, "結辯滿分"), 10),
      rank: number(get(row, "排名", "排名為1", "排名為 1")),
      createdAt: get(row, "建立時間") || now(),
    }));
    imported.forEach((record) => validateRecord(record, METRICS));
    return imported;
  }

  window.DebateRecordCsv = { serialize, parse, parsePersonalRecords, number, maximum, validateRecord };
}());
