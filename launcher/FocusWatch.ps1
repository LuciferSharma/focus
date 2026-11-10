# FocusWatch launcher
# Starts the extension bridge (127.0.0.1:47777) and the desktop UI (localhost:1420),
# then opens the UI in its own app window. Safe to run repeatedly: if the servers are
# already up it just opens the window again.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$Root        = Split-Path -Parent $PSScriptRoot
$DesktopDir  = Join-Path $Root 'apps\desktop'
$BridgeJs    = Join-Path $DesktopDir 'bridge-standalone.cjs'
$ViteJs      = Join-Path $DesktopDir 'node_modules\vite\bin\vite.js'
$LogDir      = Join-Path $PSScriptRoot 'logs'
$PidFile     = Join-Path $PSScriptRoot '.pids'
$AppUrl      = 'http://localhost:1420'
$BridgeUrl   = 'http://127.0.0.1:47777/health'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path (Join-Path $LogDir 'launcher.log') -Value $line
}

function Fail($msg) {
  Write-Log "ERROR: $msg"
  [System.Windows.Forms.MessageBox]::Show(
    "$msg`n`nLogs: $LogDir",
    'FocusWatch failed to start',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
  exit 1
}

function Test-Url($url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch { return $false }
}

function Wait-Url($url, $seconds, $label) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Url $url) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-Hidden($file, $arguments, $cwd, $logName) {
  $out = Join-Path $LogDir "$logName.out.log"
  $err = Join-Path $LogDir "$logName.err.log"
  $p = Start-Process -FilePath $file -ArgumentList $arguments -WorkingDirectory $cwd `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  Add-Content -Path $PidFile -Value $p.Id
  Write-Log "Started $logName (pid $($p.Id))"
  return $p
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Fail 'Node.js was not found on PATH. Install Node.js and try again.' }
if (-not (Test-Path $ViteJs)) { Fail "Dependencies are not installed. Run 'pnpm install' in:`n$Root" }

Write-Log '--- launch ---'

# 1. Extension bridge (this is what the Chrome extension polls; without it the extension shows OFFLINE)
if (Test-Url $BridgeUrl) {
  Write-Log 'Bridge already running on 47777'
} else {
  Start-Hidden $node "`"$BridgeJs`"" $DesktopDir 'bridge' | Out-Null
  if (-not (Wait-Url $BridgeUrl 15 'bridge')) { Fail 'The extension bridge did not start on port 47777.' }
  Write-Log 'Bridge is up'
}

# 2. Desktop UI (Vite dev server on 1420; its built-in bridge defers to the one above)
if (Test-Url $AppUrl) {
  Write-Log 'App already running on 1420'
} else {
  Start-Hidden $node "`"$ViteJs`" --port 1420 --strictPort" $DesktopDir 'app' | Out-Null
  if (-not (Wait-Url $AppUrl 90 'app')) { Fail 'The FocusWatch UI did not come up on port 1420.' }
  Write-Log 'App is up'
}

# 3. Open as a standalone app window (Chrome, then Edge, then default browser)
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) {
  Start-Process -FilePath $browser -ArgumentList "--app=$AppUrl", '--window-size=1280,860'
  Write-Log "Opened app window with $browser"
} else {
  Start-Process $AppUrl
  Write-Log 'Opened app in default browser'
}
