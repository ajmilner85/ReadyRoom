# CATCC on another PC, from a USB stick: what "Install CATCC.cmd" and "Uninstall CATCC.cmd" in the stick's root run
# (make-usb.ps1 puts this file in the stick's CATCC-files folder, beside a copy of the repository's catcc-dcs files the
# installers read). It finds this PC's Saved Games\DCS and DCS folder, asks for admin once (the pilot mod patches files
# in the DCS folder, and the slot picker's fonts go there), and runs, unchanged:
#   CATCC-files\catcc-dcs\deck-test\crew-test\install.ps1   the crew test: hooks, scripts, native modules, CATCC-Crew
#                                                            mod, slot picker, fonts, autoexec.cfg line
#   CATCC-files\catcc-dcs\pilot\install.ps1                 the pilot mod: hook, cockpit device, launch gate, chocks
#                                                            routing, the lookalike Hornet and its liveries
# -Mode uninstall runs both with -Uninstall: everything they put in is taken out and DCS's own files put back.
# Everything they print goes to the window and to CATCC-files\last-run.log on the stick. Uninstall first copies this
# PC's DCS and CATCC logs onto the stick (CATCC-files\logs\<date time>), for reading on the development PC.
param(
  [ValidateSet('install', 'uninstall')][string]$Mode = 'install',
  [string]$SavedGames,
  [string]$DcsDir,
  # (already the elevated copy)
  [switch]$Elevated,
  # (the builder's own check: folders that are not DCS's, no UAC, DCS may be running, no pause at the end)
  [switch]$Test
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSCommandPath
$pkg = Join-Path $here 'catcc-dcs'

function Stop-Here([string]$msg, [int]$code = 1) {
  Write-Host ''
  Write-Host $msg
  if (-not $Test) { Read-Host 'Press Enter to close' | Out-Null }
  exit $code
}

if (-not $Test -and (Get-Process -Name DCS -ErrorAction SilentlyContinue)) { Stop-Here 'DCS is running. Close it, then double-click again.' }

# this PC's Saved Games\DCS (or DCS.openbeta) and DCS folder: found before asking for admin, so that an admin
# account's own profile is not taken for this user's
if (-not $SavedGames) {
  foreach ($d in 'DCS', 'DCS.openbeta') {
    $p = Join-Path ([Environment]::GetFolderPath('UserProfile')) "Saved Games\$d"
    if (Test-Path $p) { $SavedGames = $p; break }
  }
}
if (-not $SavedGames -or -not (Test-Path $SavedGames)) { Stop-Here 'Saved Games\DCS was not found on this PC. Start DCS once, close it, then try again.' }
if (-not $DcsDir) {
  foreach ($k in 'HKCU:\Software\Eagle Dynamics\DCS World', 'HKCU:\Software\Eagle Dynamics\DCS World OpenBeta') {
    $v = (Get-ItemProperty -Path $k -Name Path -ErrorAction SilentlyContinue).Path
    if ($v -and (Test-Path (Join-Path $v 'bin'))) { $DcsDir = $v; break }
  }
  if (-not $DcsDir) {
    foreach ($c in 'C:\Program Files\Eagle Dynamics\DCS World', 'C:\Program Files\Eagle Dynamics\DCS World OpenBeta') {
      if (Test-Path (Join-Path $c 'bin')) { $DcsDir = $c; break }
    }
  }
}
if (-not $DcsDir -or -not (Test-Path $DcsDir)) { Stop-Here 'The DCS folder was not found on this PC (DCS''s registry entry, or C:\Program Files\Eagle Dynamics\DCS World).' }

# admin, once
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $Test) {
  if ($Elevated) { Stop-Here 'Admin was not given.' }
  $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Mode', $Mode, '-SavedGames', "`"$SavedGames`"", '-DcsDir', "`"$DcsDir`"", '-Elevated')
  try {
    $p = Start-Process powershell -Verb RunAs -ArgumentList $argv -Wait -PassThru
  } catch {
    Stop-Here 'Admin was not given (the Windows prompt was declined): nothing was changed.'
  }
  exit $p.ExitCode
}

$log = Join-Path $here 'last-run.log'
try { Start-Transcript -Path $log -Force | Out-Null } catch { }
$ok = $true
try {
  Write-Host "CATCC $Mode"
  Write-Host "  Saved Games: $SavedGames"
  Write-Host "  DCS:         $DcsDir"
  Write-Host ''
  $crew = Join-Path $pkg 'deck-test\crew-test\install.ps1'
  $pilot = Join-Path $pkg 'pilot\install.ps1'
  $crewArgs = @{ SavedGames = $SavedGames; DcsDir = $DcsDir }
  $pilotArgs = @{ SavedGames = $SavedGames; DcsPath = $DcsDir; NoElevate = $true }
  if ($Test) { $crewArgs.NoDcsCheck = $true }
  if ($Mode -eq 'uninstall') {
    $crewArgs.Uninstall = $true; $pilotArgs.Uninstall = $true
    # THIS PC'S LOGS ONTO THE STICK FIRST (for reading on the development PC: what the test did here):
    # CATCC-files\logs\<date time>\
    $logDst = Join-Path $here ('logs\' + (Get-Date -Format 'yyyy-MM-dd HHmm'))
    $taken = @()
    foreach ($n in 'dcs.log', 'dcs.log.old', 'catcc-crewtest.log', 'catcc-atcprobe.log') {
      $src = Join-Path $SavedGames "Logs\$n"
      if (Test-Path -LiteralPath $src) {
        New-Item -ItemType Directory -Force $logDst | Out-Null
        Copy-Item -LiteralPath $src -Destination (Join-Path $logDst $n) -Force
        $taken += $n
      }
    }
    Write-Host "This PC's logs copied onto the stick ($logDst): $(if ($taken) { $taken -join ', ' } else { 'none found' })"
    Write-Host ''
  }
  Write-Host '--- crew test and slot picker'
  & $crew @crewArgs
  Write-Host ''
  Write-Host '--- pilot mod and lookalike'
  & $pilot @pilotArgs
} catch {
  $ok = $false
  Write-Host ''
  Write-Host "FAILED: $($_.Exception.Message)"
}
try { Stop-Transcript | Out-Null } catch { }
if ($ok) {
  Stop-Here $(if ($Mode -eq 'install') { 'CATCC installed. Start DCS.' } else { 'CATCC removed: DCS is as it was.' }) 0
}
Stop-Here "Something failed (above; also in $log). Nothing else was done after it." 1
