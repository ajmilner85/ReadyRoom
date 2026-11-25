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
# older versions must be deleted before files from the current version are added. It's ok to delete all files on the
# drive except for the canary"): FIRST the stick is emptied: everything on it is deleted but the sentinel and the two
# folders Windows keeps on every drive ("System Volume Information", "$RECYCLE.BIN"); THEN "Install CATCC.cmd" and
# "Uninstall CATCC.cmd" are written in its root and the folder CATCC-files with all the rest beside them. Nothing is
# deleted when anything on the stick is a link (a junction or symbolic link: deleting through it could reach files off
# the stick); every file and folder is checked to be under the drive's root before it is deleted or written.
#
# What goes in: the two installers that already exist (deck-test\crew-test\install.ps1 and pilot\install.ps1) with
# every file they read, in the repository's own layout under CATCC-files\catcc-dcs (so they run there unchanged), and
# CATCC-files\catcc-usb.ps1, which both .cmd files run (it finds that PC's Saved Games and DCS folders and asks for
# admin once). Built from this working tree as it is now: build the native modules first (their build.cmd). Nothing
# private goes in: Scripts\CATCC\config.lua (the room's settings) is left out, and no log or Config file.
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
$TOP = @{ install = $root + 'Install CATCC.cmd'; uninstall = $root + 'Uninstall CATCC.cmd'; script = $root + 'CATCC test script.txt' }
Write-Host "The CATCC USB stick: $($found[0]) (removable, labelled '$LABEL', $SENTINEL at its root). It is emptied (but $SENTINEL), then $($TOP.install), $($TOP.uninstall) and $Out are written."
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
  'pilot\Scripts\Hooks\CATCC-pilot-hook.lua'
)
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

# ---------------------------------------------------------------- the stick emptied first
$Out = Assert-OnStick $Out
$sentinelFull = Assert-OnStick ($root + $SENTINEL)
$KEEP = @('System Volume Information', '$RECYCLE.BIN')
$goes = @(Get-ChildItem -LiteralPath $root -Force | Where-Object { $_.FullName -ne $sentinelFull -and $KEEP -notcontains $_.Name })
# (no links anywhere in what goes: nothing deleted through one)
foreach ($t in $goes) {
  if ($t.Attributes -band [IO.FileAttributes]::ReparsePoint) { Stop-Build "$($t.FullName) is a link: nothing deleted (deleting through it could reach files off the stick)." }
  if ($t.PSIsContainer) {
    $link = Get-ChildItem -LiteralPath $t.FullName -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1
    if ($link) { Stop-Build "$($link.FullName) is a link: nothing deleted (deleting through it could reach files off the stick)." }
  }
}
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
$left = @(Get-ChildItem -LiteralPath $root -Force | Where-Object { $_.FullName -ne $sentinelFull -and $KEEP -notcontains $_.Name })
if ($left.Count -gt 0) { Stop-Build "the stick could not be emptied ($($left[0].FullName) is still there): nothing new written." }
if (-not (Test-Path -LiteralPath $sentinelFull)) { Stop-Build 'the sentinel is gone: nothing new written.' }
Write-Host "The stick emptied: $gone file(s) deleted; $SENTINEL kept."

# ---------------------------------------------------------------- the build
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
Write-Host "CATCC installer built on $root ($($all.Count) files, $mb MB): Install CATCC.cmd, Uninstall CATCC.cmd and CATCC test script.txt in the root, the rest in CATCC-files. Eject the stick and take it to the other PC."
