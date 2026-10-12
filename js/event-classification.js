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

  function dataVersion(recordedEvents, upcomingEvents, activities) {
    const recordedNames = new Set((recordedEvents || []).map((event) => event.name));
    const scheduleKeys = new Set([
      ...(upcomingEvents || [])
        .filter((event) => !recordedNames.has(event.name))
        .map((event) => `event:${event.id || event.name}`),
      ...(activities || []).map((activity) => `activity:${activity.id || activity.name}`),
    ]);
    const recordedCount = (recordedEvents || []).length;
    const scheduleCount = scheduleKeys.size;
    return {
      label: `v1.${recordedCount}.${scheduleCount}`,
      recordedCount,
      scheduleCount,
    };
  }

  window.DebateEventClassification = { localDateIso, splitEventCatalog, dataVersion };
})();
