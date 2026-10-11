(function () {
  function localDateIso(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function splitEventCatalog(allEvents, upcomingEvents, today = localDateIso()) {
    const futureEventNames = new Set((upcomingEvents || [])
      .filter((event) => (event.endDate || event.startDate || "") >= today)
      .map((event) => event.name));
    return {
      allEvents,
      recordedEvents: (allEvents || []).filter((event) => !futureEventNames.has(event.name)),
    };
  }

  window.DebateEventClassification = { localDateIso, splitEventCatalog };
})();
