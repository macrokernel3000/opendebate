# 公開辯論平台：Codex 協作規則

## 唯一工作區原則

此 Git repository 是本專案的正式工作區。需要修改時，直接使用已開啟的 repository 或其既有 `origin`；不得為了方便而建立第二份 clone、複製專案資料夾，或在相鄰位置另建同名工作區。

若需要平行工作，先確認目前工作樹與 Git 狀態；優先使用 Git branch 或 worktree，不得把另一份完整 clone 當成解法。

## 開始前

1. 先閱讀 `ARCHITECTURE.md`，再依任務閱讀 `README.md`。
2. 先檢查 Git 狀態，保留使用者既有的未提交變更。
3. 資料來源與生成檔的關係，依 `ARCHITECTURE.md` 執行；不要直接覆蓋生成資料或大量改寫資料檔。

## 交接前

說明修改內容、驗證方式、未驗證項目與風險；若變更適合保存，使用清楚的 Git commit 訊息提交。
