# Make the CATCC installer ON THE CATCC USB STICK, and nowhere else: take the stick to another PC, double-click
# "Install CATCC.cmd" in its root there (DCS closed), test, double-click "Uninstall CATCC.cmd".
#
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\usb\make-usb.ps1          (VS Code: "CATCC: Build USB installer")
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\usb\make-usb.ps1 -Check   (only says which drive it would use)
#
# WHERE IT WRITES (the user, 2026-11-25: "Under ABSOLUTELY NO CIRCUMSTANCES must the script write to a location other
# than the USB drive"): there is no output path to give. It writes only onto the one drive that is
#   - removable (Windows' drive type 2), and not the drive Windows runs from,
#   - labelled exactly "USB DRIVE 01",
#   - and has the sentinel file at its root: CATCC-USB-TARGET.txt whose first line is exactly "CATCC USB target" (the user
#     puts it there),
# and stops, writing nothing, when no drive or more than one is all of that.
# WHAT IT WRITES THERE (the user: "place all the files in the USB's root"; "It doesn't need a readme"; "files from
# older versions must be deleted before files from the current version are added"; 2026-11-26: "Tweak the USB tool so
# it no longer empties the stick first. Make a CATCC Logs folder and have all logs go there."): the stick is NOT
# emptied. Only what this builder writes is replaced: FIRST the older build is deleted (the folder CATCC-files whole,
# "Install CATCC.cmd", "Uninstall CATCC.cmd", "CATCC test script.txt"); THEN they are written again. Everything else on
# the stick stays as it is, the folder "CATCC Logs" above all: every log goes there, one folder per run
# ("<date time> build|install|uninstall on <PC>"), and nothing here ever deletes from it. The older layout's logs
# (CATCC-files\last-run.log, CATCC-files\logs\*) are moved into it before CATCC-files goes. Nothing is deleted when
# anything that goes is a link (a junction or symbolic link: deleting through it could reach files off the stick);
# every file and folder is checked to be under the drive's root before it is deleted, moved or written.
#
# What goes in: the two installers that already exist (deck-test\crew-test\install.ps1 and pilot\install.ps1) with
# every file they read, in the repository's own layout under CATCC-files\catcc-dcs (so they run there unchanged), and
# CATCC-files\catcc-usb.ps1, which both .cmd files run (it finds that PC's Saved Games and DCS folders and asks for
# admin once). Built from this working tree as it is now: build the native modules first (their build.cmd). Of what
# is private only the live logs' settings go in (Config\CATCC-logs.lua: SDOBot's log token, so that the other PC's
# DCS sessions send their logs too; scripts\catcc\catcc-logs-setup.ps1 writes it): Scripts\CATCC\config.lua (the
# room's settings) is left out, and no log.
param(
  # only find the drive and say so: nothing is written
  [switch]$Check
)
$ErrorActionPreference = 'Stop'
$LABEL = 'USB DRIVE 01'
$SENTINEL = 'CATCC-USB-TARGET.txt'
$SENTINEL_LINE = 'CATCC USB target'
$usb = Split-Path -Parent $PSCommandPath
$dcsRoot = Resolve-Path (Join-Path $usb '..')   # catcc-dcs
$enc = New-Object System.Text.UTF8Encoding($false)

function Stop-Build([string]$why) {
  Write-Host ''
  Write-Host "NOTHING WRITTEN: $why"
  try { Stop-Transcript | Out-Null } catch { }
  exit 1
}

# ---------------------------------------------------------------- the stick, and only the stick
$sysDrive = ($env:SystemDrive).TrimEnd('\').ToUpper()
$found = @()
$seen = @()
foreach ($d in Get-CimInstance Win32_LogicalDisk) {
  $id = ([string]$d.DeviceID).ToUpper()
  $seen += "$id type $($d.DriveType) label '$($d.VolumeName)'"
  if ($d.DriveType -ne 2) { continue }
  if ($id -eq $sysDrive) { continue }
  if ([string]$d.VolumeName -cne $LABEL) { continue }
  $sentinelPath = "$id\$SENTINEL"
  if (-not (Test-Path -LiteralPath $sentinelPath -PathType Leaf)) { Write-Host "$id is labelled '$LABEL' but has no $SENTINEL at its root: not used."; continue }
  $first = (Get-Content -LiteralPath $sentinelPath -TotalCount 1 -ErrorAction SilentlyContinue)
  if ($null -eq $first -or ([string]$first).Trim([char]0xFEFF).Trim() -cne $SENTINEL_LINE) { Write-Host "$id has $SENTINEL but its first line is not '$SENTINEL_LINE': not used."; continue }
  $found += $id
}
if ($found.Count -eq 0) {
  Stop-Build ("no removable drive labelled '$LABEL' with $SENTINEL (first line '$SENTINEL_LINE') at its root. Drives seen: " + ($seen -join '; '))
}
if ($found.Count -gt 1) { Stop-Build ("more than one drive passes every check (" + ($found -join ', ') + "): take out all but one.") }
$root = $found[0] + '\'
$Out = $root + 'CATCC-files'
$Logs = $root + 'CATCC Logs'
$TOP = @{ install = $root + 'Install CATCC.cmd'; uninstall = $root + 'Uninstall CATCC.cmd'; script = $root + 'CATCC test script.txt' }
Write-Host "The CATCC USB stick: $($found[0]) (removable, labelled '$LABEL', $SENTINEL at its root). The older build ($Out, $($TOP.install), $($TOP.uninstall), $($TOP.script)) is replaced; everything else stays; logs go to $Logs."
if ($Check) { Write-Host 'Check only: nothing written.'; exit 0 }

# every place written to: a full path under the stick's root, reached through no link
function Assert-OnStick([string]$path) {
  $full = [IO.Path]::GetFullPath($path)
  if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { Stop-Build "$full is not on the stick ($root)" }
  # (each existing folder on the way from the root: none may be a link)
  $p = Split-Path $full -Parent
  while ($p -and $p.Length -gt $root.Length) {
    if ((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { Stop-Build "$p is a link: it could lead off the stick" }
    $p = Split-Path $p -Parent
  }
  return $full
}

# (relative to catcc-dcs) folders copied whole, and single files
$dirs = @(
  'deck-test\crew-test\bin',
  'deck-test\crew-test\Mods',
  'deck-test\spawn-probe\bin',
  'fonts',
  'Scripts\CATCC\jets',
  'pilot\Mods\aircraft\CATCC-Pilot',
  'pilot\Mods\tech\CATCC-Lookalike'
)
$files = @(
  'deck-test\crew-test\install.ps1',
  'deck-test\crew-test\autoexec.ps1',
  'deck-test\crew-test\fonts.ps1',
  'Scripts\Hooks\CATCC-crewtest-hook.lua',
  'Scripts\CATCC\catcc_deck.png',
  'pilot\install.ps1',
  'pilot\lookalike-liveries.ps1',
  'pilot\Scripts\Hooks\CATCC-pilot-hook.lua',
  # (the live logs: the crew test's installer puts them in)
  'Scripts\Hooks\CATCC-logs-hook.lua',
  'Scripts\CATCC\catcc_logs.lua',
  # (the scripts the crew test's installer runs at every install: the brake riders' poses, and the drivers' when asked)
  'deck-test\crew-test\model\rider_pose.py',
  'deck-test\crew-test\model\driver_head.py',
  'deck-test\crew-test\model\driver_pose.py',
  'deck-test\crew-test\model\edm.py'
)
# the live logs' settings (private: SDOBot's log token), when this PC has them
$logsCfg = 'Config\CATCC-logs.lua'
$liveLogs = Test-Path -LiteralPath (Join-Path $dcsRoot $logsCfg)
if ($liveLogs) { $files += $logsCfg }
# the crew test's scripts: every crewtest*.lua and .dlg (its installer names which it copies)
$files += Get-ChildItem (Join-Path $dcsRoot 'Scripts\CATCC') -File | Where-Object { $_.Name -like 'crewtest*' -and ($_.Extension -eq '.lua' -or $_.Extension -eq '.dlg') } |
  ForEach-Object { 'Scripts\CATCC\' + $_.Name }
# (every single file of those folders, listed here, so that each destination is checked: no folder copied blind)
foreach ($d in $dirs) {
  $base = Join-Path $dcsRoot $d
  foreach ($f in Get-ChildItem -LiteralPath $base -Recurse -File -Force) { $files += $f.FullName.Substring(([string]$dcsRoot).Length + 1) }
}

# the native modules must be newer than their source (as the crew test's installer checks on this PC)
foreach ($m in @(@('deck-test\crew-test\bin\catcc_crew.dll', 'deck-test\crew-test\native'), @('deck-test\spawn-probe\bin\catcc_atcprobe.dll', 'deck-test\spawn-probe\native'))) {
  $dll = Get-Item (Join-Path $dcsRoot $m[0])
  $src = Get-ChildItem (Join-Path $dcsRoot $m[1]) -Filter *.cpp | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($src -and $dll.LastWriteTime -lt $src.LastWriteTime) { Stop-Build "$($m[0]) is older than its source: run its build.cmd first." }
}

function New-OnStick([string]$dir) {
  $full = Split-Path (Assert-OnStick (Join-Path $dir 'x')) -Parent
  # (the stick's root, or any folder already there: nothing to make)
  if (-not (Test-Path -LiteralPath $full)) { New-Item -ItemType Directory -Force -Path $full | Out-Null }
}
function Copy-ToStick([string]$from, [string]$to) {
  $to = Assert-OnStick $to
  New-OnStick (Split-Path $to -Parent)
  Copy-Item -LiteralPath $from -Destination $to -Force
}
function Write-OnStick([string]$to, [string]$text) {
  $to = Assert-OnStick $to
  New-OnStick (Split-Path $to -Parent)
  [IO.File]::WriteAllText($to, $text, $enc)
}
# (a name for a folder in CATCC Logs that is not there yet)
function Get-LogFolder([string]$name) {
  $p = Join-Path $Logs $name
  $n = 2
  while (Test-Path -LiteralPath $p) { $p = Join-Path $Logs "$name ($n)"; $n++ }
  return (Assert-OnStick $p)
}
# (no links in what goes: nothing deleted or moved through one)
function Assert-NoLink($item) {
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { Stop-Build "$($item.FullName) is a link: nothing deleted (deleting through it could reach files off the stick)." }
  if ($item.PSIsContainer) {
    $link = Get-ChildItem -LiteralPath $item.FullName -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1
    if ($link) { Stop-Build "$($link.FullName) is a link: nothing deleted (deleting through it could reach files off the stick)." }
  }
}

# ---------------------------------------------------------------- the logs folder, and this build's log in it
$Out = Assert-OnStick $Out
$Logs = Assert-OnStick $Logs
if (Test-Path -LiteralPath $Logs) { Assert-NoLink (Get-Item -LiteralPath $Logs -Force) }
New-OnStick $Logs
$buildLog = Get-LogFolder "$(Get-Date -Format 'yyyy-MM-dd HHmmss') build on $env:COMPUTERNAME"
New-OnStick $buildLog
try { Start-Transcript -Path (Assert-OnStick (Join-Path $buildLog 'build.log')) -Force | Out-Null } catch { }
Write-Host "CATCC USB build on $($found[0]) from $dcsRoot"

# ---------------------------------------------------------------- the older build off the stick (and only that)
$goes = @($Out, $TOP.install, $TOP.uninstall, $TOP.script | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Get-Item -LiteralPath $_ -Force })
foreach ($t in $goes) { Assert-NoLink $t }
# the older layout's logs into CATCC Logs first: CATCC-files\last-run.log and CATCC-files\logs\<date time>\
$moved = 0
$oldRun = Join-Path $Out 'last-run.log'
if (Test-Path -LiteralPath $oldRun -PathType Leaf) {
  $to = Get-LogFolder "$((Get-Item -LiteralPath $oldRun).LastWriteTime.ToString('yyyy-MM-dd HHmmss')) last run (older build)"
  New-OnStick $to
  Move-Item -LiteralPath (Assert-OnStick $oldRun) -Destination (Assert-OnStick (Join-Path $to 'last-run.log'))
  $moved++
}
$oldLogs = Join-Path $Out 'logs'
if (Test-Path -LiteralPath $oldLogs -PathType Container) {
  foreach ($d in Get-ChildItem -LiteralPath $oldLogs -Directory -Force) {
    Move-Item -LiteralPath (Assert-OnStick $d.FullName) -Destination (Get-LogFolder "$($d.Name) uninstall (older build)")
    $moved++
  }
}
if ($moved) { Write-Host "The older build's logs moved into $($Logs): $moved." }
$gone = 0
foreach ($t in $goes) {
  if ($t.PSIsContainer) {
    # (files first, each checked, then the folders, deepest first)
    foreach ($f in Get-ChildItem -LiteralPath $t.FullName -Recurse -File -Force) { Remove-Item -LiteralPath (Assert-OnStick $f.FullName) -Force; $gone++ }
    foreach ($d in (Get-ChildItem -LiteralPath $t.FullName -Recurse -Directory -Force | Sort-Object { $_.FullName.Length } -Descending)) { Remove-Item -LiteralPath (Assert-OnStick $d.FullName) -Force }
    Remove-Item -LiteralPath (Assert-OnStick $t.FullName) -Force
  } else {
    Remove-Item -LiteralPath (Assert-OnStick $t.FullName) -Force
    $gone++
  }
}
foreach ($t in $goes) { if (Test-Path -LiteralPath $t.FullName) { Stop-Build "the older build could not be taken off ($($t.FullName) is still there): nothing new written." } }
Write-Host "The older build taken off: $gone file(s) deleted; everything else on the stick kept."

# ---------------------------------------------------------------- the build

$dst = Join-Path $Out 'catcc-dcs'
foreach ($f in $files) { Copy-ToStick (Join-Path $dcsRoot $f) (Join-Path $dst $f) }
# (the crew test's installer compares each module with native\*.cpp: the sources stay here, checked above; empty
# folders there leave nothing newer)
foreach ($d in 'deck-test\crew-test\native', 'deck-test\spawn-probe\native') { New-OnStick (Join-Path $dst $d) }
Copy-ToStick (Join-Path $usb 'catcc-usb.ps1') (Join-Path $Out 'catcc-usb.ps1')

$cmd = { param($mode) "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -File `"%~dp0CATCC-files\catcc-usb.ps1`" -Mode $mode`r`n" }
Write-OnStick $TOP.install (& $cmd 'install')
Write-OnStick $TOP.uninstall (& $cmd 'uninstall')
# the current test script (the user: "something to refer to when I'm at my gaming PC"; the same file is the developers'
# kneeboard page in ReadyRoom): catcc-dcs\usb\TEST-SCRIPT.md, as a .txt that any PC opens
Write-OnStick $TOP.script ([IO.File]::ReadAllText((Join-Path $usb 'TEST-SCRIPT.md'), $enc).Replace("`r`n", "`n").Replace("`n", "`r`n"))

# (what is there now: all of it on the stick)
$all = @(Get-ChildItem -LiteralPath $Out -Recurse -File -Force) + @($TOP.install, $TOP.uninstall, $TOP.script | ForEach-Object { Get-Item -LiteralPath $_ -Force })
foreach ($f in $all) { [void](Assert-OnStick $f.FullName) }
$mb = [math]::Round((($all | Measure-Object Length -Sum).Sum) / 1MB, 1)
Write-Host "CATCC installer built on $root ($($all.Count) files, $mb MB): Install CATCC.cmd, Uninstall CATCC.cmd and CATCC test script.txt in the root, the rest in CATCC-files; logs in CATCC Logs."
Write-Host $(if ($liveLogs) { 'Live logs: on (Config\CATCC-logs.lua went in: the other PC''s DCS sessions send their logs to SDOBot).' } else { 'Live logs: off (no catcc-dcs\Config\CATCC-logs.lua: scripts\catcc\catcc-logs-setup.ps1 writes it).' })
Write-Host 'Eject the stick and take it to the other PC.'
try { Stop-Transcript | Out-Null } catch { }
