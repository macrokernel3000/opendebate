(function () {
  function load(storage, key) {
    try {
      const target = typeof storage === "function" ? storage() : storage;
      const value = target.getItem(key);
      if (value === null) return { ok: true, records: [] };
      const records = JSON.parse(value);
      if (!Array.isArray(records) || records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) {
        return { ok: false, records: [] };
      }
      return { ok: true, records };
    } catch (_error) {
      return { ok: false, records: [] };
    }
  }

  function save(storage, key, records) {
    try {
      const target = typeof storage === "function" ? storage() : storage;
      target.setItem(key, JSON.stringify(records));
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

  function loadFailureMessage() {
    return "無法讀取這台裝置的裁單資料，為避免覆蓋原有紀錄，新增、匯入、刪除與匯出已暫停。請先不要清除瀏覽器網站資料，重新載入後若仍發生，請聯繫網站維護者。";
  }

  function localDateStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  window.DebateRecordStorage = { load, save, isValid, saveFailureMessage, loadFailureMessage, localDateStamp };
}());
