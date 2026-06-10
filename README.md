# 公開辯論資訊網

這是純公開查詢網站。網站可直接雙擊 `index.html` 開啟，不需要網路或額外伺服器。

## 日後更新資料

最穩定的方式只需要兩個步驟：

1. 將登錄平台匯出的 CSV 改名為 `public-data.csv`，覆蓋 `data/public-data.csv`。
2. 雙擊根目錄的 `更新網站資料.command`。

更新程式會先檢查 CSV 欄位，再產生 `data/public-data.js`。看到「更新完成」後，按 Return 即會開啟網站。

更新時也會自動改變 `index.html` 裡的資料、程式與樣式版本，避免 GitHub Pages 或瀏覽器繼續使用舊快取。上傳時請至少一併提交：

- `data/public-data.csv`
- `data/public-data.js`
- `index.html`

也可以直接把新的 CSV 拖到 `更新網站資料.command` 上；它會複製、檢查並更新資料。

若 macOS 第一次阻擋執行，請對 `更新網站資料.command` 按右鍵，選擇「打開」並確認一次；之後即可正常雙擊。

## 哪些檔案要管理

- `data/public-data.csv`：唯一需要手動替換的來源資料。
- `data/public-data.js`：由更新程式自動產生，不需編輯。
- `tools/build_data.py`：資料轉換程式，不需編輯。
- `data/seed-public-data.js`：舊版備份，網站不會讀取。

若 CSV 欄位缺少或某列資料不完整，更新視窗會直接指出問題，不會讓網站悄悄使用舊資料。

GitHub Pages 部署通常需要數十秒至數分鐘。若剛上傳時仍看不到新資料，請稍候後重新整理。

## 發布網站

更新完成後，將整個資料夾上傳到 GitHub Pages、Netlify、Vercel 或其他靜態網站空間即可。
