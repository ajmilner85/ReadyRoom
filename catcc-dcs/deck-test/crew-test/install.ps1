# CATCC crew test: can our code see and command the Supercarrier's deck crew characters? (TEST ONLY)
#
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\crew-test\install.ps1
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\crew-test\install.ps1 -Uninstall
#
# Everything goes under Saved Games (no admin). Close DCS first (hooks and the module load when DCS starts,
# and a loaded module can't be replaced):
#   Scripts\Hooks\CATCC-crewtest-hook.lua    the loader
#   Scripts\CATCC\crewtest_hook.lua          the hook: takes the F10 commands, calls the module, reports
#   Scripts\CATCC\crewtest.lua               the F10 menu (installed into each mission by the hook)
#   Scripts\CATCC\crewtest_routes.lua        taxi routes from PriFly's taxi network (made by crew-test\routes.gen.ts)
#   Scripts\CATCC\crewtest_ui.lua, .dlg     the in-game panel (Ctrl+Shift+F10 in a mission): the deck spotting tool
#                                            with click-to-lock, and the F10 menu's items as buttons
#   Scripts\CATCC\crewtest_flag.lua          the panel's "Flag" page: a folded flag (the mod's CATCC_Flag) on the
#                                            glareshield of the player's jet or of selected aircraft
#   Scripts\CATCC\crewtest_demo.lua          the deck spotting demo (Ctrl+Shift+F9 in a mission, or F10 > CATCC demo)
#   Scripts\CATCC\crewtest_worker.lua        the demo's own thread: run by the native module in a Lua state of its own
#                                            (it loads the hook and the demo there; the hook on DCS's thread sends it the
#                                            frames and applies what it asks for). To run the demo on DCS's main thread
#                                            instead: install.ps1 -DemoThread off (it writes demoThread = false
#                                            into Config\CATCC-test.lua; -DemoThread on takes it out again)
#   Scripts\CATCC\crewtest_hangar.lua        the hangar's parking plan for it (made by deck-test\hangar\hangar_plan.py)
#   Scripts\CATCC\crewtest_head.lua          where a tractor's driver looks (DRIVER-HEAD.md). His head only turns when
#                                            the mod has the poses and the blend space for it: install.ps1 -DriverHead on
#                                            (made here by model\driver_head.py from the F/A-18C pilot figure's own
#                                            look-round clip in this PC's DCS; needs python; writes driverHead = true
#                                            into Config\CATCC-test.lua so that later installs make them again;
#                                            -DriverHead off takes them out; not given: left as it is)
#   (no script of its own)                   the drivers' limbs (DRIVER-POSE.md): install.ps1 -DriverPose on makes the
#                                            seated pose catcc_drv_seat.fbx (feet at the tractor's pedals, hands on its
#                                            steering wheel: model\driver_pose.py, from the same clip) and keys the same
#                                            limbs into the head poses; writes driverPose = true into
#                                            Config\CATCC-test.lua; -DriverPose off: the pilot's own limbs again
#   Scripts\CATCC\crewtest_cockpit.lua       the demo's brake riders: brown shirts in the cockpit of an aircraft being
#                                            towed (BRAKE-RIDER.md). Their poses (hands on the windscreen arch's grab
#                                            handles, the head free to turn) are made at every install by
#                                            model\rider_pose.py from the same clip (needs python); without them a rider
#                                            sits in the pilot's own pose
#   Scripts\Hooks\CATCC-logs-hook.lua,       CATCC's live logs: this PC's dcs.log and catcc-*.log sent to SDOBot while
#     Scripts\CATCC\catcc_logs.lua,          DCS runs (kept in Supabase: scripts\catcc\catcc-logs.mjs reads them), with
#     Config\CATCC-logs.lua                  its settings from catcc-dcs\Config\CATCC-logs.lua (private: SDOBot's
#                                            token; scripts\catcc\catcc-logs-setup.ps1 writes it). Without it: nothing sent
#   Scripts\CATCC\bin\catcc_crew.dll         the native module (source and self-test: native\)
#   Scripts\CATCC\bin\catcc_atcprobe.dll     the slot picker's spawn aiming (aim, restore, check): the ATC probe's module,
#                                            ..\spawn-probe\native (build it with its build.cmd)
#   Config\CATCC-test.lua                    crewTest = true (other test switches there are kept)
#   Config\autoexec.cfg                      one line, marked "-- CATCC slot picker" (by autoexec.ps1): adds "userhooks"
#                                            to net.allow_unsafe_api and "gui" to net.allow_dostring_in, keeping what
#                                            the file allows already, so the slot picker can put DCS's slot screen away
#   Scripts\CATCC\crewtest_slots.lua, .dlg, catcc_deck.png, jets\*.png   the slot picker (its deck picture and PriFly's
#                                            folded-wing Hornet, one picture per colour, turned by the picker:
#                                            scripts/catcc/deck-picture.tsx)
#   DCS World\dxgui\skins\fonts\CATCC-*.ttf  the CATCC app's fonts for the picker (fonts.ps1; DCS's folder: one UAC
#                                            prompt, only when they are missing or changed; -NoFonts leaves them)
# Results: on screen, and Saved Games\DCS\Logs\catcc-crewtest.log.
#
# The data side of the test (DCS's own files, needs admin) is separate:
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\director-test.ps1 -Crew Full
#
# Rebuild the module after changing native\catcc_crew.cpp:  catcc-dcs\deck-test\crew-test\native\build.cmd
# (it runs the self-test first and builds the DLL only if that passes).

param(
  [switch]$Uninstall,
  [string]$SavedGames = (Join-Path $env:USERPROFILE 'Saved Games\DCS'),
  # where the test mod's animation clip is copied from (one of the F/A-18C pilot figure's own, plain FBX files)
  [string]$DcsDir = 'C:\Program Files\Eagle Dynamics\DCS World',
  # testing against a folder that is not DCS's (skips the DCS-running check)
  [switch]$NoDcsCheck,
  # the deck spotting demo: 'off' = on DCS's main thread, as before it had a thread of its own (writes
  # demoThread = false into Config\CATCC-test.lua); 'on' = on its own thread again (takes that line out);
  # not given: left as it is
  [ValidateSet('', 'on', 'off')][string]$DemoThread = '',
  # the tractor drivers' head (DRIVER-HEAD.md): 'on' = the poses and the blend space that turn it are made into the
  # test mod (and driverHead = true written into Config\CATCC-test.lua: made again by later installs); 'off' = not
  # made (the line taken out): the drivers sit in the plain seated pose; not given: left as it is. Off until asked for.
  [ValidateSet('', 'on', 'off')][string]$DriverHead = '',
  # the tractor drivers' limbs (DRIVER-POSE.md): 'on' = a seated pose of our own is made into the test mod, its legs
  # and arms keyed to the tractor's pedals and steering wheel, and the head poses (-DriverHead) are made with the
  # same limbs (driverPose = true written into Config\CATCC-test.lua: made again by later installs); 'off' = not made
  # (the line taken out): the pilot's own limbs; not given: left as it is. Off until asked for. A switch of its own:
  # the heads have been seen to turn well in DCS, the limbs have not been seen yet, and each can be taken out alone.
  [ValidateSet('', 'on', 'off')][string]$DriverPose = '',
  # the slot picker's fonts (fonts.ps1: into DCS's own folder, one UAC prompt) left alone
  [switch]$NoFonts
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSCommandPath
$repoDcs = Resolve-Path (Join-Path $here '..\..')
if (-not (Test-Path $SavedGames)) { throw "Not found: $SavedGames (pass -SavedGames)" }
if (-not $NoDcsCheck -and (Get-Process -Name DCS -ErrorAction SilentlyContinue)) { Write-Host 'DCS is running. Close it and run this again.'; return }

$hooksDst = Join-Path $SavedGames 'Scripts\Hooks'
$scriptsDst = Join-Path $SavedGames 'Scripts\CATCC'
$binDst = Join-Path $scriptsDst 'bin'
$cfgFile = Join-Path $SavedGames 'Config\CATCC-test.lua'
$enc = New-Object Text.UTF8Encoding($false)

# Config\CATCC-test.lua: the switches it has now (only plain "name = true/false" entries are kept)
$flags = [ordered]@{}
if (Test-Path $cfgFile) {
  foreach ($m in [regex]::Matches([IO.File]::ReadAllText($cfgFile), '(\w+)\s*=\s*(true|false)')) { $flags[$m.Groups[1].Value] = $m.Groups[2].Value }
}
function Write-Config {
  if ($flags.Count -eq 0) {
    if (Test-Path $cfgFile) { Remove-Item $cfgFile; Write-Host "Removed $cfgFile (no test switches left)" }
    return
  }
  $body = ($flags.Keys | ForEach-Object { "$_ = $($flags[$_])" }) -join ', '
  $text = "-- CATCC test switches (read by Scripts/CATCC/catcc.lua and the test hooks). Delete this file to turn tests off.`r`nreturn { $body }`r`n"
  New-Item -ItemType Directory -Force (Split-Path $cfgFile) | Out-Null
  [IO.File]::WriteAllText($cfgFile, $text, $enc)
  Write-Host "Config: $cfgFile -> { $body }"
}

$files = @(
  @{ from = Join-Path $repoDcs 'Scripts\Hooks\CATCC-crewtest-hook.lua'; to = Join-Path $hooksDst 'CATCC-crewtest-hook.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_hook.lua'; to = Join-Path $scriptsDst 'crewtest_hook.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest.lua'; to = Join-Path $scriptsDst 'crewtest.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_routes.lua'; to = Join-Path $scriptsDst 'crewtest_routes.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_ui.lua'; to = Join-Path $scriptsDst 'crewtest_ui.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_ui.dlg'; to = Join-Path $scriptsDst 'crewtest_ui.dlg' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_ui_mark.dlg'; to = Join-Path $scriptsDst 'crewtest_ui_mark.dlg' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_flag.lua'; to = Join-Path $scriptsDst 'crewtest_flag.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_demo.lua'; to = Join-Path $scriptsDst 'crewtest_demo.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_worker.lua'; to = Join-Path $scriptsDst 'crewtest_worker.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_hangar.lua'; to = Join-Path $scriptsDst 'crewtest_hangar.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_head.lua'; to = Join-Path $scriptsDst 'crewtest_head.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_cockpit.lua'; to = Join-Path $scriptsDst 'crewtest_cockpit.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_slots.lua'; to = Join-Path $scriptsDst 'crewtest_slots.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\crewtest_slots.dlg'; to = Join-Path $scriptsDst 'crewtest_slots.dlg' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\catcc_deck.png'; to = Join-Path $scriptsDst 'catcc_deck.png' },
  @{ from = Join-Path $here 'bin\catcc_crew.dll'; to = Join-Path $binDst 'catcc_crew.dll' },
  # (the slot picker's spawn aiming: aim / restore / check, from the ATC probe's module: deck-test\spawn-probe\native)
  @{ from = Join-Path $here '..\spawn-probe\bin\catcc_atcprobe.dll'; to = Join-Path $binDst 'catcc_atcprobe.dll' },
  # (CATCC's live logs: this PC's DCS and CATCC logs sent to SDOBot while DCS runs, when Config\CATCC-logs.lua is there)
  @{ from = Join-Path $repoDcs 'Scripts\Hooks\CATCC-logs-hook.lua'; to = Join-Path $hooksDst 'CATCC-logs-hook.lua' },
  @{ from = Join-Path $repoDcs 'Scripts\CATCC\catcc_logs.lua'; to = Join-Path $scriptsDst 'catcc_logs.lua' }
)
# the live logs' settings (the addresses and SDOBot's token): catcc-dcs\Config\CATCC-logs.lua, private, written by
# scripts\catcc\catcc-logs-setup.ps1; without it nothing is sent. What they sent is kept in Logs\catcc-logs-sent.lua.
$logsCfgSrc = Join-Path $repoDcs 'Config\CATCC-logs.lua'
$logsCfgDst = Join-Path $SavedGames 'Config\CATCC-logs.lua'
$logsSent = Join-Path $SavedGames 'Logs\catcc-logs-sent.lua'

# The test mod (Mods\tech\CATCC-Crew): an animations path and a models path of our own. Its one clip,
# animations\typeV\catcc_test_clip.fbx, is a copy under our own name of the F/A-18C pilot figure's salute
# (DCS's file, taken from this PC's DCS: not kept in our repository).
$modSrc = Join-Path $here 'Mods\tech\CATCC-Crew'
$modDst = Join-Path $SavedGames 'Mods\tech\CATCC-Crew'
$clipSrc = Join-Path $DcsDir 'CoreMods\aircraft\FA-18C\animations\animations\typeV\F18_520_Salut_L.fbx'

if ($Uninstall) {
  if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst; Write-Host "Removed $modDst" }
  foreach ($f in $files) { if (Test-Path $f.to) { Remove-Item $f.to; Write-Host "Removed $($f.to)" } }
  foreach ($f in $logsCfgDst, $logsSent) { if (Test-Path $f) { Remove-Item $f; Write-Host "Removed $f" } }
  if ((Test-Path $binDst) -and -not (Get-ChildItem $binDst)) { Remove-Item $binDst }
  if ($flags.Contains('demoThread')) { $flags.Remove('demoThread') }
  if ($flags.Contains('driverHead')) { $flags.Remove('driverHead') }
  if ($flags.Contains('driverPose')) { $flags.Remove('driverPose') }
  if ($flags.Contains('crewTest')) { $flags.Remove('crewTest') }
  Write-Config
  & (Join-Path $here 'autoexec.ps1') -Uninstall -SavedGames $SavedGames
  $jetsDst = Join-Path $scriptsDst 'jets'
  if (Test-Path $jetsDst) { Remove-Item -Recurse -Force $jetsDst; Write-Host "Removed $jetsDst" }
  if (-not $NoFonts) { & (Join-Path $here 'fonts.ps1') -Uninstall -DcsDir $DcsDir }
  Write-Host 'Crew test uninstalled. (The data side: director-test.ps1 -Revert.)'
  return
}

foreach ($f in $files) { if (-not (Test-Path $f.from)) { throw "Missing: $($f.from)$(if ($f.from -like '*atcprobe.dll') { ' (build it: ..\spawn-probe\native\build.cmd)' } elseif ($f.from -like '*.dll') { ' (build it: native\build.cmd)' })" } }
# the module must be newer than its source: a stale DLL would test something else than the code says
$dll = Get-Item (Join-Path $here 'bin\catcc_crew.dll')
$srcNewest = (Get-ChildItem (Join-Path $here 'native') -Filter *.cpp | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
if ($dll.LastWriteTime -lt $srcNewest) { throw 'bin\catcc_crew.dll is older than native\*.cpp: run native\build.cmd first.' }
$aimDll = Get-Item (Join-Path $here '..\spawn-probe\bin\catcc_atcprobe.dll')
$aimSrc = (Get-ChildItem (Join-Path $here '..\spawn-probe\native') -Filter *.cpp | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
if ($aimDll.LastWriteTime -lt $aimSrc) { throw '..\spawn-probe\bin\catcc_atcprobe.dll is older than its source: run ..\spawn-probe\native\build.cmd first.' }

foreach ($f in $files) {
  New-Item -ItemType Directory -Force (Split-Path $f.to) | Out-Null
  Copy-Item $f.from $f.to -Force
  Write-Host "Installed: $($f.to)"
}
if (Test-Path $logsCfgSrc) {
  New-Item -ItemType Directory -Force (Split-Path $logsCfgDst) | Out-Null
  Copy-Item $logsCfgSrc $logsCfgDst -Force
  Write-Host "Installed: $logsCfgDst (live logs: this PC's logs go to SDOBot while DCS runs)"
} elseif (Test-Path $logsCfgDst) {
  Write-Host "Live logs: $logsCfgDst kept as it is (no catcc-dcs\Config\CATCC-logs.lua here)"
} else {
  Write-Host 'Live logs: off (no catcc-dcs\Config\CATCC-logs.lua: scripts\catcc\catcc-logs-setup.ps1 writes it)'
}
if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst }
Copy-Item -Recurse $modSrc $modDst
if (Test-Path $clipSrc) {
  $clipDir = Join-Path $modDst 'animations\typeV'
  New-Item -ItemType Directory -Force $clipDir | Out-Null
  Copy-Item $clipSrc (Join-Path $clipDir 'catcc_test_clip.fbx') -Force
  Write-Host "Installed: $modDst (with animations\typeV\catcc_test_clip.fbx)"
} else {
  Write-Host "Installed: $modDst WITHOUT its animation clip: not found: $clipSrc (pass -DcsDir)"
}
# The tractor drivers' head (DRIVER-HEAD.md): five still poses and a blend space over them, made by model\driver_head.py
# from the F/A-18C pilot figure's look-round clip (DCS's file, from this PC's DCS: not kept in our repository) into the
# mod's animations\typeV. Without them a driver sits in the plain seated pose and the hook's head code does nothing.
if ($DriverHead -eq 'on') { $flags['driverHead'] = 'true' }
elseif ($DriverHead -eq 'off' -and $flags.Contains('driverHead')) { $flags.Remove('driverHead') }
# The drivers' limbs (DRIVER-POSE.md): with driverPose the head poses are made with the legs and arms keyed to the
# tractor's pedals and steering wheel (driver_head.py --pose), and the plain seated pose with the same limbs is made
# too (below).
if ($DriverPose -eq 'on') { $flags['driverPose'] = 'true' }
elseif ($DriverPose -eq 'off' -and $flags.Contains('driverPose')) { $flags.Remove('driverPose') }
$headDir = Join-Path $modDst 'animations\typeV'
$python = Get-Command python -ErrorAction SilentlyContinue
if ($flags['driverHead'] -eq 'true') {
  if (-not $python) {
    Write-Host 'The drivers'' head: NOT made: python was not found (the drivers sit in the plain seated pose).'
  } else {
    $headArgs = @((Join-Path $here 'model\driver_head.py'), $headDir, '--dcs', $DcsDir)
    if ($flags['driverPose'] -eq 'true') { $headArgs += '--pose' }
    $said = & $python.Source -I @headArgs
    if ($LASTEXITCODE -eq 0) {
      Write-Host "The drivers' head: $(@($said)[0])"
    } else {
      # (nothing half made is left: a blend space that names a pose that is not there must not reach DCS)
      Get-ChildItem $headDir -Filter 'catcc_drv_look_*.fbx' -ErrorAction SilentlyContinue | Remove-Item -Force
      $spaceDir = Join-Path $headDir 'blend_space'
      if (Test-Path $spaceDir) { Remove-Item -Recurse -Force $spaceDir }
      Write-Host "The drivers' head: NOT made (the drivers sit in the plain seated pose): $(@($said) -join ' ')"
    }
  }
}
if ($flags['driverPose'] -eq 'true') {
  if (-not $python) {
    Write-Host 'The drivers'' limbs: NOT made: python was not found (the drivers sit in the pilot''s pose).'
  } else {
    $said = & $python.Source -I (Join-Path $here 'model\driver_pose.py') $headDir --dcs $DcsDir
    if ($LASTEXITCODE -eq 0) {
      Write-Host "The drivers' limbs: $(@($said)[0])"
    } else {
      $seatFile = Join-Path $headDir 'catcc_drv_seat.fbx'
      if (Test-Path $seatFile) { Remove-Item -Force $seatFile }
      Write-Host "The drivers' limbs: NOT made (the drivers sit in the pilot's pose): $(@($said) -join ' ')"
    }
  }
}
# The brake riders' poses (BRAKE-RIDER.md): five head poses, the plain one and a blend space over the five, made by
# model\rider_pose.py from the same clip as the drivers' head, at every install (no switch: the demo always has riders).
if (-not $python) {
  Write-Host 'The brake riders'' poses: NOT made: python was not found (the riders sit in the pilot''s pose).'
} else {
  $said = & $python.Source -I (Join-Path $here 'model\rider_pose.py') $headDir --dcs $DcsDir
  if ($LASTEXITCODE -eq 0) {
    Write-Host "The brake riders' poses: $(@($said)[0])"
  } else {
    # (nothing half made: a blend space that names a pose that is not there must not reach DCS)
    Get-ChildItem $headDir -Filter 'catcc_rdr_*.fbx' -ErrorAction SilentlyContinue | Remove-Item -Force
    $riderSpace = Join-Path $headDir 'blend_space\catcc_bs_rdr_look.lua'
    if (Test-Path $riderSpace) { Remove-Item -Force $riderSpace }
    Write-Host "The brake riders' poses: NOT made (the riders sit in the pilot's pose): $(@($said) -join ' ')"
  }
}
$flags['crewTest'] = 'true'
if ($DemoThread -eq 'off') { $flags['demoThread'] = 'false' }
elseif ($DemoThread -eq 'on' -and $flags.Contains('demoThread')) { $flags.Remove('demoThread') }
Write-Config
& (Join-Path $here 'autoexec.ps1') -SavedGames $SavedGames
# the slot picker's aircraft (PriFly's folded-wing Hornet, every 5 degrees: scripts/catcc/deck-picture.tsx)
$jetsSrc = Join-Path $repoDcs 'Scripts\CATCC\jets'
$jetsDst = Join-Path $scriptsDst 'jets'
if (Test-Path $jetsDst) { Remove-Item -Recurse -Force $jetsDst }
Copy-Item -Recurse $jetsSrc $jetsDst
Write-Host "Installed: $jetsDst ($((Get-ChildItem $jetsDst -Filter *.png).Count) pictures)"
if (-not $NoFonts) { & (Join-Path $here 'fonts.ps1') -DcsDir $DcsDir }
Write-Host "The deck spotting demo runs $(if ($flags['demoThread'] -eq 'false') { 'on DCS''s main thread (demoThread = false; -DemoThread on puts it back on its own)' } else { 'on a thread of its own (-DemoThread off puts it back on DCS''s main thread)' })."
Write-Host "The tractor drivers' heads $(if (Test-Path (Join-Path $modDst 'animations\typeV\blend_space\catcc_bs_drv_look.lua')) { 'turn (driverHead = true; -DriverHead off: the plain seated pose again)' } elseif ($flags['driverHead'] -eq 'true') { 'do NOT turn: the poses could not be made (above)' } else { 'do not turn (-DriverHead on makes the poses and the blend space for it: DRIVER-HEAD.md)' })."
Write-Host "The tractor drivers' limbs $(if (Test-Path (Join-Path $modDst 'animations\typeV\catcc_drv_seat.fbx')) { 'are at the pedals and the steering wheel (driverPose = true; -DriverPose off: the pilot''s own pose again)' } elseif ($flags['driverPose'] -eq 'true') { 'are NOT at the wheel: the pose could not be made (above)' } else { 'are the pilot''s (-DriverPose on puts feet at the pedals and hands on the steering wheel: DRIVER-POSE.md)' })."
Write-Host 'Installed. Start DCS, load the mission: F10 > CATCC crew test. Results: on screen and Logs\catcc-crewtest.log.'
