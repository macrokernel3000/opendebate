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

  function saveFailureMessage(existingRecordCount) {
    if (existingRecordCount > 0) {
      return "瀏覽器目前無法儲存資料，這次變更未生效；原有紀錄沒有變動。請先下載 CSV 備份，再確認瀏覽器儲存空間後重試。";
    }
    return "瀏覽器目前無法儲存資料，這次變更未生效；表單內容仍保留。請確認瀏覽器允許儲存後重試，匯入請重新選取 CSV。";
  }

  window.DebateRecordStorage = { save, isValid, saveFailureMessage };
}());
