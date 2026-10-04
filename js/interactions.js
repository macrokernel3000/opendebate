(function () {
  function setupInteractions({ els, showView, renderEvent, renderSearch, renderEventFinder, selectEntity, renderOverviewTeams, renderOverviewTopics, selectOverviewTeam, showOverviewTab }) {
    const openCompetition = (name) => showView(`event/${encodeURIComponent(name)}`);
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
      if (!window.matchMedia("(max-width: 640px)").matches) requestAnimationFrame(() => els.eventDetail.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    els.navButtons.forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
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
      showView(button.dataset.menuView);
      closeMobileMenu();
    });
    document.addEventListener("click", (event) => {
      if (!mobileQuickMenu?.hidden && !event.target.closest("#mobileQuickMenu, #mobileMenuToggle")) closeMobileMenu();
    });
    document.addEventListener("click", (event) => {
      const entityLink = event.target.closest("[data-entity-route]");
      if (entityLink) { showView(`school/${encodeURIComponent(entityLink.dataset.entityRoute)}`); return; }
      const playerLink = event.target.closest("[data-player-route]");
      if (playerLink) { showView(`player/${encodeURIComponent(playerLink.dataset.playerRoute)}`); return; }
      const eventLink = event.target.closest("[data-event-route]");
      if (eventLink) { openCompetition(eventLink.dataset.eventRoute); return; }
      const topicLink = event.target.closest("[data-topic-route]");
      if (topicLink) { showView(`topic/${encodeURIComponent(topicLink.dataset.topicRoute)}`); return; }
      if (event.target.closest("[data-detail-back]")) {
        if (history.state?.from) history.back();
        else showView("overview");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mobileQuickMenu && !mobileQuickMenu.hidden) {
        closeMobileMenu();
        mobileMenuToggle?.focus();
      }
    });

    els.homeBrand.addEventListener("click", (event) => { event.preventDefault(); showView("home"); });
    window.addEventListener("hashchange", () => {
      const target = location.hash.slice(1) || "home";
      showView(target);
      if (target === "events") showOverviewTab("events");
    });
    document.querySelectorAll("[data-go-search]").forEach((button) => button.addEventListener("click", () => showView("search")));
    document.querySelectorAll("[data-go-events]").forEach((button) => button.addEventListener("click", () => { showView("overview"); showOverviewTab("events"); }));
    const openRecentEvent = (event) => {
      const card = event.target.closest("[data-event-name]");
      if (!card) return;
      openCompetition(card.dataset.eventName);
    };
    els.recentEvents.addEventListener("click", openRecentEvent);
    els.mobileRecentEvents?.addEventListener("click", openRecentEvent);
    els.mobileUpcomingEvents?.addEventListener("click", openRecentEvent);

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
      if (!window.matchMedia("(max-width: 640px)").matches) requestAnimationFrame(() => els.eventDetail.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
    els.overviewTabs.forEach((tab) => tab.addEventListener("click", () => showOverviewTab(tab.dataset.overviewTab)));
    els.overviewTeamFilter.addEventListener("input", renderOverviewTeams);
    els.overviewTeamSortBy.addEventListener("change", renderOverviewTeams);
    els.overviewTeamSortDirection.addEventListener("change", renderOverviewTeams);
    els.overviewTopicFilter.addEventListener("input", renderOverviewTopics);
    els.overviewTopicList.addEventListener("click", openTopicEvent);
    els.overviewTeamList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-overview-team-id]");
      if (card) selectOverviewTeam(card.dataset.overviewTeamId);
    });
    els.globalSearch.addEventListener("input", () => renderSearch(els.globalSearch.value.trim()));
    els.clearSearch.addEventListener("click", () => { els.globalSearch.value = ""; renderSearch(""); els.globalSearch.focus(); });
    els.searchResults.addEventListener("click", (event) => {
      const card = event.target.closest("[data-entity-id]");
      if (card) selectEntity(card.dataset.entityId);
      else openTopicEvent(event);
    });
  }

  window.DebateInteractions = { setupInteractions };
}());
