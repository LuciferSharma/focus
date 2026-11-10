# Creates (or refreshes) the "FocusWatch" shortcut on the current user's Desktop.
$ErrorActionPreference = 'Stop'

$desktop  = [Environment]::GetFolderPath('Desktop')
$lnkPath  = Join-Path $desktop 'FocusWatch.lnk'
$vbs      = Join-Path $PSScriptRoot 'FocusWatch.vbs'
$icon     = Join-Path $PSScriptRoot 'focuswatch.ico'

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath       = "$env:WINDIR\System32\wscript.exe"
$lnk.Arguments        = "`"$vbs`""
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.IconLocation     = "$icon,0"
$lnk.Description      = 'Launch FocusWatch (desktop UI + extension bridge)'
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "Shortcut created: $lnkPath"
