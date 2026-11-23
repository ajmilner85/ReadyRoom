# CATCC director test: can we steer the Supercarrier taxi directors (yellow shirts)?
#
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\director-test.ps1 -Hold Pause
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\director-test.ps1 -Hold Gate
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\director-test.ps1 -Reroute Traj     (or Routes, Both)
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\director-test.ps1 -Hold Pause -Reroute Both
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\director-test.ps1 -Revert
#
# Close DCS first. Asks for admin (the files are under Program Files). Each run first takes out whatever an
# earlier run of THIS script put in, then applies what you ask for, so switching variants is one command.
# Only lines/blocks marked CATCC-DIRTEST are ever touched; other CATCC patches (the launch gate in
# common.xml, a chock gate) are left alone. A DCS update or repair puts the original files back.
#
# HOLD (CoreMods\tech\USS_Nimitz\scripts\takeoff_logic.xml, the taxi directors' behaviour tree, which is a
# single Move: a director walking to his station when the jet reaches his hand-over point):
#   -Hold Pause  every director task starts with a message "CATCC test: director task, pausing 20 s" and a
#                20 s pause before he moves. Needs nothing else (single player is fine). Shows: does this tree
#                run on your PC, when does each director task start (taxi out AND after landing), and what a
#                director does while his task is held.
#   -Hold Freeze the same with a 600 s pause: unmistakable whenever the tasks start. If they start at spawn,
#                the yellow shirts never walk to their stations; if at the hand-over, the next one never comes;
#                if everything looks normal, this tree doesn't drive them.
#   -Hold Gate   the director waits while YOUR aircraft's draw argument 997 is above 0.5: the pilot mod's
#                launch-gate argument, which the room sets to 1 for every player jet on deck while the Air Boss
#                (or Shooter) seat is held and you are not cleared. So: take the AIR BOSS seat in PriFly =
#                directors hold; leave it = they carry on (within ~2 s). Needs the full chain (pilot mod
#                installed, hosted session with the CATCC hook and room), as for the launch-clearance test.
#                Shows: which aircraft's arguments this tree reads, and whether the room can hold a director.
#
# REROUTE (every spawn-spot -> catapult route gets a 5 m bend to the left of travel, smooth, none at the
# spot or the catapult, full halfway; director-reroute.lua):
#   -Reroute Traj    only the recorded taxi trajectories (trajectories_f18.lua, trajectories_f14_to.lua)
#   -Reroute Routes  only GT.TaxiForTORoutes (USS_Nimitz_RunwaysAndRoutes.lua)
#   -Reroute Both    both
#   Shows: which of the two the directors steer you by (their turn signals bring you along the bend, or the
#   old line). Test with one client aircraft, cold start, nothing else parked on deck: AI taxi uses the
#   routes too, and a bent path can run into parked jets. Can't be combined with deck-test.ps1 (it rewrites
#   the same routes); -Revert that one first.
#
# SPAWN (director-spawn.lua): a deck spawn spot is the first point of its GT.TaxiForTORoutes route.
#   -Spawn Shift     every spawn spot moves 8 m along its own first leg (at most 60% of it), same heading.
#   Shows: does DCS spawn you at the moved point, and do the yellow shirts still pick you up and hand you on.
#   See it with F10 > CATCC route lines > "My spot: stock + moved spawn" (blue = moved route, yellow X = the
#   stock spawn spot). Can be combined with -Reroute Routes (the bend is applied first).
#   -Spawn Spots     DCS's 16 spawn spots replaced by the 40 of the spotting plan (director-spots.lua, made
#                    by spots.gen.ts from carrier-ops-handoff-2\deck-spots.csv and PriFly's taxi network):
#                    each spot's route starts on the spot, points the jet as it is parked on the plan, and
#                    runs to a catapult. DCS's 16 parking routes (where AI taxi after landing) are replaced
#                    too, by 31 that end on spots of the plan: with the spawn spots replaced and the parking
#                    routes left alone the AI never came aboard (2026-11-14). GroundCrew.lua gets a hand-off list for each new route
#                    (director-spots-crew.lua) so the deck crew option ON does not crash DCS; the spots are
#                    meant for the option OFF. Not with -Reroute Routes / Both (the table is replaced).
#                    Shows: where does DCS spawn you now, which way do you point, how many deck slots does
#                    the mission editor offer? Go with the crew test's "Marshal me to catapult N".
#
# CREW (GroundCrew.lua, the file that sets up the Supercarrier's crews; crew-test\groundcrew-patch.lua):
#   -Crew Draw       DCS's own crew debug drawing switched on (shipped commented out in GroundCrew.lua).
#   -Crew People     one person of ours added to the take-off crew (a green shirt, "catcc-00", 14 m forward /
#                    27 m to starboard). The hand-off lists stay as DCS ships them: emptying one crashes DCS
#                    on the first simulation step with a jet on that spot (tried 2026-11-14).
#   -Crew Full       both. (Draw and People exist so one half can be dropped if it upsets DCS.)
#   -Crew Extra      Full, plus four people of ours ("catcc-c0" .. "catcc-c3") as extra members of catapult
#                    crew 1. These exist with the deck crew option OFF too (the take-off crew, catcc-00
#                    included, does not): one such member was there and took every order on 2026-11-14.
#   -Crew Model      Extra (its four are the flight directors: yellow shirts), plus two more members of catapult
#                    crew 1: "catcc-m0", the plane captain (a brown shirt), and "catcc-t0", the tow tractor's
#                    driver (a blue shirt). All stand 12 to 14 m forward, 29 to 33 m to starboard, off elevator 1.
#   Goes with the crew test (crew-test\install.ps1: the native module and F10 > CATCC crew test).
#
# CATAPULT CREW GATE (common.xml, the catapult crews' behaviour tree):
#   -CatGate         one condition added to the tree's "Occupy catapult" sequence: a crew that has cleared its
#                    catapult walks back only while "operation allowed" is true. DCS itself orders a cleared
#                    crew back whenever nothing is landing (2026-11-14: a crew told to free its catapult
#                    walked off and straight back, for ever), and it does not touch "operation allowed"
#                    except between catapults 3 and 4 while 4 launches. So with the gate, the crew test's
#                    "Close it" (operation allowed off + free) keeps a crew off its catapult, through
#                    landings too, until "Open it". Shows: do they stay off, and does the AI still land?
#                    Sits beside the pilot mod's own lines in common.xml (the catapult hold); -Revert takes
#                    only this one out.

param(
  [ValidateSet('None', 'Pause', 'Freeze', 'Gate')][string]$Hold = 'None',
  [ValidateSet('None', 'Traj', 'Routes', 'Both')][string]$Reroute = 'None',
  [ValidateSet('None', 'Shift', 'Spots')][string]$Spawn = 'None',
  [ValidateSet('None', 'Draw', 'People', 'Full', 'Extra', 'Model')][string]$Crew = 'None',
  [switch]$CatGate,
  [switch]$Revert,
  [string]$DcsDir = 'C:\Program Files\Eagle Dynamics\DCS World',
  # testing against copies outside Program Files (also skips the DCS-running check)
  [switch]$NoElevate
)

$ErrorActionPreference = 'Stop'
if (-not $Revert -and $Hold -eq 'None' -and $Reroute -eq 'None' -and $Spawn -eq 'None' -and $Crew -eq 'None' -and -not $CatGate) {
  Write-Host 'Nothing to do: pass -Hold Pause|Gate, -Reroute Traj|Routes|Both, -Spawn Shift|Spots, -Crew Draw|People|Full|Extra|Model and/or -CatGate, or -Revert.'
  return
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $NoElevate -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $argList = @('-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-DcsDir', "`"$DcsDir`"", '-Hold', $Hold, '-Reroute', $Reroute, '-Spawn', $Spawn, '-Crew', $Crew)
  if ($Revert) { $argList += '-Revert' }
  if ($CatGate) { $argList += '-CatGate' }
  Start-Process powershell -Verb RunAs -ArgumentList $argList
  Write-Host 'Opened an elevated window (approve the UAC prompt).'
  return
}

if (-not $NoElevate -and (Get-Process -Name DCS -ErrorAction SilentlyContinue)) { Write-Host 'DCS is running. Close it and run this again.'; return }

$dir = Join-Path $DcsDir 'CoreMods\tech\USS_Nimitz\scripts'
$xmlFile = Join-Path $dir 'takeoff_logic.xml'
$routesFile = Join-Path $dir 'USS_Nimitz_RunwaysAndRoutes.lua'
$trajFiles = @((Join-Path $dir 'trajectories_f18.lua'), (Join-Path $dir 'trajectories_f14_to.lua'))
$crewFile = Join-Path $dir 'GroundCrew.lua'
$commonFile = Join-Path $dir 'common.xml'
foreach ($f in @($xmlFile, $routesFile, $crewFile, $commonFile) + $trajFiles) { if (-not (Test-Path $f)) { throw "Not found: $f (pass -DcsDir)" } }

# Latin-1: every byte of DCS's files comes back out exactly as it went in, whatever their encoding
$enc = [Text.Encoding]::GetEncoding(28591)
$mark = 'CATCC-DIRTEST'
$luaBegin = "-- $mark BEGIN"
$luaEnd = "-- $mark END"

function Backup($f) {
  $b = "$f.catcc-dirtest-backup"
  if (-not (Test-Path $b)) { Copy-Item $f $b; Write-Host "Backup: $b" }
}

# ---- take out an earlier run's changes
function Clean-Xml([string]$t) { [regex]::Replace($t, "\r?\n[ \t]*<[^\n]*$mark[^\n]*", '') }
function Clean-Lua([string]$t) {
  # every block (the routes file can hold a bend and a spawn shift)
  while (($i = $t.IndexOf($luaBegin)) -ge 0) {
    $j = $t.IndexOf($luaEnd, $i)
    if ($j -lt 0) { throw "Found '$luaBegin' without '$luaEnd'; restore the file from its .catcc-dirtest-backup" }
    $j += $luaEnd.Length
    $t = $t.Substring(0, $i).TrimEnd("`r", "`n") + "`r`n" + $t.Substring($j).TrimStart("`r", "`n")
  }
  return $t
}

$xml = [IO.File]::ReadAllText($xmlFile, $enc)
$routes = [IO.File]::ReadAllText($routesFile, $enc)
$traj = @{}
foreach ($f in $trajFiles) { $traj[$f] = [IO.File]::ReadAllText($f, $enc) }
$crewText = [IO.File]::ReadAllText($crewFile, $enc)

$common = [IO.File]::ReadAllText($commonFile, $enc)

$xml0 = $xml; $routes0 = $routes; $traj0 = $traj.Clone(); $crewText0 = $crewText; $common0 = $common
$xml = Clean-Xml $xml
$common = Clean-Xml $common

# ---- catapult crew gate: one line into the catapult crews' tree, in "Occupy catapult", before the take order is asked for
if ($CatGate) {
  $anchor = '<Action ID="CheckGCRequest" attribute_name="GC_REQUEST_CREW_SAFE" attribute_value="true" catapult="self" name="GC_REQUEST_CREW_SAFE == true?"/>'
  $at = $common.IndexOf($anchor)
  if ($at -lt 0) { throw "The 'Occupy catapult' sequence's first line was not found in common.xml (DCS update changed the tree?)" }
  if ($common.IndexOf($anchor, $at + 1) -ge 0) { throw "The 'Occupy catapult' anchor line is in common.xml more than once; not patching blind." }
  $lineStart = $common.LastIndexOf("`n", $at) + 1
  $indent = $common.Substring($lineStart, $at - $lineStart) -replace '\S.*$', ''
  $gate = "`r`n$indent<Condition ID=`"CheckGCOrder`" attribute_name=`"GC_ORDER_OPERATION_ALLOWED`" attribute_value=`"true`" catapult=`"self`" name=`"$mark occupy gate: a cleared crew returns only while operation is allowed`"/>"
  $end = $at + $anchor.Length
  $common = $common.Substring(0, $end) + $gate + $common.Substring($end)
}
$routes = Clean-Lua $routes
foreach ($f in $trajFiles) { $traj[$f] = Clean-Lua $traj[$f] }
$crewText = Clean-Lua $crewText

# ---- hold: lines into the directors' tree, before the Move
if ($Hold -ne 'None') {
  if ([regex]::IsMatch($xml, 'CATCC')) {
    throw "takeoff_logic.xml already has another CATCC patch (a chock gate?). Undo that test first; both patch the same tree."
  }
  $anchor = '<SequenceStar name="TakeoffTask">'
  $at = $xml.IndexOf($anchor)
  if ($at -lt 0) { throw "'$anchor' not found in takeoff_logic.xml (DCS update changed the tree?)" }
  if ($xml.IndexOf($anchor, $at + 1) -ge 0) { throw "'$anchor' found more than once; not patching blind." }
  $lineStart = $xml.LastIndexOf("`n", $at) + 1
  $i1 = ($xml.Substring($lineStart, $at - $lineStart) -replace '\S.*$', '') + '    '
  $i2 = "$i1    "
  $i3 = "$i2    "
  $nl = "`r`n"
  if ($Hold -eq 'Pause' -or $Hold -eq 'Freeze') {
    $sec = if ($Hold -eq 'Freeze') { 600 } else { 20 }
    $ins = $nl + "$i1<Action ID=`"MessageNode`" duration=`"15`" message=`"CATCC test: director task, pausing $sec s`" name=`"$mark msg`"/>" +
      $nl + "$i1<Action ID=`"Pause`" delay=`"$sec`" random_spread=`"0`" name=`"$mark pause`"/>"
  } else {
    $cond = "<Condition ID=`"CheckDrawArgument`" argument_id=`"997`" argument_value=`"0.5`" condition=`"less`""
    $ins = $nl + "$i1<!-- $mark : the director waits while the pilot mod's draw argument 997 reads above 0.5 (PriFly holding) -->" +
      $nl + "$i1<Fallback name=`"$mark director gate`">" +
      $nl + "$i2$cond name=`"$mark free?`"/>" +
      $nl + "$i2<SequenceStar name=`"$mark hold`">" +
      $nl + "$i3<Action ID=`"MessageNode`" duration=`"6`" message=`"CATCC test: director holding for PriFly`" name=`"$mark hold msg`"/>" +
      $nl + "$i3$cond name=`"$mark wait`"/>" +
      $nl + "$i2</SequenceStar><!-- $mark -->" +
      $nl + "$i1</Fallback><!-- $mark -->"
  }
  $end = $at + $anchor.Length
  $xml = $xml.Substring(0, $end) + $ins + $xml.Substring($end)
}

# ---- reroute: the bend block appended to the route / trajectory files
$bendLua = [IO.File]::ReadAllText((Join-Path (Split-Path -Parent $PSCommandPath) 'director-reroute.lua'), $enc)
function Bend-Block([string]$target) {
  $body = $bendLua.Replace("`r`n", "`n").TrimEnd("`n").Replace("`n", "`r`n")
  return "`r`n$luaBegin`r`nlocal CATCC_DIRTEST_TARGET = '$target'`r`ndo`r`n$body`r`nend`r`n$luaEnd`r`n"
}
if ($Reroute -eq 'Routes' -or $Reroute -eq 'Both') {
  if ($routes.Contains('CATCC_DECK_TEST BEGIN')) { throw 'deck-test.ps1 is applied to the same routes; run it with -Restore first.' }
  $routes = $routes.TrimEnd("`r", "`n") + "`r`n" + (Bend-Block 'routes')
}
if ($Reroute -eq 'Traj' -or $Reroute -eq 'Both') {
  foreach ($f in $trajFiles) { $traj[$f] = $traj[$f].TrimEnd("`r", "`n") + "`r`n" + (Bend-Block 'traj') }
}
# ---- spawn: the shift block appended to the routes file (after a bend, if there is one)
if ($Spawn -eq 'Shift') {
  if ($routes.Contains('CATCC_DECK_TEST BEGIN')) { throw 'deck-test.ps1 is applied to the same routes; run it with -Restore first.' }
  $shiftLua = [IO.File]::ReadAllText((Join-Path (Split-Path -Parent $PSCommandPath) 'director-spawn.lua'), $enc)
  $body = $shiftLua.Replace("`r`n", "`n").TrimEnd("`n").Replace("`n", "`r`n")
  $routes = $routes.TrimEnd("`r", "`n") + "`r`n" + "`r`n$luaBegin`r`ndo`r`n$body`r`nend`r`n$luaEnd`r`n"
}
# ---- spawn spots: the spawn table replaced (routes file), and a hand-off list for each new route (GroundCrew.lua)
if ($Spawn -eq 'Spots') {
  if ($routes.Contains('CATCC_DECK_TEST BEGIN')) { throw 'deck-test.ps1 is applied to the same routes; run it with -Restore first.' }
  if ($Reroute -eq 'Routes' -or $Reroute -eq 'Both') { throw '-Spawn Spots replaces the spawn routes: it cannot be combined with -Reroute Routes / Both.' }
  $here = Split-Path -Parent $PSCommandPath
  $spotsLua = [IO.File]::ReadAllText((Join-Path $here 'director-spots.lua'), $enc)
  $body = $spotsLua.Replace("`r`n", "`n").TrimEnd("`n").Replace("`n", "`r`n")
  $routes = $routes.TrimEnd("`r", "`n") + "`r`n" + "`r`n$luaBegin`r`ndo`r`n$body`r`nend`r`n$luaEnd`r`n"
  $padLua = [IO.File]::ReadAllText((Join-Path $here 'director-spots-crew.lua'), $enc)
  $body = $padLua.Replace("`r`n", "`n").TrimEnd("`n").Replace("`n", "`r`n")
  $crewText = $crewText.TrimEnd("`r", "`n") + "`r`n" + "`r`n$luaBegin`r`ndo`r`n$body`r`nend`r`n$luaEnd`r`n"
}
# ---- crew: the crew test's block appended to GroundCrew.lua
if ($Crew -ne 'None') {
  $crewLua = [IO.File]::ReadAllText((Join-Path (Split-Path -Parent $PSCommandPath) 'crew-test\groundcrew-patch.lua'), $enc)
  $body = $crewLua.Replace("`r`n", "`n").TrimEnd("`n").Replace("`n", "`r`n")
  $crewText = $crewText.TrimEnd("`r", "`n") + "`r`n" + "`r`n$luaBegin`r`nlocal CATCC_CREW = '$($Crew.ToLower())'`r`ndo`r`n$body`r`nend`r`n$luaEnd`r`n"
}

# ---- write what changed. A file left with nothing of ours in it goes back to its backup byte for byte
# (taking a block out leaves exactly one line end at the end of the file, which may not be how it ended).
function Final([string]$f, [string]$text) {
  $b = "$f.catcc-dirtest-backup"
  if ((Test-Path $b) -and -not $text.Contains($mark)) {
    $orig = [IO.File]::ReadAllText($b, $enc)
    if ($orig.TrimEnd("`r", "`n") -eq $text.TrimEnd("`r", "`n")) { return $orig }
  }
  return $text
}
$changed = @()
$xml = Final $xmlFile $xml
$routes = Final $routesFile $routes
$crewText = Final $crewFile $crewText
if ($xml -ne $xml0) { Backup $xmlFile; [IO.File]::WriteAllText($xmlFile, $xml, $enc); $changed += 'takeoff_logic.xml' }
$common = Final $commonFile $common
if ($common -ne $common0) { Backup $commonFile; [IO.File]::WriteAllText($commonFile, $common, $enc); $changed += 'common.xml' }
if ($routes -ne $routes0) { Backup $routesFile; [IO.File]::WriteAllText($routesFile, $routes, $enc); $changed += 'USS_Nimitz_RunwaysAndRoutes.lua' }
foreach ($f in $trajFiles) {
  $traj[$f] = Final $f $traj[$f]
  if ($traj[$f] -ne $traj0[$f]) { Backup $f; [IO.File]::WriteAllText($f, $traj[$f], $enc); $changed += (Split-Path -Leaf $f) }
}
if ($crewText -ne $crewText0) { Backup $crewFile; [IO.File]::WriteAllText($crewFile, $crewText, $enc); $changed += 'GroundCrew.lua' }

if ($Revert) { $what = 'Reverted' } else { $what = "Applied (hold: $Hold, reroute: $Reroute, spawn: $Spawn, crew: $Crew)" }
if ($changed.Count -eq 0) { Write-Host "$what - nothing needed changing." } else { Write-Host "$what - changed: $($changed -join ', ')" }
if (-not $Revert) {
  if ($Hold -eq 'Freeze') { Write-Host 'Hold Freeze: watch the yellow shirts from the moment you spawn (do they walk to stations?), then taxi: does the next one take over?' }
  if ($Hold -eq 'Pause') { Write-Host 'Hold Pause: cold start one aircraft and ask for taxi; also land and let the deck crew park you. Note when "CATCC test: director task" shows and what the director does for the 20 s.' }
  if ($Hold -eq 'Gate') { Write-Host 'Hold Gate: hosted session, pilot mod installed, room running. Taxi with the AIR BOSS seat held (directors should hold), then leave the seat (they should carry on).' }
  if ($Reroute -ne 'None') { Write-Host 'Reroute: one client aircraft, cold start, empty deck. Watch whether the directors bring you along a 5 m bend to your left halfway to the catapult, or along the old line.' }
  if ($Spawn -eq 'Shift') { Write-Host 'Spawn Shift: F10 > CATCC route lines > "My spot: stock + moved spawn". You should sit on the blue line, 8 m (or less) along from the yellow X. Then salute: do the yellow shirts pick you up?' }
  if ($Spawn -eq 'Spots') { Write-Host 'Spawn Spots: the 40 deck spots of the spotting plan are DCS''s spawn spots now (deck crew option OFF). In the mission editor: how many aircraft can start from the deck? In the mission: F10 > CATCC crew test > Our crew > Marshal me to catapult N names the spot you are on.' }
  if ($CatGate) { Write-Host 'Cat gate: a catapult crew that has cleared its catapult now returns only while operation is allowed. F10 > CATCC crew test > Catapult crews > Catapult N > Close it: they should walk off and stay off; Open it: they return.' }
  if ($Crew -eq 'Draw' -or $Crew -eq 'Full') { Write-Host 'Crew: look for debug drawing around the deck crew (lines, labels, goals).' }
  if ($Crew -eq 'People' -or $Crew -eq 'Full' -or $Crew -eq 'Extra' -or $Crew -eq 'Model') { Write-Host 'Crew people: a green shirt of ours should stand 14 m forward / 27 m to starboard (between spawn spots 1 and 5). Then F10 > CATCC crew test.' }
  if ($Crew -eq 'Model') { Write-Host 'Crew model: Extra (yellow shirts), plus catcc-m0 (the plane captain, a brown shirt) and catcc-t0 (the tow tractor''s driver, a blue shirt), 12 m forward / 31 and 33 m to starboard.' }
  if ($Crew -eq 'Extra' -or $Crew -eq 'Model') { Write-Host 'Crew extra: four people of ours (catcc-c0 .. catcc-c3) are in catapult crew 1''s list; they exist with the deck crew option OFF too. The "at mission start" message names them under "People of ours:". If DCS dies loading the mission, run this again with -Crew Full.' }
}
