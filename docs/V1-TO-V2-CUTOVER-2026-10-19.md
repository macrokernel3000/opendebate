# V1 公開站轉移至 V2

## 目標

- V1 GitHub Pages 的首頁、舊深連結與辯論戰績頁導向 V2 正式站。
- 自 2026-10-19 起，公開資料的新維護工作以 V2 `public-source/` 為準。
- 2026-11-19 再檢查是否能封存 V1 repository；不在未確認舊 App 相容前關閉整個 GitHub Pages。

## 本輪範圍

- 以瀏覽器端轉址保留 query string 與 hash 深連結。
- 新增 `404.html`，讓過往未對應的網頁入口回到 V2。
- 停止 V1 的 Google Sheet 更新流程；誤觸時只會顯示 V2 維護提示，不會建立資料 PR。
- CI 改驗證退役入口、來源資料與舊 App 相容檔案，不再執行已下架的 V1 首頁互動測試。
- 保留 `data/ios/v1/`、`calendar.ics`、`privacy/`、`support/`，避免舊 App、行事曆訂閱與 App Store 既有連結立即失效。
- 不修改會員 D1、登入、Sites 發布或 iOS App。

## 驗證

- 檢查首頁、搜尋 query、hash 深連結、辯論戰績頁與 404 頁的目的網址。
- 確認舊公開 JSON、行事曆、隱私政策及支援頁仍可直接存取。
- 發布後分別讀回 GitHub Pages 入口與保留路徑。

### 2026-10-19 本機結果

- 以 390 × 844 手機尺寸及桌面尺寸實際開啟轉移頁，文字、按鈕與版面無溢出。
- 退役入口與相容路徑測試 6/6 通過。
- 資料預檢通過：61 個賽事、1472 場戰績、524 筆榮譽、51 筆辯題，無資料提醒。
- Python 建置與資料單元測試 74/74 通過。
- 已由 PR [#7](https://github.com/macrokernel3000/opendebate/pull/7) 合併為 `e01fbbf`；資料驗收與 GitHub Pages 建置／部署均成功。
- 公開讀回確認：舊首頁已載入退役標記並實際導向 V2；舊 App manifest、行事曆、隱私政策與支援頁均回應 200。

## 一個月後

- 確認已發布的 iOS 版本不再讀取 GitHub Pages manifest。
- 確認 App Store 的行銷、支援與隱私政策網址已改用長期網址。
- 若仍有舊 App 使用者，保留相容資料路徑；V1 使用介面可維持永久轉址並將 repository 設為封存。
