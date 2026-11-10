# Restarts only the extension bridge (port 47777), leaving the UI server and open windows alone.
# Session state is persisted to apps\desktop\bridge-state.json, so a running session survives.
$ErrorActionPreference = 'Stop'

$Root       = Split-Path -Parent $PSScriptRoot
$DesktopDir = Join-Path $Root 'apps\desktop'
$BridgeJs   = Join-Path $DesktopDir 'bridge-standalone.cjs'
$LogDir     = Join-Path $PSScriptRoot 'logs'
$PidFile    = Join-Path $PSScriptRoot '.pids'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$listener = Get-NetTCPConnection -LocalPort 47777 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  & taskkill.exe /PID $listener.OwningProcess /T /F | Out-Null
  Write-Host "Stopped old bridge (pid $($listener.OwningProcess))"
  Start-Sleep -Milliseconds 700
}

$node = (Get-Command node).Source
$p = Start-Process -FilePath $node -ArgumentList "`"$BridgeJs`"" -WorkingDirectory $DesktopDir `
      -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $LogDir 'bridge.out.log') `
      -RedirectStandardError  (Join-Path $LogDir 'bridge.err.log')
Add-Content -Path $PidFile -Value $p.Id
Write-Host "Started bridge (pid $($p.Id))"

for ($i = 0; $i -lt 20; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:47777/health' -UseBasicParsing -TimeoutSec 1
    if ($r.StatusCode -eq 200) { Write-Host 'Bridge is up.'; exit 0 }
  } catch {}
  Start-Sleep -Milliseconds 400
}
Write-Error 'Bridge did not come up on port 47777.'
