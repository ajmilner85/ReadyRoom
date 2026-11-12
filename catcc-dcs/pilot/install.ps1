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
#      shooter, once you're ready on the catapult and before the run-up signal, waits while the gate
#      says you're held. Removes any earlier CATCC patch (the 30 s test, the old after-salute gate);
#   4. routes the Hornet's F8 "Wheel chocks > Remove" through PriFly (Mods\aircraft\FA-18C\comm.lua).
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
$comm = Join-Path $DcsPath 'Mods\aircraft\FA-18C\comm.lua' # the Hornet's F8 radio menu
$enc = New-Object System.Text.UTF8Encoding($false)

# the line we add to comm.lua ends in "-- CATCC ...", so removing it is one pass too
$commText = $null
if (Test-Path $comm) {
  $commText = [System.IO.File]::ReadAllText($comm, $enc)
  $commText = [regex]::Replace($commText, '\r?\n[^\r\n]*-- CATCC[^\r\n]*', '')
}

# every line we add to common.xml carries "CATCC" (the test patch too), so removing is one pass
$text = [System.IO.File]::ReadAllText($xml, $enc)
$text = [regex]::Replace($text, '\n[ \t]*<[^\n]*CATCC[^\n]*', '')

if ($Uninstall) {
  [System.IO.File]::WriteAllText($xml, $text, $enc)
  if ($null -ne $commText) { [System.IO.File]::WriteAllText($comm, $commText, $enc) }
  if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst }
  if (Test-Path $hookDst) { Remove-Item -Force $hookDst }
  Write-Host "CATCC pilot mod removed; common.xml and the Hornet's comm.lua back to stock. Restart DCS."
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

# 3. the gate in the launch sequence: once you're on the catapult and ready, before the shooter's
#    run-up signal (Sign_Launch1). Taxiing on and spawning on the cat both end in this phase.
$anchor = 'name="client_status == 13" output_bb_key="" param_name="client_status" param_value="13"/>'
$at = $text.IndexOf($anchor)
if ($at -lt 0) { throw "Ready-on-catapult check not found in common.xml (DCS update changed the tree?)" }
if ($text.IndexOf($anchor, $at + 1) -ge 0) { throw "Ready-on-catapult check found more than once; not patching blind." }
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

# 4. the Hornet's F8 "Wheel chocks > Remove" asks the pilot hook first (PriFly holds the chocks until it
#    gives a taxi instruction). Looked up when pressed, so without the mod's hook it is the stock request.
$chocksDone = $false
if ($null -ne $commText) {
  $canchor = "submenu = menus['Wheel chocks']}"
  $ca = $commText.IndexOf($canchor)
  if ($ca -ge 0 -and $commText.IndexOf($canchor, $ca + 1) -lt 0) {
    $eol = $commText.IndexOf("`n", $ca)
    if ($eol -lt 0) { $eol = $commText.Length }
    if ($eol -gt 0 -and $commText[$eol - 1] -eq "`r") { $eol = $eol - 1 }
    $cnl = if ($commText.Contains("`r`n")) { "`r`n" } else { "`n" }
    # The menu runs in DCS's main Lua state, not the GUI state the pilot hook runs in: the line keeps
    # CATCC_CHOCKS there (held flag + when the hook last set it, requests kept, place / remove with the
    # ground crew selected first, as the menu does). The hook reads and writes it with net.dostring_in.
    # No word from the hook for 15 s: not held (the stock request).
    $line = "do local G = getfenv(0); local wc = menus['Wheel chocks']; local it = wc and wc.items and wc.items[2]; " +
      "local pl = wc and wc.items and wc.items[1]; " +
      "if G and it and it.command and pl and pl.command then " +
      "local orig, place, tune = it.command, pl.command, selectAndTuneCommunicator; " +
      "local S = G.CATCC_CHOCKS or { held = false, at = 0, asked = 0, pending = false }; G.CATCC_CHOCKS = S; " +
      "local clock = G.os and G.os.clock; " +
      "S.place = function() if tune then tune(nil) end; place:perform({}) end; " +
      "S.remove = function() if tune then tune(nil) end; orig:perform({}) end; " +
      "it.command = { perform = function(self, p) " +
      "if S.held and (not clock or clock() - (S.at or 0) < 15) then S.asked = (S.asked or 0) + 1; S.pending = true; return end; " +
      "return orig:perform(p) end }; " +
      "if G.print then G.print('CATCC: Hornet wheel chocks menu routed through PriFly') end end end " +
      "-- CATCC: PriFly holds the chocks until it gives the taxi instruction"
    $commText = $commText.Substring(0, $eol) + $cnl + $line + $commText.Substring($eol)
    [System.IO.File]::WriteAllText($comm, $commText, $enc)
    $chocksDone = $true
  } else {
    Write-Warning "Hornet comm.lua: the Wheel chocks menu wasn't found exactly once; chocks not routed through PriFly."
  }
}

$srv = if ($Server) { "${Server}:$Port" } else { 'the squadron server (default)' }
$chk = if ($chocksDone) { '; Hornet chocks routed through PriFly' } else { '' }
Write-Host "CATCC pilot mod installed in $SavedGames (server: $srv); launch gate added to common.xml$chk. Restart DCS."
