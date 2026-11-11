# CATCC catapult-hold test 1: does an edit to the deck crew's behaviour tree hold the shot?
#
# Patches CoreMods/tech/USS_Nimitz/scripts/common.xml so that, after the pilot salutes, the
# shooter shows a message, waits 30 s, shows another message, then launches as normal.
# The stock file is backed up once to %LOCALAPPDATA%\CATCC\common.xml.catcc-orig; -Revert puts it back.
# If Windows refuses the write, run it from an elevated (Run as administrator) PowerShell.
#
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\test\cat-hold-test.ps1            # apply
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\test\cat-hold-test.ps1 -Revert    # undo
#   ... -DcsPath "D:\DCS World"                                                            # other install
#
# Restart DCS after applying or reverting (the tree is read when the ship's crew is created).

param(
  [switch]$Revert,
  [string]$DcsPath = 'C:\Program Files\Eagle Dynamics\DCS World',
  [int]$HoldSeconds = 30
)

$ErrorActionPreference = 'Stop'

# DCS lives under Program Files: writing there needs admin. Re-launch elevated (one UAC prompt).
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', "`"$PSCommandPath`"", '-DcsPath', "`"$DcsPath`"", '-HoldSeconds', $HoldSeconds)
  if ($Revert) { $args += '-Revert' }
  Start-Process powershell -Verb RunAs -ArgumentList $args
  Write-Host "Opened an elevated window to do the change (approve the UAC prompt)."
  exit 0
}

$file =Join-Path $DcsPath 'CoreMods\tech\USS_Nimitz\scripts\common.xml'
# backup outside Program Files (creating files there needs admin; editing the existing one may not)
$backupDir = Join-Path $env:LOCALAPPDATA 'CATCC'
New-Item -ItemType Directory -Force $backupDir | Out-Null
$backup = Join-Path $backupDir 'common.xml.catcc-orig'
if (-not (Test-Path $file)) { throw "Not found: $file (pass -DcsPath)" }

$enc = New-Object System.Text.UTF8Encoding($false)

if ($Revert) {
  if (-not (Test-Path $backup)) { throw "No backup at $backup; nothing to revert." }
  Copy-Item $backup $file -Force
  Remove-Item $backup
  Write-Host "Reverted: stock common.xml restored."
  exit 0
}

$text = [System.IO.File]::ReadAllText($file, $enc)
if ($text.Contains('CATCC TEST')) { Write-Host "Already patched. Run with -Revert first to re-apply."; exit 0 }

$anchor = 'name="salute_flag == true?" output_bb_key="" param_name="salute_flag" param_value="true"/>'
$at = $text.IndexOf($anchor)
if ($at -lt 0) { throw "Salute check not found in common.xml (DCS update changed the tree?)" }
if ($text.IndexOf($anchor, $at + 1) -ge 0) { throw "Salute check found more than once; not patching blind." }

# indentation of the anchor's line, so the inserted nodes line up
$lineStart = $text.LastIndexOf("`n", $at) + 1
$indent = ($text.Substring($lineStart, $at - $lineStart) -replace '\S.*$', '')
$nl = "`n"
$insert = $nl +
  "$indent<!-- CATCC TEST: hold the shot after the salute -->" + $nl +
  "$indent<Action ID=`"MessageNode`" duration=`"10`" message=`"CATCC TEST: salute received, shooter holding $HoldSeconds s`" name=`"CATCC TEST hold msg`"/>" + $nl +
  "$indent<Action ID=`"Pause`" delay=`"$HoldSeconds`" name=`"CATCC TEST hold`" random_spread=`"0`"/>" + $nl +
  "$indent<Action ID=`"MessageNode`" duration=`"10`" message=`"CATCC TEST: hold released, launching`" name=`"CATCC TEST release msg`"/>"

$end = $at + $anchor.Length
$patched = $text.Substring(0, $end) + $insert + $text.Substring($end)

if (-not (Test-Path $backup)) { Copy-Item $file $backup }
[System.IO.File]::WriteAllText($file, $patched, $enc)
Write-Host "Patched: $file"
Write-Host "Backup:  $backup"
Write-Host "Restart DCS, cat-launch a Hornet, salute, and watch for the CATCC TEST messages."
