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
#   4. routes the Hornet's F8 "Wheel chocks > Remove" and "Salute!" through PriFly
#      (Mods\aircraft\FA-18C\comm.lua): while PriFly holds your chocks they wait for the taxi instruction;
#   4b. makes the ground crew's answer silent when the mod itself asks for chocks
#      (Scripts\Speech\speech.lua, one line at the top of make());
#   5. lets the pilot hook reach the F8 menu: Saved Games\...\Config\autoexec.cfg gets "userhooks" in
#      net.allow_unsafe_api and "server" in net.allow_dostring_in (what DCS asks for, API\Sim_ControlAPI.md).
# -Experiments also installs what was tried and parked (the chock static objects with their cargo
# parameter files in the DCS folder's Data, the native chock-flag module); without it they are removed.
# DCS updates replace common.xml and comm.lua: run this again after an update. Restart DCS afterwards.

param(
  [switch]$Uninstall,
  [string]$Server,
  [int]$Port = 10310,
  [string]$DcsPath = 'C:\Program Files\Eagle Dynamics\DCS World',
  [string]$SavedGames,
  # also install the parked experiments (chock statics, cargo csv files, native chock-flag module)
  [switch]$Experiments,
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
  if ($Experiments) { $argv += '-Experiments' }
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
$chocksDst = Join-Path $SavedGames 'Mods\tech\CATCC-Chocks' # parked experiment (chock static objects): only with -Experiments
$hookDst = Join-Path $SavedGames 'Scripts\Hooks\CATCC-pilot-hook.lua'
$dataDst = Join-Path $DcsPath 'Data' # DCS wants <shape>.csv here for every Cargo static (parked experiment)
$autoexec = Join-Path $SavedGames 'Config\autoexec.cfg'
$xml =Join-Path $DcsPath 'CoreMods\tech\USS_Nimitz\scripts\common.xml'
if (-not (Test-Path $xml)) { throw "Not found: $xml (pass -DcsPath)" }
$comm = Join-Path $DcsPath 'Mods\aircraft\FA-18C\comm.lua' # the Hornet's F8 radio menu
$speech = Join-Path $DcsPath 'Scripts\Speech\speech.lua' # builds every radio call (voice + subtitle)
$enc = New-Object System.Text.UTF8Encoding($false)

# the line we add to comm.lua ends in "-- CATCC ...", so removing it is one pass too
$commText = $null
if (Test-Path $comm) {
  $commText = [System.IO.File]::ReadAllText($comm, $enc)
  $commText = [regex]::Replace($commText, '\r?\n[^\r\n]*-- CATCC[^\r\n]*', '')
}
$speechText = $null
if (Test-Path $speech) {
  $speechText = [System.IO.File]::ReadAllText($speech, $enc)
  $speechText = [regex]::Replace($speechText, '\r?\n[^\r\n]*-- CATCC[^\r\n]*', '')
}

# every line we add to common.xml carries "CATCC" (the test patch too), so removing is one pass
$text = [System.IO.File]::ReadAllText($xml, $enc)
$text = [regex]::Replace($text, '\n[ \t]*<[^\n]*CATCC[^\n]*', '')

if ($Uninstall) {
  [System.IO.File]::WriteAllText($xml, $text, $enc)
  if ($null -ne $commText) { [System.IO.File]::WriteAllText($comm, $commText, $enc) }
  if ($null -ne $speechText) { [System.IO.File]::WriteAllText($speech, $speechText, $enc) }
  if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst }
  if (Test-Path $chocksDst) { Remove-Item -Recurse -Force $chocksDst }
  if (Test-Path $hookDst) { Remove-Item -Force $hookDst }
  if (Test-Path $dataDst) { Get-ChildItem $dataDst -Filter 'CATCC_*.csv' | Remove-Item -Force }
  if (Test-Path $autoexec) {
    $auto = [System.IO.File]::ReadAllText($autoexec, $enc)
    $auto2 = [regex]::Replace($auto, '(?m)^[^\r\n]*-- CATCC[^\r\n]*\r?\n?', '')
    if ($auto2 -ne $auto) { [System.IO.File]::WriteAllText($autoexec, $auto2, $enc) }
  }
  Write-Host "CATCC pilot mod removed; common.xml and the Hornet's comm.lua back to stock. Restart DCS."
  exit 0
}

# 1. files
New-Item -ItemType Directory -Force (Split-Path $modDst) | Out-Null
if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst }
Copy-Item -Recurse (Join-Path $here 'Mods\aircraft\CATCC-Pilot') $modDst
New-Item -ItemType Directory -Force (Split-Path $hookDst) | Out-Null
Copy-Item -Force (Join-Path $here 'Scripts\Hooks\CATCC-pilot-hook.lua') $hookDst
# the parked experiments: the native chock-flag module (bin), the chock statics and their cargo csv files
if (Test-Path $chocksDst) { Remove-Item -Recurse -Force $chocksDst }
if (Test-Path $dataDst) { Get-ChildItem $dataDst -Filter 'CATCC_*.csv' | Remove-Item -Force }
if ($Experiments) {
  New-Item -ItemType Directory -Force (Split-Path $chocksDst) | Out-Null
  Copy-Item -Recurse (Join-Path $here 'Mods\tech\CATCC-Chocks') $chocksDst
  if ((Test-Path $dataDst) -and (Test-Path (Join-Path $here 'Data'))) {
    Get-ChildItem (Join-Path $here 'Data') -Filter 'CATCC_*.csv' | ForEach-Object { Copy-Item -Force $_.FullName $dataDst }
  }
} else {
  $bin = Join-Path $modDst 'bin'
  if (Test-Path $bin) { Remove-Item -Recurse -Force $bin }
}

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
$saluteDone = $false
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
    $chocksDone = $true
    # The F8 "Salute!" item (the deck crew pulls the chocks on the pilot's salutes): while PriFly holds
    # the chocks (S.sal, set by the hook; no word for 15 s: stock) the salute isn't sent, it is counted
    # for the hook, which tells PriFly the pilot is ready to taxi. The line goes right after the item,
    # so the item is the last one in the ground crew menu at that point.
    $sanchor = 'sendMessage.new(Message.wMsgLeaderGroundGestureSalut, true)}'
    $sa = $commText.IndexOf($sanchor)
    if ($sa -ge 0 -and $commText.IndexOf($sanchor, $sa + 1) -lt 0) {
      $seol = $commText.IndexOf("`n", $sa)
      if ($seol -lt 0) { $seol = $commText.Length }
      if ($seol -gt 0 -and $commText[$seol - 1] -eq "`r") { $seol = $seol - 1 }
      $sline = "do local G = getfenv(0); local it = g_crew_items[#g_crew_items]; " +
        "if G and it and it.command then " +
        "local orig = it.command; " +
        "local S = G.CATCC_CHOCKS or { held = false, at = 0, asked = 0, pending = false }; G.CATCC_CHOCKS = S; " +
        "S.salPatched = true; " +
        "local clock = G.os and G.os.clock; " +
        "it.command = { perform = function(self, p) " +
        "if S.sal and (not clock or clock() - (S.at or 0) < 15) then S.salAsked = (S.salAsked or 0) + 1; return end; " +
        "return orig:perform(p) end }; " +
        "if G.print then G.print('CATCC: Hornet salute menu item routed through PriFly') end end end " +
        "-- CATCC: PriFly holds the salute (the deck crew's chocks) until it gives the taxi instruction"
      $commText = $commText.Substring(0, $seol) + $cnl + $sline + $commText.Substring($seol)
      $saluteDone = $true
    } else {
      Write-Warning "Hornet comm.lua: the Salute! item wasn't found exactly once; the F8 salute is not routed through PriFly."
    }
    [System.IO.File]::WriteAllText($comm, $commText, $enc)
  } else {
    Write-Warning "Hornet comm.lua: the Wheel chocks menu wasn't found exactly once; chocks not routed through PriFly."
  }
}

# 4b. the radio calls: when the pilot hook asks the ground crew for chocks (deck crew off), their answer
#     ("copy", "wheel chocks are now placed") is silent. Every radio call is built by speech.make in
#     Scripts\Speech\speech.lua; the line added at its top returns nothing for those two calls while the
#     hook's quiet window (CATCC_CHOCKS.quietUntil, set when it asks) runs. Everything else as stock.
$speechDone = $false
if ($null -ne $speechText) {
  $sanchor2 = 'function make(message)'
  $sm = $speechText.IndexOf($sanchor2)
  if ($sm -ge 0 -and $speechText.IndexOf($sanchor2, $sm + 1) -lt 0) {
    $seol2 = $speechText.IndexOf("`n", $sm)
    if ($seol2 -lt 0) { $seol2 = $speechText.Length }
    if ($seol2 -gt 0 -and $speechText[$seol2 - 1] -eq "`r") { $seol2 = $seol2 - 1 }
    $snl = if ($speechText.Contains("`r`n")) { "`r`n" } else { "`n" }
    $qline = "`tlocal catccS = base.CATCC_CHOCKS; if catccS and catccS.quietUntil and message and base.Message and " +
      "(message.event == base.Message.wMsgGroundCrewCopy or message.event == base.Message.wMsgGroundCrewWheelChocksOn) and " +
      "base.os and base.os.clock and base.os.clock() < catccS.quietUntil then catccS.quieted = (catccS.quieted or 0) + 1; return nil end " +
      "-- CATCC: the crew's answer to the pilot mod's own chocks request is silent"
    $speechText = $speechText.Substring(0, $seol2) + $snl + $qline + $speechText.Substring($seol2)
    # tells the pilot hook the file does it (it then skips its own run-time wrap)
    $manchor = "module('speech')"
    $mm = $speechText.IndexOf($manchor)
    if ($mm -ge 0) {
      $meol = $speechText.IndexOf("`n", $mm)
      if ($meol -gt 0 -and $speechText[$meol - 1] -eq "`r") { $meol = $meol - 1 }
      $speechText = $speechText.Substring(0, $meol) + $snl + "catccQuiet = true -- CATCC: speech.make silences the crew's answer to the pilot mod" + $speechText.Substring($meol)
    }
    [System.IO.File]::WriteAllText($speech, $speechText, $enc)
    $speechDone = $true
  } else {
    Write-Warning "Scripts\Speech\speech.lua: make() wasn't found exactly once; the crew's chock calls stay voiced."
  }
}

# 5. the pilot hook reaches the F8 menu's Lua state with net.dostring_in("server", ...). DCS allows that
#    only when autoexec.cfg says so (API\Sim_ControlAPI.md): net.allow_unsafe_api must list "userhooks"
#    and net.allow_dostring_in must list "server". Add what is missing (a new line is marked CATCC).
function Add-AutoexecEntry([string]$text, [string]$name, [string]$value) {
  $m = [regex]::Match($text, '(?m)^[ \t]*' + [regex]::Escape($name) + '[ \t]*=[ \t]*\{([^}]*)\}')
  if (-not $m.Success) {
    $anl = if ($text.Contains("`r`n") -or $text.Length -eq 0) { "`r`n" } else { "`n" }
    if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += $anl }
    return $text + $name + ' = {"' + $value + '"} -- CATCC: the pilot hook reaches the F8 menu' + $anl
  }
  $list = $m.Groups[1].Value
  if ($list -match ('["'']' + [regex]::Escape($value) + '["'']')) { return $text }
  $kept = $list.TrimEnd()
  $sep = if ($kept.Trim().Length -eq 0) { '' } elseif ($kept.EndsWith(',')) { ' ' } else { ', ' }
  $new = $kept + $sep + '"' + $value + '"' + $list.Substring($kept.Length)
  return $text.Substring(0, $m.Groups[1].Index) + $new + $text.Substring($m.Groups[1].Index + $m.Groups[1].Length)
}
$autoDone = ''
New-Item -ItemType Directory -Force (Split-Path $autoexec) | Out-Null
$auto = if (Test-Path $autoexec) { [System.IO.File]::ReadAllText($autoexec, $enc) } else { '' }
$auto2 = Add-AutoexecEntry (Add-AutoexecEntry $auto 'net.allow_unsafe_api' 'userhooks') 'net.allow_dostring_in' 'server'
if ($auto2 -ne $auto) {
  [System.IO.File]::WriteAllText($autoexec, $auto2, $enc)
  $autoDone = '; autoexec.cfg now lets the hook reach the F8 menu'
}

$srv = if ($Server) { "${Server}:$Port" } else { 'the squadron server (default)' }
$chk = if ($chocksDone -and $saluteDone) { '; Hornet chocks and salute routed through PriFly' } elseif ($chocksDone) { '; Hornet chocks routed through PriFly' } else { '' }
$exp = if ($Experiments) { '; parked experiments installed' } else { '' }
if ($speechDone) { $chk += '; crew chock calls silent for the mod' }
Write-Host "CATCC pilot mod installed in $SavedGames (server: $srv); launch gate added to common.xml$chk$autoDone$exp. Restart DCS."
