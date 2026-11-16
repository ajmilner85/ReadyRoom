# CATCC deck route lines: the Supercarrier's spawn-spot -> catapult routes drawn on the deck (TEST ONLY).
#
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\route-lines\install.ps1
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\route-lines\install.ps1 -Uninstall
#
# Everything goes under Saved Games (no admin): the CATCC-RouteLines mod (Mods\tech), the F10 script
# (Scripts\CATCC\routelines.lua), the CATCC hook that loads it (Scripts\CATCC\catcc.lua), and routeLines = true
# in Config\CATCC-test.lua (other test switches there are kept). Restart DCS afterwards: mods and hooks load
# at start. In a mission: F10 > CATCC route lines. Uninstall takes out the mod, the script and the switch
# (the hook stays: without the switch it does nothing more than before).
#
# Rebuild the data / models first if DCS's routes changed (an update):
#   node catcc-dcs\deck-test\route-lines\routes.mjs
#   set BLENDER_USER_SCRIPTS=C:\Users\ajmil\Tools\blender-user-scripts
#   blender.exe --background --factory-startup --python catcc-dcs\deck-test\route-lines\build_route_lines.py -- catcc-dcs\deck-test\route-lines\routes.json catcc-dcs\deck-test\route-lines\Mods\tech\CATCC-RouteLines\Shapes

param(
  [switch]$Uninstall,
  [string]$SavedGames = (Join-Path $env:USERPROFILE 'Saved Games\DCS')
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSCommandPath
$repoDcs = Resolve-Path (Join-Path $here '..\..')
if (-not (Test-Path $SavedGames)) { throw "Not found: $SavedGames (pass -SavedGames)" }

$modDst = Join-Path $SavedGames 'Mods\tech\CATCC-RouteLines'
$scriptsDst = Join-Path $SavedGames 'Scripts\CATCC'
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
  $text = "-- CATCC test switches (read by Scripts/CATCC/catcc.lua). Delete this file to turn tests off.`r`nreturn { $body }`r`n"
  New-Item -ItemType Directory -Force (Split-Path $cfgFile) | Out-Null
  [IO.File]::WriteAllText($cfgFile, $text, $enc)
  Write-Host "Config: $cfgFile -> { $body }"
}

if ($Uninstall) {
  if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst; Write-Host "Removed $modDst" }
  $rl = Join-Path $scriptsDst 'routelines.lua'
  if (Test-Path $rl) { Remove-Item $rl; Write-Host "Removed $rl" }
  if ($flags.Contains('routeLines')) { $flags.Remove('routeLines'); Write-Config }
  Write-Host 'Route lines uninstalled. Restart DCS.'
  return
}

$shapes = Get-ChildItem (Join-Path $here 'Mods\tech\CATCC-RouteLines\Shapes') -Filter *.edm
if ($shapes.Count -ne 48) { throw "Expected 48 models in Mods\tech\CATCC-RouteLines\Shapes, found $($shapes.Count): build them first (see the top of this file)" }

if (Test-Path $modDst) { Remove-Item -Recurse -Force $modDst }
Copy-Item -Recurse (Join-Path $here 'Mods\tech\CATCC-RouteLines') $modDst
Write-Host "Mod: $modDst ($($shapes.Count) models)"

New-Item -ItemType Directory -Force $scriptsDst | Out-Null
foreach ($f in 'routelines.lua', 'catcc.lua') {
  Copy-Item (Join-Path $repoDcs "Scripts\CATCC\$f") (Join-Path $scriptsDst $f) -Force
  Write-Host "Script: $(Join-Path $scriptsDst $f)"
}

$flags['routeLines'] = 'true'
Write-Config
Write-Host 'Installed. Restart DCS, start the mission, then F10 > CATCC route lines.'
