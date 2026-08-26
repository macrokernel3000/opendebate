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
  else { if ($name -notlike 'public-data*') { $name = "public-data-$name" }; $target = Join-Path $dataDir $name }
  if (Test-Path -LiteralPath $target) { $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'; Copy-Item -LiteralPath $target -Destination (Join-Path $backupDir "$(Split-Path -LeafBase $target)-$stamp$(Split-Path -Extension $target)") }
  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Host "已載入：$(Split-Path -Leaf $target)"
}
python (Join-Path $Root 'tools\build_data.py')
if ($LASTEXITCODE -ne 0) { throw '更新失敗；原本的網站資料未被覆蓋。' }
Start-Process (Join-Path $Root 'index.html')
