(function () {
  const currentDataScript = document.querySelector("script[data-public-data-script]");
  const notice = document.querySelector("#siteUpdateNotice");
  const reloadButton = document.querySelector("[data-site-update-reload]");
  const dismissButton = document.querySelector("[data-site-update-dismiss]");
  if (!currentDataScript || !notice || !reloadButton || !dismissButton) return;

  function versionOf(script) {
    const source = script?.getAttribute("src");
    return source ? new URL(source, document.baseURI).searchParams.get("v") || "" : "";
  }

  const currentVersion = versionOf(currentDataScript);
  if (!currentVersion) return;

  let updateAvailable = false;
  let lastCheckedAt = 0;
  let checkInProgress = null;

  function showUpdateNotice() {
    if (updateAvailable) return;
    updateAvailable = true;
    notice.hidden = false;
  }

  async function checkForUpdate() {
    if (updateAvailable || document.visibilityState === "hidden" || navigator.onLine === false) return;
    if (checkInProgress) return checkInProgress;

    const now = Date.now();
    if (now - lastCheckedAt < 60_000) return;
    lastCheckedAt = now;

    checkInProgress = (async () => {
      try {
        const pageUrl = new URL("index.html", document.baseURI);
        pageUrl.searchParams.set("_siteVersionCheck", String(now));
        const response = await fetch(pageUrl.toString(), { cache: "no-store" });
        if (!response.ok) return;

        const latestHtml = await response.text();
        const latestDocument = new DOMParser().parseFromString(latestHtml, "text/html");
        const latestDataScript = latestDocument.querySelector("script[data-public-data-script]");
        const latestVersion = versionOf(latestDataScript);
        if (latestVersion && latestVersion !== currentVersion) showUpdateNotice();
      } catch {
        // Version checks are best-effort; an offline or unavailable check must not affect browsing.
      }
    })();

    try {
      await checkInProgress;
    } finally {
      checkInProgress = null;
    }
  }

  reloadButton.addEventListener("click", () => window.location.reload());
  dismissButton.addEventListener("click", () => { notice.hidden = true; });
  window.addEventListener("pageshow", checkForUpdate, { once: true });
  window.setTimeout(checkForUpdate, 60_000);
  window.setInterval(checkForUpdate, 5 * 60_000);
  window.addEventListener("online", checkForUpdate);
  window.addEventListener("focus", checkForUpdate);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
})();
