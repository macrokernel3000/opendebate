(function () {
  function createSnapshotNavigator(showView, isOfflineSnapshot, showOfflineSnapshotNotice, resetOfflineRoute) {
    return (name) => {
      if (isOfflineSnapshot() && name !== "home") {
        showOfflineSnapshotNotice();
        resetOfflineRoute?.();
        return false;
      }
      showView(name);
      return true;
    };
  }

  function skipToMainContent(event, main, behavior = "auto") {
    event.preventDefault();
    if (!main) return;
    main.focus({ preventScroll: true });
    main.scrollIntoView({ behavior, block: "start" });
  }

  function syncSearchQuery(searchField, currentLocation = location, currentHistory = history) {
    if (!searchField || currentLocation.hash !== "#search") return false;
    try {
      const url = new URL(currentLocation.href);
      const query = searchField.value.trim();
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      currentHistory.replaceState(currentHistory.state, "", `${url.pathname}${url.search}${url.hash}`);
      return true;
    } catch {
      return false;
    }
  }

  function keepDialogTabFocus(dialog, event) {
    if (!dialog || event.key !== "Tab") return false;
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
      return true;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  function setChartExpansionAvailability(chartContent, available, unavailableLabel) {
    const chart = chartContent?.closest(".record-chart");
    const button = chart?.querySelector("[data-expand-chart]");
    if (!button) return;
    button.dataset.collapsedLabel ||= button.getAttribute("aria-label") || "放大圖表";
    button.dataset.unavailableLabel = unavailableLabel;
    button.dataset.chartAvailable = String(Boolean(available));
    if (chart.classList.contains("is-expanded")) return;
    button.disabled = !available;
    button.setAttribute("aria-label", available ? button.dataset.collapsedLabel : unavailableLabel);
    button.title = available ? "放大圖表" : unavailableLabel;
  }

  function setupInteractions({ els, showView, renderEvent, renderSearch, renderEventFinder, renderOverviewStats, selectEntity, renderOverviewTeams, renderOverviewTopics, selectOverviewTeam, showOverviewTab }) {
    const isOfflineSnapshot = () => Boolean(window.DebateHomeSnapshot?.restored && !window.DEBATE_PUBLIC_DATA?.records?.length);
    const showOfflineSnapshotNotice = () => {
      const notice = document.querySelector("[data-snapshot-warning]");
      if (notice) notice.textContent = "目前暫時離線，只能瀏覽上次載入的首頁；賽事、學校與選手詳情需連線後查看。";
    };
    const resetOfflineRoute = () => {
      if (location.hash !== "#home") history.replaceState(null, "", "#home");
    };
    const navigate = createSnapshotNavigator(showView, isOfflineSnapshot, showOfflineSnapshotNotice, resetOfflineRoute);
    const openCompetition = (name) => navigate(`event/${encodeURIComponent(name)}`);
    const preferredScrollBehavior = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.querySelector(".skip-link")?.addEventListener("click", (event) => {
      skipToMainContent(event, document.querySelector("#mainContent"), preferredScrollBehavior());
    });
    els.overviewStatsChart?.addEventListener("focus", (event) => {
      const chart = event.currentTarget;
      if (chart.matches(":focus-visible")) chart.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
    });
    const calendarHelp = document.querySelector("#androidCalendarHelp");
    document.querySelector("[data-calendar-subscribe]")?.addEventListener("click", (event) => {
      if (/Android/i.test(navigator.userAgent) && calendarHelp?.showModal) {
        event.preventDefault();
        calendarHelp.showModal();
      }
    });
    document.querySelector("#copyAndroidCalendarUrl")?.addEventListener("click", async () => {
      const field = document.querySelector("#androidCalendarUrl");
      const status = document.querySelector("#calendarCopyStatus");
      try {
        await navigator.clipboard.writeText(field.value);
        status.textContent = "已複製。";
      } catch {
        field.focus();
        field.select();
        status.textContent = "已選取網址，請長按複製。";
      }
    });
    document.querySelector("#copyEventIntakePrompt")?.addEventListener("click", async () => {
      const prompt = document.querySelector("#eventIntakePrompt")?.textContent.trim() || "";
      const status = document.querySelector("#reportPromptCopyStatus");
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(prompt);
        status.textContent = "整理指令已複製，可以貼給 AI。";
      } catch {
        const field = document.createElement("textarea");
        field.value = prompt;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        status.textContent = copied ? "整理指令已複製，可以貼給 AI。" : "無法自動複製，請長按上方指令選取複製。";
      }
    });
    const closeMobileMenu = () => {
      const toggle = document.querySelector("#mobileMenuToggle");
      const menu = document.querySelector("#mobileQuickMenu");
      toggle?.setAttribute("aria-expanded", "false");
      toggle?.setAttribute("aria-label", "開啟快捷選單");
      if (menu) menu.hidden = true;
    };
    function openTopicEvent(event) {
      const card = event.target.closest("[data-topic-event]");
      if (!card) return;
      openCompetition(card.dataset.topicEvent);
      if (!window.matchMedia("(max-width: 640px)").matches) requestAnimationFrame(() => els.eventDetail.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }));
    }
    els.navButtons.forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
    const mobileMenuToggle = document.querySelector("#mobileMenuToggle");
    const mobileQuickMenu = document.querySelector("#mobileQuickMenu");
    mobileMenuToggle?.addEventListener("click", () => {
      const expanded = mobileMenuToggle.getAttribute("aria-expanded") === "true";
      mobileMenuToggle.setAttribute("aria-expanded", String(!expanded));
      mobileMenuToggle.setAttribute("aria-label", expanded ? "開啟快捷選單" : "關閉快捷選單");
      mobileQuickMenu.hidden = expanded;
    });
    mobileQuickMenu?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-menu-view]");
      if (!button) return;
      navigate(button.dataset.menuView);
      closeMobileMenu();
    });
    document.addEventListener("click", (event) => {
      if (!mobileQuickMenu?.hidden && !event.target.closest("#mobileQuickMenu, #mobileMenuToggle")) closeMobileMenu();
    });
    document.addEventListener("click", (event) => {
      const entityLink = event.target.closest("[data-entity-route]");
      if (entityLink) { navigate(`school/${encodeURIComponent(entityLink.dataset.entityRoute)}`); return; }
      const playerLink = event.target.closest("[data-player-route]");
      if (playerLink) { navigate(`player/${encodeURIComponent(playerLink.dataset.playerRoute)}`); return; }
      const eventLink = event.target.closest("[data-event-route]");
      if (eventLink) { openCompetition(eventLink.dataset.eventRoute); return; }
      const topicLink = event.target.closest("[data-topic-route]");
      if (topicLink) { navigate(`topic/${encodeURIComponent(topicLink.dataset.topicRoute)}`); return; }
      if (event.target.closest("[data-detail-back]")) {
        if (history.state?.from) history.back();
        else navigate("overview");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mobileQuickMenu && !mobileQuickMenu.hidden) {
        closeMobileMenu();
        mobileMenuToggle?.focus();
      }
    });

    els.homeBrand.addEventListener("click", (event) => { event.preventDefault(); navigate("home"); });
    const restoreBrowserRoute = () => {
      const target = location.hash.slice(1) || "home";
      navigate(target);
      if (target === "events") showOverviewTab("events");
    };
    window.addEventListener("hashchange", restoreBrowserRoute);
    window.addEventListener("popstate", restoreBrowserRoute);
    document.querySelectorAll("[data-go-search]").forEach((button) => button.addEventListener("click", () => navigate("search")));
    document.querySelectorAll("[data-go-events]").forEach((button) => button.addEventListener("click", () => { navigate("overview"); if (!isOfflineSnapshot()) showOverviewTab("events"); }));
    const openRecentEvent = (event) => {
      const card = event.target.closest("[data-event-name]");
      if (!card) return;
      openCompetition(card.dataset.eventName);
    };
    els.recentEvents.addEventListener("click", openRecentEvent);
    els.mobileRecentEvents?.addEventListener("click", openRecentEvent);
    els.mobileUpcomingEvents?.addEventListener("click", (event) => {
      const activityCard = event.target.closest("[data-activity-id]");
      if (activityCard) { navigate(`activity/${encodeURIComponent(activityCard.dataset.activityId)}`); return; }
      openRecentEvent(event);
    });

    let suppressTimelineClick = false;
    let timelineDrag = null;
    els.eventTimeline.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      timelineDrag = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: els.eventTimeline.scrollLeft, moved: false };
      els.eventTimeline.setPointerCapture(event.pointerId);
      els.eventTimeline.classList.add("is-dragging");
    });
    els.eventTimeline.addEventListener("pointermove", (event) => {
      if (!timelineDrag || timelineDrag.pointerId !== event.pointerId) return;
      const distance = event.clientX - timelineDrag.startX;
      if (Math.abs(distance) > 5) timelineDrag.moved = true;
      els.eventTimeline.scrollLeft = timelineDrag.scrollLeft - distance;
    });
    function finishTimelineDrag(event) {
      if (!timelineDrag || timelineDrag.pointerId !== event.pointerId) return;
      suppressTimelineClick = timelineDrag.moved;
      timelineDrag = null;
      els.eventTimeline.classList.remove("is-dragging");
      window.setTimeout(() => { suppressTimelineClick = false; }, 300);
    }
    els.eventTimeline.addEventListener("pointerup", finishTimelineDrag);
    els.eventTimeline.addEventListener("pointercancel", finishTimelineDrag);
    els.eventTimeline.addEventListener("wheel", (event) => {
      if (window.matchMedia("(max-width: 640px)").matches || els.eventTimeline.scrollWidth <= els.eventTimeline.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      els.eventTimeline.scrollLeft += event.deltaY;
      event.preventDefault();
    }, { passive: false });
    els.eventTimeline.addEventListener("click", (event) => {
      if (suppressTimelineClick) { event.preventDefault(); suppressTimelineClick = false; return; }
      const node = event.target.closest("[data-event-name]");
      if (!node) return;
      if (window.matchMedia("(hover: none)").matches && !node.classList.contains("timeline-upcoming-node") && !node.classList.contains("is-revealed")) {
        els.eventTimeline.querySelectorAll(".is-revealed").forEach((item) => item.classList.remove("is-revealed"));
        node.classList.add("is-revealed");
        node.focus();
        return;
      }
      openCompetition(node.dataset.eventName);
    });
    els.eventSearch.addEventListener("input", renderEventFinder);
    els.eventYear.addEventListener("change", renderEventFinder);
    els.eventSortBy.addEventListener("change", renderEventFinder);
    els.eventSortDirection.addEventListener("change", renderEventFinder);
    els.overviewStatsMetric.addEventListener("change", renderOverviewStats);
    els.overviewStatsYears.addEventListener("change", renderOverviewStats);
    els.eventFinderResults.addEventListener("click", (event) => {
      const card = event.target.closest("[data-event-name]");
      if (!card) return;
      openCompetition(card.dataset.eventName);
      if (!window.matchMedia("(max-width: 640px)").matches) requestAnimationFrame(() => els.eventDetail.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }));
    });
    els.overviewTabs.forEach((tab) => tab.addEventListener("click", () => showOverviewTab(tab.dataset.overviewTab)));
    document.querySelector(".overview-tabs")?.addEventListener("keydown", (event) => {
      const current = event.target.closest("[data-overview-tab]");
      if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = [...els.overviewTabs];
      const index = tabs.indexOf(current);
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      const next = tabs[nextIndex];
      showOverviewTab(next.dataset.overviewTab);
      next.focus();
    });
    els.overviewTeamFilter.addEventListener("input", renderOverviewTeams);
    els.overviewTeamSortBy.addEventListener("change", renderOverviewTeams);
    els.overviewTeamSortDirection.addEventListener("change", renderOverviewTeams);
    els.overviewTopicFilter.addEventListener("input", renderOverviewTopics);
    els.overviewTopicList.addEventListener("click", openTopicEvent);
    els.overviewTeamList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-overview-team-id]");
      if (card) selectOverviewTeam(card.dataset.overviewTeamId);
    });
    els.globalSearch.addEventListener("input", () => {
      renderSearch(els.globalSearch.value.trim());
      syncSearchQuery(els.globalSearch);
    });
    els.clearSearch.addEventListener("click", () => { els.globalSearch.value = ""; renderSearch(""); syncSearchQuery(els.globalSearch); els.globalSearch.focus(); });
    els.searchResults.addEventListener("click", (event) => {
      const card = event.target.closest("[data-entity-id]");
      if (card) selectEntity(card.dataset.entityId);
      else openTopicEvent(event);
    });
  }

  window.DebateInteractions = { setupInteractions, createSnapshotNavigator, setChartExpansionAvailability, keepDialogTabFocus, skipToMainContent, syncSearchQuery };
}());
