(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function render({ caption, headers, rows }) {
    if (!Array.isArray(headers) || !Array.isArray(rows)) return "";
    const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("");
    const body = rows.map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return `<tr>${cells.map((cell, index) => index === 0
        ? `<th scope="row">${escapeHtml(cell)}</th>`
        : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
    }).join("");
    return `<details class="chart-data"><summary>以表格檢視圖表數據</summary><div class="chart-data-scroll"><table><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></details>`;
  }

  window.DebateChartDataTable = { render };
}());
