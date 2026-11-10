# Stops the FocusWatch bridge and UI servers started by FocusWatch.ps1.
$ErrorActionPreference = 'SilentlyContinue'
$PidFile = Join-Path $PSScriptRoot '.pids'

$pids = @()
if (Test-Path $PidFile) { $pids += Get-Content $PidFile | Where-Object { $_ -match '^\d+$' } }

# Also pick up whatever currently owns the two ports, in case the pid file is stale.
foreach ($port in 1420, 47777) {
  $pids += (Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess
}

$pids | Sort-Object -Unique | ForEach-Object {
  if ($_ -and (Get-Process -Id $_)) {
    & taskkill.exe /PID $_ /T /F | Out-Null
    Write-Host "Stopped pid $_"
  }
}

Remove-Item $PidFile -Force
Write-Host 'FocusWatch servers stopped.'
