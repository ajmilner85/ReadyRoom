# CATCC on another PC, from a USB stick: what "Install CATCC.cmd" and "Uninstall CATCC.cmd" in the stick's root run
# (make-usb.ps1 puts this file in the stick's CATCC-files folder, beside a copy of the repository's catcc-dcs files the
# installers read). It finds this PC's Saved Games\DCS and DCS folder, asks for admin once (the pilot mod patches files
# in the DCS folder, and the slot picker's fonts go there), and runs, unchanged:
#   CATCC-files\catcc-dcs\deck-test\crew-test\install.ps1   the crew test: hooks, scripts, native modules, CATCC-Crew
#                                                            mod, slot picker, fonts, autoexec.cfg line
#   CATCC-files\catcc-dcs\pilot\install.ps1                 the pilot mod: hook, cockpit device, launch gate, chocks
#                                                            routing, the lookalike Hornet and its liveries
# -Mode uninstall runs both with -Uninstall: everything they put in is taken out and DCS's own files put back.
# EVERY LOG GOES TO THE STICK'S "CATCC Logs" FOLDER, one folder per run: CATCC Logs\<date time> <mode> on <PC>\ holds
# <mode>.log (everything they printed, as in the window) and, first, a copy of this PC's DCS and CATCC logs as they
# are before the run (Logs\dcs.log, dcs.log.old, catcc-*.log and catcc-*.lua, the last week's dcs.*.crash), for
# reading on the development PC. (CATCC's live logs send them to SDOBot while DCS runs as well: Config\CATCC-logs.lua.)
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

# WHAT AN INSTALL PUT IN, kept in Saved Games\DCS\Config\CATCC-usb-installed.txt, so that a newer version installed
# over it (no uninstall between) leaves none of the older one's files behind, and an uninstall takes out every file
# any installed version put in. Only the places CATCC writes to are looked at (CATCC_PLACES); a file there counts as
# installed when the run wrote it (new, or changed: length or time) or it is the same as a file of this package. A
# file there that no install wrote (a server's Scripts\CATCC\config.lua) is never in the list, so never deleted.
$manifest = Join-Path $SavedGames 'Config\CATCC-usb-installed.txt'
$CATCC_PLACES = @(
  @{ root = $SavedGames; dir = 'Scripts\CATCC'; filter = '*' },
  @{ root = $SavedGames; dir = 'Scripts\Hooks'; filter = 'CATCC-*.lua'; flat = $true },
  @{ root = $SavedGames; dir = 'Config'; filter = 'CATCC-*.lua'; flat = $true },
  @{ root = $SavedGames; dir = 'Mods\tech'; filter = 'CATCC-*'; dirs = $true },
  @{ root = $SavedGames; dir = 'Mods\aircraft'; filter = 'CATCC-*'; dirs = $true },
  @{ root = $SavedGames; dir = 'Liveries'; filter = 'CATCC_*'; dirs = $true },
  @{ root = $DcsDir; dir = 'dxgui\skins\fonts'; filter = 'CATCC-*.ttf'; flat = $true }
)
# full path -> "length|time" of every file in those places now
function Get-CatccFiles {
  $t = @{}
  foreach ($p in $CATCC_PLACES) {
    $base = Join-Path $p.root $p.dir
    if (-not (Test-Path -LiteralPath $base)) { continue }
    if ($p.flat) {
      $list = Get-ChildItem -LiteralPath $base -File -Filter $p.filter -Force -ErrorAction SilentlyContinue
    } elseif ($p.dirs) {
      $list = Get-ChildItem -LiteralPath $base -Directory -Filter $p.filter -Force -ErrorAction SilentlyContinue | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue }
    } else {
      $list = Get-ChildItem -LiteralPath $base -Recurse -File -Force -ErrorAction SilentlyContinue
    }
    foreach ($f in $list) { $t[$f.FullName] = "$($f.Length)|$($f.LastWriteTimeUtc.Ticks)" }
  }
  return $t
}
function Remove-Orphans($before) {
  $old = @()
  if (Test-Path -LiteralPath $manifest) { $old = @(Get-Content -LiteralPath $manifest | Where-Object { $_ }) }
  $after = Get-CatccFiles
  $now = @{}
  if ($Mode -eq 'install') {
    $pkgHashes = @{}
    foreach ($f in Get-ChildItem -LiteralPath $pkg -Recurse -File -Force) { $pkgHashes[(Get-FileHash -LiteralPath $f.FullName -Algorithm SHA1).Hash] = $true }
    foreach ($k in $after.Keys) {
      if (-not $before.ContainsKey($k) -or $before[$k] -ne $after[$k] -or $pkgHashes.ContainsKey((Get-FileHash -LiteralPath $k -Algorithm SHA1).Hash)) { $now[$k] = $true }
    }
  }
  $gone = @()
  foreach ($k in $old) {
    if (-not $now.ContainsKey($k) -and (Test-Path -LiteralPath $k -PathType Leaf)) {
      Remove-Item -LiteralPath $k -Force
      $gone += $k
      # (its folder too, once empty, up to the place's own folder)
      $d = Split-Path $k -Parent
      while ($d -and (Test-Path -LiteralPath $d) -and -not (Get-ChildItem -LiteralPath $d -Force) -and
             -not ($CATCC_PLACES | Where-Object { (Join-Path $_.root $_.dir) -eq $d })) {
        Remove-Item -LiteralPath $d -Force
        $d = Split-Path $d -Parent
      }
    }
  }
  if ($gone) { foreach ($g in $gone) { Write-Host "Removed (an older version's): $g" } }
  if (-not $old.Count -and $Mode -eq 'install') { Write-Host 'No list of an earlier USB install here: from now on, one is kept.' }
  elseif (-not $gone) { Write-Host 'None left behind.' }
  if ($Mode -eq 'install') {
    New-Item -ItemType Directory -Force (Split-Path $manifest) | Out-Null
    [IO.File]::WriteAllLines($manifest, [string[]]@($now.Keys | Sort-Object), (New-Object Text.UTF8Encoding($false)))
    Write-Host "What this install put in: $($now.Count) files, listed in $manifest"
  } elseif (Test-Path -LiteralPath $manifest) {
    Remove-Item -LiteralPath $manifest -Force
  }
}

# this run's folder in the stick's CATCC Logs (beside CATCC-files)
$runDir = Join-Path (Join-Path (Split-Path -Parent $here) 'CATCC Logs') "$(Get-Date -Format 'yyyy-MM-dd HHmmss') $Mode on $env:COMPUTERNAME"
$log = Join-Path $runDir "$Mode.log"
try {
  New-Item -ItemType Directory -Force $runDir | Out-Null
  Start-Transcript -Path $log -Force | Out-Null
} catch { $log = '(no log: the stick could not be written)' }
$ok = $true
try {
  Write-Host "CATCC $Mode"
  Write-Host "  Saved Games: $SavedGames"
  Write-Host "  DCS:         $DcsDir"
  Write-Host "  Log:         $log"
  Write-Host ''
  # THIS PC'S LOGS ONTO THE STICK FIRST (for reading on the development PC: what the last test did here)
  $taken = @()
  try {
    $logsDir = Join-Path $SavedGames 'Logs'
    $weekAgo = (Get-Date).AddDays(-7)
    $src = @(Get-ChildItem -LiteralPath $logsDir -File -Force -ErrorAction SilentlyContinue | Where-Object {
      $_.Name -eq 'dcs.log' -or $_.Name -eq 'dcs.log.old' -or $_.Name -like 'catcc-*.log' -or $_.Name -like 'catcc-*.lua' -or
      ($_.Name -like 'dcs.*.crash' -and $_.LastWriteTime -gt $weekAgo)
    })
    $TAIL = 16MB
    foreach ($f in $src) {
      $to = Join-Path $runDir $f.Name
      if ($f.Name -like 'catcc-*.log' -and $f.Length -gt $TAIL) {
        # (the crew test's log is added to from run to run: its last 16 MB, which hold the last runs)
        $in = [IO.File]::Open($f.FullName, 'Open', 'Read', 'ReadWrite')
        try {
          [void]$in.Seek(-$TAIL, 'End')
          $outF = [IO.File]::Create($to)
          try { $in.CopyTo($outF) } finally { $outF.Close() }
        } finally { $in.Close() }
        $taken += "$($f.Name) (its last 16 of $([math]::Round($f.Length / 1MB)) MB)"
      } else {
        Copy-Item -LiteralPath $f.FullName -Destination $to -Force
        $taken += $f.Name
      }
    }
  } catch {
    Write-Host "This PC's logs NOT all copied onto the stick: $($_.Exception.Message)"
  }
  Write-Host "This PC's logs copied onto the stick ($runDir): $(if ($taken) { $taken -join ', ' } else { 'none found' })"
  Write-Host ''
  $crew = Join-Path $pkg 'deck-test\crew-test\install.ps1'
  $pilot = Join-Path $pkg 'pilot\install.ps1'
  $crewArgs = @{ SavedGames = $SavedGames; DcsDir = $DcsDir }
  $pilotArgs = @{ SavedGames = $SavedGames; DcsPath = $DcsDir; NoElevate = $true }
  if ($Test) { $crewArgs.NoDcsCheck = $true }
  if ($Mode -eq 'uninstall') { $crewArgs.Uninstall = $true; $pilotArgs.Uninstall = $true }
  $before = Get-CatccFiles
  Write-Host '--- crew test and slot picker'
  & $crew @crewArgs
  Write-Host ''
  Write-Host '--- pilot mod and lookalike'
  & $pilot @pilotArgs
  Write-Host ''
  Write-Host '--- files of an older version'
  Remove-Orphans $before
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
