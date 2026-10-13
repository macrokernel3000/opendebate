$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
if ($args.Count -gt 0) {
  $source = (Resolve-Path -LiteralPath $args[0]).Path
  $extension = [IO.Path]::GetExtension($source).ToLowerInvariant()
  if ($extension -notin @('.xlsx', '.csv')) { throw '只支援 .xlsx 或 .csv。' }
  $name = Split-Path -Leaf $source
  $dataDir = Join-Path $Root 'data'; $backupDir = Join-Path $dataDir 'backups'
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  if ($name -like 'entity-registry*') { $target = Join-Path $dataDir 'entity-registry.csv' }
  else { throw '賽事資料已整合成 data/public-data-所有賽事.csv；請直接編輯總表，再執行本更新程式。' }
  if (Test-Path -LiteralPath $target) { $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'; Copy-Item -LiteralPath $target -Destination (Join-Path $backupDir "$(Split-Path -LeafBase $target)-$stamp$(Split-Path -Extension $target)") }
  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Host "已載入：$(Split-Path -Leaf $target)"
}
python (Join-Path $Root 'tools\build_data.py') --check --fail-on-warnings
if ($LASTEXITCODE -ne 0) { throw '預檢失敗；網站資料未被覆蓋。請依訊息修正總表。' }
python (Join-Path $Root 'tools\build_data.py')
if ($LASTEXITCODE -ne 0) { throw '更新失敗；原本的網站資料未被覆蓋。' }
Start-Process (Join-Path $Root 'index.html')
