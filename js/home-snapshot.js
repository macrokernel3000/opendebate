(function () {
  const storageKey = "opendebate.home-snapshot.v1";
  const maxAge = 30 * 24 * 60 * 60 * 1000;
  let restored = false;

  function restore() {
    const home = document.querySelector("#homeView");
    if (!home) return false;
    try {
      const snapshot = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (snapshot?.version !== 1 || typeof snapshot.html !== "string") return false;
      if (!Number.isFinite(snapshot.savedAt) || Date.now() - snapshot.savedAt > maxAge) {
        localStorage.removeItem(storageKey);
        return false;
      }
      home.innerHTML = snapshot.html;
      restored = true;
      if ((location.hash && location.hash !== "#home") || location.search) home.classList.add("is-hidden");
      return true;
    } catch {
      return false;
    }
  }

  function save(generatedAt) {
    const home = document.querySelector("#homeView");
    if (!home || home.querySelector("[data-snapshot-warning]")) return;
    try {
      const html = home.innerHTML;
      if (!html || html.length > 1_500_000) return;
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, savedAt: Date.now(), generatedAt: generatedAt || "", html }));
    } catch {
      // Storage can be unavailable or full; live rendering must continue normally.
    }
  }

  function showUnavailable() {
    if (!restored) return false;
    const main = document.querySelector("main");
    if (!main || main.querySelector("[data-snapshot-warning]")) return true;
    const warning = document.createElement("p");
    warning.className = "home-snapshot-status";
    warning.dataset.snapshotWarning = "true";
    warning.setAttribute("role", "status");
    warning.textContent = "暫時無法更新最新資料；首頁先保留上次成功載入的內容。";
    main.prepend(warning);
    return true;
  }

  window.DebateHomeSnapshot = { restore, save, showUnavailable, get restored() { return restored; } };
  restore();
})();
