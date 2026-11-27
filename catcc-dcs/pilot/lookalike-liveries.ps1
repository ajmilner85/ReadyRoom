# CATCC lookalike Hornet: its own liveries (the type CATCC_HornetLookF, Mods\tech\CATCC-Lookalike).
# For every Hornet livery folder in Saved Games\DCS\Liveries\FA-18C_hornet, one of the same name in
# Saved Games\DCS\Liveries\CATCC_HornetLookF whose description.lua is the Hornet livery's, with every texture the
# livery brings (fourth field false) pointing back at the Hornet livery's own file: no texture is copied. Textures
# from DCS itself (fourth field true) and everything else in the file stay as they are.
# pilot\install.ps1 runs it; on its own (DCS closed):
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\pilot\lookalike-liveries.ps1 [-SavedGames <folder>] [-Uninstall]
# Run it again after adding or renaming a Hornet livery.
param(
  [string]$SavedGames,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
if (-not $SavedGames) {
  foreach ($d in 'DCS', 'DCS.openbeta') {
    $p = Join-Path ([Environment]::GetFolderPath('UserProfile')) "Saved Games\$d"
    if (Test-Path $p) { $SavedGames = $p; break }
  }
}
if (-not $SavedGames -or -not (Test-Path $SavedGames)) { throw "Saved Games\DCS not found (pass -SavedGames)" }
$src = Join-Path $SavedGames 'Liveries\FA-18C_hornet'
$dst = Join-Path $SavedGames 'Liveries\CATCC_HornetLookF'
$enc = New-Object System.Text.UTF8Encoding($false)

if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
if ($Uninstall) { Write-Host "CATCC lookalike liveries removed."; exit 0 }
if (-not (Test-Path $src)) { Write-Host "No Hornet liveries in ${src}: the lookalike's own liveries were not made."; exit 0 }

# "<livery>/<texture>" with its ".." taken out: the texture's place under Liveries\FA-18C_hornet
function Resolve-Tex([string]$livery, [string]$tex) {
  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($s in ($livery + '/' + $tex) -split '[\\/]') {
    if ($s -eq '' -or $s -eq '.') { continue }
    if ($s -eq '..') { if ($parts.Count -gt 0) { $parts.RemoveAt($parts.Count - 1) }; continue }
    $parts.Add($s)
  }
  return ($parts -join '/')
}

$entry = [regex]'\{\s*"([^"]*)"\s*,\s*([^,{}]+?)\s*,\s*"([^"]*)"\s*,\s*(true|false)\s*\}'
$made = 0
foreach ($dir in Get-ChildItem $src -Directory) {
  $desc = Join-Path $dir.FullName 'description.lua'
  if (-not (Test-Path $desc)) { continue }
  $text = [System.IO.File]::ReadAllText($desc, $enc)
  $name = $dir.Name
  $out = $entry.Replace($text, [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    if ($m.Groups[4].Value -ne 'false') { return $m.Value }
    $to = '../../FA-18C_hornet/' + (Resolve-Tex $name $m.Groups[3].Value)
    return '{"' + $m.Groups[1].Value + '", ' + $m.Groups[2].Value + ', "' + $to + '", false}'
  })
  $outDir = Join-Path $dst $name
  New-Item -ItemType Directory -Force $outDir | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $outDir 'description.lua'), "-- CATCC lookalike: made from Liveries\FA-18C_hornet\$name by pilot\lookalike-liveries.ps1`n" + $out, $enc)
  $made++
}
Write-Host "CATCC lookalike liveries: $made made in $dst."
