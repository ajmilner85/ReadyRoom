# CATCC deck spawn test: moves every Supercarrier (CVN-71..75) deck spawn spot to the bow, facing the stern.
#
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\deck-test.ps1           # apply
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\deck-test.ps1 -Restore  # undo
#
# Close DCS first. Asks for admin (the file is under Program Files).
# How it works: appends a Lua block to CoreMods\tech\USS_Nimitz\scripts\USS_Nimitz_RunwaysAndRoutes.lua that
# rewrites GT.TaxiForTORoutes after ED defines it. A spawn spot is the first point of its route, and the spawn
# heading is the direction to the second point, so: point 1 = bow, point 2 = 15 m aft of it (= facing the stern),
# then the route's original last point (the catapult) so AI routing still has an end.
# All 16 spots are moved because we don't know which spot DCS hands the first client; test with ONE client
# aircraft and nothing else parked on the deck.
# A DCS update or repair puts the original file back. Single player / local only: a modified core file can fail
# a server's integrity check.

param([switch]$Restore, [string]$DcsDir = 'C:\Program Files\Eagle Dynamics\DCS World')

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $argList = @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-DcsDir', "`"$DcsDir`"")
    if ($Restore) { $argList += '-Restore' }
    Start-Process powershell -Verb RunAs -ArgumentList $argList
    return
}

$file = Join-Path $DcsDir 'CoreMods\tech\USS_Nimitz\scripts\USS_Nimitz_RunwaysAndRoutes.lua'
$backup = "$file.catcc-backup"
$begin = '-- CATCC_DECK_TEST BEGIN'
$end = '-- CATCC_DECK_TEST END'

if (-not (Test-Path $file)) { Write-Host "Not found: $file"; return }
if (Get-Process -Name DCS -ErrorAction SilentlyContinue) { Write-Host 'DCS is running. Close it and run this again.'; return }

$text = [IO.File]::ReadAllText($file)
$hasBlock = $text.Contains($begin)

if ($Restore) {
    if (-not $hasBlock) { Write-Host 'Nothing to undo: the test block is not in the file.'; return }
    $i = $text.IndexOf($begin)
    $j = $text.IndexOf($end) + $end.Length
    $clean = $text.Substring(0, $i).TrimEnd("`r", "`n") + "`r`n" + $text.Substring($j).TrimStart("`r", "`n")
    [IO.File]::WriteAllText($file, $clean, (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Restored: test block removed.'
    return
}

if ($hasBlock) { Write-Host 'Already applied. Run with -Restore to undo.'; return }
if (-not (Test-Path $backup)) { Copy-Item $file $backup; Write-Host "Backup: $backup" }

# Ship coordinates, metres: x forward (bow +), y up (20.1494 = flight deck, ED's value), z to starboard.
# x 148 on the centreline sits between the cat 1 and cat 2 tracks (about 8 m either side); with the nose aft
# a Hornet's tail ends ~8.5 m further forward, still ~10 m short of the bow edge (x ~168).
$block = @"

$begin
do
	local BOW_X, AFT_X, Z, DECK_Y = 148.0, 133.0, 0.2, 20.1494
	for _, r in ipairs(GT.TaxiForTORoutes) do
		local last = r.Points[#r.Points]
		r.Points = {
			{{ BOW_X, DECK_Y, Z }, 1.0, 20.0},
			{{ AFT_X, DECK_Y, Z }, 1.0},
			last,
		}
	end
end
$end
"@

[IO.File]::AppendAllText($file, $block.Replace("`r`n", "`n").Replace("`n", "`r`n"), (New-Object Text.UTF8Encoding($false)))
Write-Host 'Applied. Start DCS, cold or hot start ONE client aircraft on a CVN-71..75, nothing else on deck.'
Write-Host 'Expected: you spawn on the bow centreline between cats 1 and 2, nose pointing at the stern.'
