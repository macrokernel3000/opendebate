(function () {
  function createRouter({
    els,
    getEvents,
    getTopics,
    getUpcomingEvents,
    getCalendarActivities = () => [],
    getKnownPeople,
    store,
    legacyEntityIds = {},
    renderEvent,
    renderUpcomingEvent,
    renderActivity = () => {},
    renderEntityDetail,
    renderPlayerDetail,
    renderTopic,
    onViewChange = () => {},
    closeTransientUI = () => {},
  }) {
    let hasRenderedRoute = false;
    const pageLabels = {
      home: "首頁",
      overview: "總覽",
      search: "搜尋",
      archive: "辯論建檔",
      reports: "資料回報",
    };
    const siteTitle = "公開辯論資訊網";

    function showView(name) {
      closeTransientUI();
      const requested = name === "events" ? "overview" : name;
      const eventRoute = requested.match(/^event\/(.+)$/);
      const activityRoute = requested.match(/^activity\/(.+)$/);
      const schoolRoute = requested.match(/^school\/(.+)$/);
      const playerRoute = requested.match(/^player\/(.+)$/);
      const topicRoute = requested.match(/^topic\/(.+)$/);
      const events = getEvents();
      const topics = getTopics();
      let eventName = "";
      let schoolId = "";
      let playerName = "";
      let topicId = "";
      let upcomingEvent = null;
      let activity = null;

      if (activityRoute) {
        let activityId = "";
        try { activityId = decodeURIComponent(activityRoute[1]); } catch { activityId = ""; }
        activity = getCalendarActivities()?.find((item) => item.id === activityId) || null;
      }

      if (eventRoute) {
        try { eventName = decodeURIComponent(eventRoute[1]); } catch { eventName = ""; }
        upcomingEvent = getUpcomingEvents()?.find((event) => event.name === eventName) || null;
        if (!events.some((event) => event.name === eventName) && !upcomingEvent) eventName = "";
      }
      if (schoolRoute) {
        try { schoolId = decodeURIComponent(schoolRoute[1]); } catch { schoolId = ""; }
        const requestedSchoolId = schoolId;
        const canonicalSchoolId = legacyEntityIds[schoolId];
        if (canonicalSchoolId && store.entityById.has(canonicalSchoolId)) schoolId = canonicalSchoolId;
        if (!store.entityById.has(schoolId)) schoolId = "";
        if (schoolId && requestedSchoolId !== schoolId) {
          history.replaceState(history.state, "", `#school/${encodeURIComponent(schoolId)}`);
        }
      }
      if (playerRoute) {
        try { playerName = decodeURIComponent(playerRoute[1]); } catch { playerName = ""; }
        if (!getKnownPeople().includes(playerName)) playerName = "";
      }
      if (topicRoute) {
        try { topicId = decodeURIComponent(topicRoute[1]); } catch { topicId = ""; }
        if (!topics.some((item) => item.topicId === topicId)) topicId = "";
      }

      const target = activity ? "event-page" : eventName ? "event-page" : schoolId ? "school-page" : playerName ? "player-page" : topicId ? "topic-page" : (["home", "overview", "search", "archive", "reports"].includes(requested) ? requested : "home");
      els.views.forEach((view) => view.classList.toggle("is-hidden", view.dataset.viewPanel !== target));
      const currentNav = ["home", "overview", "search", "archive", "reports"].includes(target) ? target : "";
      els.navButtons.forEach((button) => {
        const isCurrent = button.dataset.view === currentNav;
        button.classList.toggle("is-active", isCurrent);
        if (isCurrent) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      document.querySelectorAll("[data-menu-view]").forEach((button) => {
        if (button.dataset.menuView === currentNav) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });

      const entityName = schoolId ? store.entityById.get(schoolId)?.name : "";
      const topicName = topicId ? topics.find((item) => item.topicId === topicId)?.topic : "";
      const pageName = activity?.name || eventName || entityName || playerName || topicName || pageLabels[target] || "";
      document.title = pageName ? `${pageName}｜${siteTitle}` : `${siteTitle}｜台灣高中辯論戰績資料庫`;
      els.overviewView.classList.remove("is-event-open");
      els.overviewEventsPanel.classList.remove("is-event-open");

      if (eventName) {
        if (events.some((event) => event.name === eventName)) renderEvent(eventName, els.eventPageDetail);
        else renderUpcomingEvent(upcomingEvent, els.eventPageDetail);
      }
      if (activity) renderActivity(activity, els.eventPageDetail);
      if (schoolId) els.schoolPageDetail.innerHTML = renderEntityDetail(store.entityById.get(schoolId), "schoolPageEntityDetail", true);
      if (playerName) els.playerPageDetail.innerHTML = renderPlayerDetail(playerName);
      if (topicId) renderTopic(topicId);
      if (target === "overview") els.eventDetail.innerHTML = "";
      onViewChange(target);

      const routeHash = activity ? `#activity/${encodeURIComponent(activity.id)}` : eventName ? `#event/${encodeURIComponent(eventName)}` : schoolId ? `#school/${encodeURIComponent(schoolId)}` : playerName ? `#player/${encodeURIComponent(playerName)}` : topicId ? `#topic/${encodeURIComponent(topicId)}` : `#${target}`;
      let routeHref = routeHash;
      if (target === "search" || /(?:^\?|&)q=/.test(location.search || "")) {
        const routeUrl = new URL(location.href);
        if (target === "search") {
          const query = els.globalSearch.value.trim();
          if (query) routeUrl.searchParams.set("q", query);
          else routeUrl.searchParams.delete("q");
        } else {
          routeUrl.searchParams.delete("q");
        }
        routeUrl.hash = routeHash;
        routeHref = `${routeUrl.pathname}${routeUrl.search}${routeUrl.hash}`;
      }
      const isLegacySchoolRoute = Boolean(schoolRoute && schoolId && decodeURIComponent(schoolRoute[1]) !== schoolId);
      if (!isLegacySchoolRoute && location.hash !== routeHash) {
        if (!hasRenderedRoute) history.replaceState(null, "", routeHref);
        else history.pushState({ from: location.hash || "#home" }, "", routeHref);
      }
      const shouldMoveFocus = hasRenderedRoute;
      hasRenderedRoute = true;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      window.scrollTo({ top: 0, behavior });
      if (target === "search") requestAnimationFrame(() => els.globalSearch.focus({ preventScroll: true }));
      else if (shouldMoveFocus) requestAnimationFrame(() => {
        const panel = [...els.views].find((view) => view.dataset.viewPanel === target);
        const heading = [...(panel?.querySelectorAll("h1, h2") || [])].find((item) => item.getClientRects().length);
        if (!panel?.classList.contains("is-hidden") && heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      });
    }

    return { showView };
  }

  window.DebateRouter = { createRouter };
})();
