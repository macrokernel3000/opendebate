# 公開辯論資訊網

後續 AI 或新維護者請先閱讀 [`ARCHITECTURE.md`](ARCHITECTURE.md)；該文件說明載入順序、資料流、SEO／AI 搜尋入口與安全修改規則。

這是純公開查詢網站。網站可直接雙擊 `index.html` 開啟，不需要網路或額外伺服器。

## 首頁內容

Banner 下方的網站介紹文字由 `data/site-content.csv` 控制。修改 `value` 欄後執行 `更新網站資料.command`，即可同步改變英文小標、中文標題與兩段介紹；請勿修改 `key` 欄。

網站另有 `debate-records.html`，提供搜尋引擎可獨立收錄的辯論戰績與辯論積分說明。其賽事、戰績與榮譽總數會在每次更新資料時自動同步。

- 「近期盃賽時間軸」由最新賽事開始排列；滑鼠停留在節點上可查看冠軍，點擊可進入完整賽事頁。
- 電腦可用滑鼠左右拖曳或在時間軸上使用滾輪瀏覽更多賽事。
- 手機時間軸固定顯示一段高度，可在區塊內上下滑動；第一次點選節點會顯示冠軍，再點一次即可進入賽事頁。
- 「已收錄賽事」會列出資料檔內的全部賽事，每張卡片都可直接開啟完整賽果與榮譽。
- 首頁底部有「累積榮譽、參賽場次、總勝場」三個學校排行榜；手機可左右滑動切換，不必連續向下捲動。

## 資料架構（第二版）

網站畫面仍讀取單一 `data/public-data.js`，但這個檔案由更新程式自動合併產生。資料現在分成：

- `records`：每場勝負與比分。
- `honors`：團體或個人榮譽。
- `entities`：固定編號的學校、特殊隊伍與大學。
- `attendance`：登場選手紀錄，目前不顯示在網頁，保留給未來的登場次數統計。
- `topics`：各屆賽事的多筆辯題，目前不顯示在網頁，保留給未來賽事頁使用。

單位代碼採三種前綴：`s001` 起為中學端學校、`p001` 起為特殊或跨校隊伍、`u001` 起為大學。名冊目前使用 `data/entity-registry.csv`。同校不同名稱可用 `|` 放在 `aliases` 欄，搜尋、戰績與積分都會依同一代碼歸戶。名稱 `0` 是有效隊名，空白列則會忽略。

## 建議的資料整理方式：一個賽事一個 CSV

正式資料來源位於 `data` 資料夾，命名方式為：

- `public-data-完整賽事名稱.csv`

目前每個賽事各自一個 CSV。新增比賽時，複製任一既有 CSV、修改檔名與「盃賽」欄即可。所有 `public-data*.csv` 都會合併，完全相同的資料會自動去重。

每個 CSV 的使用方式：

1. 第一列必須保留完整欄位名稱。
2. 每一列的「盃賽」填同一個完整賽事名稱。
3. 戰績列使用「公開戰績」，榮譽列使用「公開榮譽」。
4. 辯題可另起一列，資料類型填「辯題」，並填寫「辯題」與「辯題解釋」。
5. 「正方登場選手」與「反方登場選手」是選填欄，多人用頓號 `、` 分隔。

辯題與解釋會在更新時寫入 `public-data.js` 的 `topics`。首頁賽事卡最多預覽兩題，賽事頁顯示完整辯題；較長的辯題解釋目前只保存、不顯示，待未來建立專區。CSV 可增加「辯題」與「辯題解釋」欄，多題以換行或 `|` 分隔並依序對應。

## 資料回報

網站的「資料回報」頁使用單一 Google 表單，統一收集賽事積分、選手上場與盃賽辯題回報。表單網址設定於 `js/site-config.js` 的 `formUrl`；網址留白時按鈕會顯示「表單準備中」，填入後即自動啟用。

Numbers、Excel 與 Google 試算表都能開啟 CSV。編輯後請匯出為 UTF-8 CSV，避免中文亂碼。

## 更新網站

新增或編輯任一 `public-data*.csv` 後，雙擊根目錄的 `更新網站資料.command`。

更新程式會逐一讀取所有 CSV、檢查欄位，再合併產生 `data/public-data.js`。看到「目前收錄盃賽」與「更新完成」後，按 Return 即會開啟網站。

每次更新也會產生 `data/update-report.txt`，裡面會列出本次讀取的資料來源、目前收錄幾個盃賽、盃賽清單，以及略過資料或提醒項目。若命令視窗顯示「資料檢查回報」，可先打開這個檔案確認是哪一列或哪個分頁需要修正。

## 從 Google 試算表一鍵更新

這版已加入 GitHub Actions：`.github/workflows/update-data-from-google-sheet.yml`。

上傳到 GitHub 後，可到 repository 的 **Actions → Update data from Google Sheet → Run workflow** 手動更新。流程會自動下載 Google 試算表、轉成 `data/public-data.js`、產生 `data/update-report.txt`，並提交回 GitHub。

只有對 repository 有寫入權限的人通常才能按 `Run workflow`；一般訪客不能按。這個測試版使用 Google Sheet 公開匯出連結，因此知道試算表網址的人可能讀得到資料。若要讓試算表保持私密，之後可改成 GitHub Secrets + Google 服務帳號版本。

名冊更新方式：用 Numbers、Excel 或試算表編輯 `entity-registry.csv`，保留 UTF-8 CSV 格式後執行同一個更新工具。

更新時也會自動改變 `index.html` 裡的資料、程式與樣式版本，避免 GitHub Pages 或瀏覽器繼續使用舊快取。上傳時請至少一併提交：

- `data/public-data*.csv`
- `data/entity-registry.csv`
- `data/public-data.js`
- `index.html`

也可以直接把新的 `.csv` 拖到 `更新網站資料.command` 上；工具會保留舊檔，以原檔名新增來源。若檔名重複，會自動加上時間，不會刪除既有資料。

若 macOS 第一次阻擋執行，請對 `更新網站資料.command` 按右鍵，選擇「打開」並確認一次；之後即可正常雙擊。

## 哪些檔案要管理

- `data/public-data*.csv`：一個賽事一個檔案，所有歷史與新增來源都會合併讀取。
- `data/entity-registry.csv`：固定單位代碼、正式名稱與別名的主要編輯來源。
- `data/public-data.js`：由更新程式自動產生，不需編輯。
- `tools/build_data.py`：資料轉換程式，不需編輯。
- `data/seed-public-data.js`：舊版備份，網站不會讀取。

若某個 CSV 缺少欄位或資料不完整，更新視窗會指出是哪一個檔案，不會讓網站悄悄使用舊資料。

GitHub Pages 部署通常需要數十秒至數分鐘。若剛上傳時仍看不到新資料，請稍候後重新整理。

## 發布網站

更新完成後，將整個資料夾上傳到 GitHub Pages、Netlify、Vercel 或其他靜態網站空間即可。
