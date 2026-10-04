(function () {
  function save(storage, key, records) {
    try {
      storage.setItem(key, JSON.stringify(records));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function isValid(form) {
    return !form?.reportValidity || form.reportValidity();
  }

  window.DebateRecordStorage = { save, isValid };
}());
