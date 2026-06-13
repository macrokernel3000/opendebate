(function () {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function formatDate(value) {
    if (!value) return "日期未載明";
    const [year, month, day] = value.split("-");
    return `${year}.${Number(month)}.${Number(day)}`;
  }

  function countBy(items, keyFn) {
    const map = new Map();
    items.forEach((item) => {
      const key = keyFn(item);
      if (key) map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
  }

  function unique(values) { return [...new Set(values.filter(Boolean))]; }
  function normalize(value) { return String(value || "").toLocaleLowerCase("zh-Hant").replace(/\s+/g, ""); }
  function groupByDate(items) {
    return items.reduce((groups, item) => {
      const key = item.matchDate || "日期未載明";
      (groups[key] ||= []).push(item);
      return groups;
    }, {});
  }

  function createStore(source) {
    const data = source || {};
    const entities = data.entities || [];
    const entityById = new Map(entities.map((entity) => [entity.code, entity]));
    const entityByName = new Map();
    entities.forEach((entity) => entityByName.set(normalize(entity.name), entity));
    entities.forEach((entity) => {
      (entity.aliases || "").split("|").filter(Boolean).forEach((name) => {
        const key = normalize(name);
        if (!entityByName.has(key)) entityByName.set(key, entity);
      });
    });
    return {
      records: data.records || [],
      honors: data.honors || [],
      attendance: data.attendance || [],
      entities,
      entityById,
      entityByName,
      entityName(id, fallback = "") { return entityById.get(id)?.name || fallback; },
      entityForName(name) { return entityByName.get(normalize(name)); },
    };
  }

  window.DebateCore = { escapeHtml, formatDate, countBy, unique, normalize, groupByDate, createStore };
}());
