param([Parameter(Position=0)][string]$SourceFile)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$DataDir = Join-Path $Root 'data'
$BackupDir = Join-Path $DataDir 'backups'
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Restore = @{}
$Created = @()

function Backup-Input([string]$path) {
    if (Test-Path -LiteralPath $path) {
        $save = Join-Path $BackupDir "$([IO.Path]::GetFileName($path)).$Stamp"
        Copy-Item -LiteralPath $path -Destination $save -Force
        $script:Restore[$path] = $save
    } else {
        $script:Created += $path
    }
}
function Restore-Inputs {
    foreach ($path in $script:Restore.Keys) {
        Copy-Item -LiteralPath $script:Restore[$path] -Destination $path -Force
    }
    foreach ($path in $script:Created) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
}
function Invoke-Builder([string[]]$arguments) {
    & python @arguments
    if ($LASTEXITCODE -ne 0) { throw "資料更新失敗：python $($arguments -join ' ')" }
}

try {
    if ([string]::IsNullOrWhiteSpace($SourceFile)) {
        Add-Type -AssemblyName System.Windows.Forms
        $picker = New-Object System.Windows.Forms.OpenFileDialog
        $picker.Title = '選擇已審核的 OpenDebate 賽事 CSV（取消則只重建現有資料）'
        $picker.Filter = 'CSV files (*.csv)|*.csv'
        $picker.CheckFileExists = $true
        if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $SourceFile = $picker.FileName
        }
        $picker.Dispose()
    }
    if (-not [string]::IsNullOrWhiteSpace($SourceFile)) {
        $Source = (Resolve-Path -LiteralPath $SourceFile).Path
        if ([IO.Path]::GetExtension($Source).ToLowerInvariant() -ne '.csv') {
            throw '只能匯入 CSV。請從 Google 試算表「資料登錄CSV」分頁下載 CSV。'
        }
        $Name = [IO.Path]::GetFileName($Source)
        if ($Name.StartsWith('upcoming-data-')) {
            Invoke-Builder -arguments @((Join-Path $Root 'tools\import_upcoming_csv.py'), $Source)
            foreach ($file in @('upcoming-events.js','competition-registry.csv','event-metadata.csv')) {
                Backup-Input (Join-Path $DataDir $file)
            }
            Invoke-Builder -arguments @((Join-Path $Root 'tools\import_upcoming_csv.py'), $Source, '--apply')
        } else {
            if ($Name -eq 'entity-registry.csv') {
                $Target = Join-Path $DataDir 'entity-registry.csv'
            } else {
                if (-not $Name.StartsWith('public-data-')) { $Name = "public-data-$Name" }
                $Target = Join-Path $DataDir $Name
            }
            if ($Source -ne $Target) {
                Backup-Input $Target
                Copy-Item -LiteralPath $Source -Destination $Target -Force
            }
            Write-Host "已匯入：$Name（同名檔先備份並取代，不重複累加）"
        }
    }

    Write-Host '正在檢查公開資料...'
    Invoke-Builder -arguments @((Join-Path $Root 'tools\build_data.py'), '--check', '--fail-on-warnings')
    Write-Host '正在產生網站與 iOS 共用公開快照...'
    Invoke-Builder -arguments @((Join-Path $Root 'tools\build_data.py'))
    Write-Host '本機更新成功！尚未發布 GitHub；請先比對變更再 Commit / Push。'
    Start-Process (Join-Path $Root 'index.html')
} catch {
    Restore-Inputs
    Write-Host "匯入失敗，已復原本次來源修改：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
