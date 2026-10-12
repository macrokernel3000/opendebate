@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0更新網站資料.ps1"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0更新網站資料.ps1" "%~1"
)
if errorlevel 1 (
  echo.
  echo 更新失敗。請查看上方資料驗證訊息，檔案尚未發布。
) else (
  echo.
  echo 本機資料處理已完成。需要 Commit / Push 才會公開更新。
)
echo.
pause
