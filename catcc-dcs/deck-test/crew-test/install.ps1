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
#   Scripts\CATCC\bin\catcc_crew.dll         the native module (source and self-test: native\)
#   Config\CATCC-test.lua                    crewTest = true (other test switches there are kept)
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
  [switch]$NoDcsCheck
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
  @{ from = Join-Path $here 'bin\catcc_crew.dll'; to = Join-Path $binDst 'catcc_crew.dll' }
)

# The test mod (Mods\tech\CATCC-Crew): an animations path and a models path of our own. Its one clip,
# animations\typeV\catcc_test_clip.fbx, is a copy under our own name of the F/A-18C pilot figure's salute
# (DCS's file, taken from this PC's DCS: not kept in our repository).
$modSrc = Join-Path $here 'Mods\tech\CATCC-Crew'
$modDst = Join-Path $SavedGames 'Mods\tech\CATCC-Crew'
$clipSrc = Join-Path $DcsDir 'CoreMods\aircraft\FA-18C\animations\animations\typeV\F18_520_Salut_L.fbx'

if ($Uninstall) {
  if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst; Write-Host "Removed $modDst" }
  foreach ($f in $files) { if (Test-Path $f.to) { Remove-Item $f.to; Write-Host "Removed $($f.to)" } }
  if ((Test-Path $binDst) -and -not (Get-ChildItem $binDst)) { Remove-Item $binDst }
  if ($flags.Contains('crewTest')) { $flags.Remove('crewTest'); Write-Config }
  Write-Host 'Crew test uninstalled. (The data side: director-test.ps1 -Revert.)'
  return
}

foreach ($f in $files) { if (-not (Test-Path $f.from)) { throw "Missing: $($f.from)$(if ($f.from -like '*.dll') { ' (build it: native\build.cmd)' })" } }
# the module must be newer than its source: a stale DLL would test something else than the code says
$dll = Get-Item (Join-Path $here 'bin\catcc_crew.dll')
$srcNewest = (Get-ChildItem (Join-Path $here 'native') -Filter *.cpp | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
if ($dll.LastWriteTime -lt $srcNewest) { throw 'bin\catcc_crew.dll is older than native\*.cpp: run native\build.cmd first.' }

foreach ($f in $files) {
  New-Item -ItemType Directory -Force (Split-Path $f.to) | Out-Null
  Copy-Item $f.from $f.to -Force
  Write-Host "Installed: $($f.to)"
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
$flags['crewTest'] = 'true'
Write-Config
Write-Host 'Installed. Start DCS, load the mission: F10 > CATCC crew test. Results: on screen and Logs\catcc-crewtest.log.'
