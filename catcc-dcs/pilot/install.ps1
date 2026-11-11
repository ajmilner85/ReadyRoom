# CATCC pilot mod: install (or -Uninstall) on a pilot's PC. One command:
#
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\pilot\install.ps1
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\pilot\install.ps1 -Server localhost        # local testing
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\pilot\install.ps1 -Uninstall
#
# What it does:
#   1. copies Mods\aircraft\CATCC-Pilot (the gate cockpit device, added to every aircraft) and
#      Scripts\Hooks\CATCC-pilot-hook.lua into Saved Games\DCS (or DCS.openbeta);
#   2. with -Server, writes Saved Games\...\Config\CATCC-pilot.lua (default server: the squadron's);
#   3. patches the deck crew's launch sequence (CoreMods\tech\USS_Nimitz\scripts\common.xml) so the
#      shooter, after your salute, waits while the gate says you're held. Removes the 30 s test patch.
# DCS updates replace common.xml: run this again after an update. Restart DCS afterwards.

param(
  [switch]$Uninstall,
  [string]$Server,
  [int]$Port = 10310,
  [string]$DcsPath = 'C:\Program Files\Eagle Dynamics\DCS World',
  [string]$SavedGames,
  # testing against copies outside Program Files
  [switch]$NoElevate
)

$ErrorActionPreference = 'Stop'
$GateArg = 997 # must match catcc_gate.lua and CATCC-pilot-hook.lua

# common.xml lives under Program Files: re-launch elevated (one UAC prompt)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $NoElevate) {
  $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', "`"$PSCommandPath`"", '-DcsPath', "`"$DcsPath`"", '-Port', $Port)
  if ($Uninstall) { $argv += '-Uninstall' }
  if ($Server) { $argv += @('-Server', "`"$Server`"") }
  if (-not $SavedGames) {
    foreach ($d in 'DCS', 'DCS.openbeta') {
      $p = Join-Path ([Environment]::GetFolderPath('UserProfile')) "Saved Games\$d"
      if (Test-Path $p) { $SavedGames = $p; break }
    }
  }
  if ($SavedGames) { $argv += @('-SavedGames', "`"$SavedGames`"") }
  Start-Process powershell -Verb RunAs -ArgumentList $argv
  Write-Host "Opened an elevated window to install (approve the UAC prompt)."
  exit 0
}

if (-not $SavedGames) {
  foreach ($d in 'DCS', 'DCS.openbeta') {
    $p = Join-Path ([Environment]::GetFolderPath('UserProfile')) "Saved Games\$d"
    if (Test-Path $p) { $SavedGames = $p; break }
  }
}
if (-not $SavedGames -or -not (Test-Path $SavedGames)) { throw "Saved Games\DCS not found (pass -SavedGames)" }
$here = Split-Path -Parent $PSCommandPath
$modDst = Join-Path $SavedGames 'Mods\aircraft\CATCC-Pilot'
$hookDst = Join-Path $SavedGames 'Scripts\Hooks\CATCC-pilot-hook.lua'
$xml = Join-Path $DcsPath 'CoreMods\tech\USS_Nimitz\scripts\common.xml'
if (-not (Test-Path $xml)) { throw "Not found: $xml (pass -DcsPath)" }
$enc = New-Object System.Text.UTF8Encoding($false)

# every line we add to common.xml carries "CATCC" (the test patch too), so removing is one pass
$text = [System.IO.File]::ReadAllText($xml, $enc)
$text = [regex]::Replace($text, '\n[ \t]*<[^\n]*CATCC[^\n]*', '')

if ($Uninstall) {
  [System.IO.File]::WriteAllText($xml, $text, $enc)
  if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst }
  if (Test-Path $hookDst) { Remove-Item -Force $hookDst }
  Write-Host "CATCC pilot mod removed; common.xml back to stock. Restart DCS."
  exit 0
}

# 1. files
New-Item -ItemType Directory -Force (Split-Path $modDst) | Out-Null
if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst }
Copy-Item -Recurse (Join-Path $here 'Mods\aircraft\CATCC-Pilot') $modDst
New-Item -ItemType Directory -Force (Split-Path $hookDst) | Out-Null
Copy-Item -Force (Join-Path $here 'Scripts\Hooks\CATCC-pilot-hook.lua') $hookDst

# 2. config
if ($Server) {
  $cfgDir = Join-Path $SavedGames 'Config'
  New-Item -ItemType Directory -Force $cfgDir | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $cfgDir 'CATCC-pilot.lua'), "return { host = '$Server', port = $Port }`n", $enc)
}

# 3. the gate in the launch sequence, right after the shooter sees your salute
$anchor = 'name="salute_flag == true?" output_bb_key="" param_name="salute_flag" param_value="true"/>'
$at = $text.IndexOf($anchor)
if ($at -lt 0) { throw "Salute check not found in common.xml (DCS update changed the tree?)" }
if ($text.IndexOf($anchor, $at + 1) -ge 0) { throw "Salute check found more than once; not patching blind." }
$lineStart = $text.LastIndexOf("`n", $at) + 1
$i0 = ($text.Substring($lineStart, $at - $lineStart) -replace '\S.*$', '')
$i1 = "$i0    "
$i2 = "$i1    "
$nl = "`n"
$cond = "<Condition ID=`"CheckDrawArgument`" argument_id=`"$GateArg`" argument_value=`"0.5`" condition=`"less`""
$gate = $nl +
  "$i0<!-- CATCC: PriFly launch clearance. The gate device sets draw argument $GateArg to 1 while PriFly holds you -->" + $nl +
  "$i0<Fallback name=`"CATCC PriFly clearance`">" + $nl +
  "$i1$cond name=`"CATCC cleared?`"/>" + $nl +
  "$i1<SequenceStar name=`"CATCC hold`">" + $nl +
  "$i2<Action ID=`"MessageNode`" duration=`"10`" message=`"Shooter holding: awaiting PriFly clearance`" name=`"CATCC hold msg`"/>" + $nl +
  "$i2$cond name=`"CATCC wait for clearance`"/>" + $nl +
  "$i1</SequenceStar><!-- CATCC -->" + $nl +
  "$i0</Fallback><!-- CATCC -->"
$end = $at + $anchor.Length
$text = $text.Substring(0, $end) + $gate + $text.Substring($end)
[System.IO.File]::WriteAllText($xml, $text, $enc)

$srv = if ($Server) { "${Server}:$Port" } else { 'the squadron server (default)' }
Write-Host "CATCC pilot mod installed in $SavedGames (server: $srv); launch gate added to common.xml. Restart DCS."
