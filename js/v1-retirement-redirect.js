(function redirectOpenDebateV1() {
  "use strict";

  var siteRoot = "https://opendebate.kerneldebate.com/site/";
  var destination = new URL(siteRoot);
  var legacyPath = window.location.pathname.replace(/^\/opendebate\/?/, "");

  if (legacyPath === "debate-records.html" || legacyPath === "debate-records") {
    destination = new URL("debate-records", siteRoot);
  }

  destination.search = window.location.search;
  destination.hash = window.location.hash || (legacyPath ? "" : "#home");

  window.OPENDEBATE_V2_DESTINATION = destination.href;
  var isLocalPreview = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

  document.addEventListener("DOMContentLoaded", function updateFallbackLink() {
    document.querySelectorAll("[data-v2-link]").forEach(function updateLink(link) {
      link.href = destination.href;
    });
  });

  if (!isLocalPreview) {
    window.setTimeout(function replaceLegacyPage() {
      window.location.replace(destination.href);
    }, 450);
  }
})();
