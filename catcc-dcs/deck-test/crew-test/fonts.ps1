# The CATCC app's fonts for the slot picker's window (Scripts\CATCC\crewtest_slots.dlg): Saira (its controls) and
# IBM Plex Mono (its data), unchanged, from catcc-dcs\fonts (SIL Open Font License: OFL-*.txt there). DCS's window
# toolkit loads a skin's font by file name from DCS's own folder, DCS World\dxgui\skins\fonts, and from nowhere else
# (every skin of DCS and its modules names its font so), so they are copied there, each named CATCC-<font>.ttf so that
# none of DCS's own is ever overwritten. The user's choice, 2026-11-20 (asked: copy into DCS's folder, a path, or
# captions as pictures). DCS's folder needs admin: this asks for it (one UAC prompt) only when it cannot write there.
# A DCS update or repair may take them away: run install.ps1 (or this) again. install.ps1 runs this; on its own:
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\crew-test\fonts.ps1 [-Uninstall] [-DcsDir <DCS World>]

param(
  [switch]$Uninstall,
  [string]$DcsDir = 'C:\Program Files\Eagle Dynamics\DCS World',
  # (set when this has started itself elevated)
  [switch]$Elevated
)

$ErrorActionPreference = 'Stop'
$src = Resolve-Path (Join-Path (Split-Path -Parent $PSCommandPath) '..\..\fonts')
$dst = Join-Path $DcsDir 'dxgui\skins\fonts'
if (-not (Test-Path $dst)) { throw "Not found: $dst (pass -DcsDir)" }
$fonts = Get-ChildItem $src -Filter 'CATCC-*.ttf'

# what is to be done: the fonts missing or different there (installing), or ours there (uninstalling)
function Get-Todo {
  if ($Uninstall) { return @(Get-ChildItem $dst -Filter 'CATCC-*.ttf' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) }
  return @($fonts | Where-Object {
      $there = Join-Path $dst $_.Name
      -not (Test-Path $there) -or (Get-FileHash $there).Hash -ne (Get-FileHash $_.FullName).Hash
    } | ForEach-Object { $_.Name })
}

$todo = Get-Todo
if ($todo.Count -eq 0) {
  if (-not $Uninstall) { Write-Host "Fonts: in place in $dst" }
  return
}
function Test-Writable {
  try {
    $t = Join-Path $dst ('.catcc-' + [guid]::NewGuid().ToString('N') + '.tmp')
    [IO.File]::WriteAllText($t, '')
    Remove-Item $t -Force
    return $true
  } catch { return $false }
}
if (Test-Writable) {
  foreach ($n in $todo) {
    if ($Uninstall) { Remove-Item (Join-Path $dst $n) -Force } else { Copy-Item (Join-Path $src $n) (Join-Path $dst $n) -Force }
  }
} else {
  if ($Elevated) { throw "Fonts: cannot write to $dst even as admin" }
  Write-Host 'Fonts: DCS''s folder needs admin: asking (UAC) ...'
  $args2 = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-DcsDir', "`"$DcsDir`"", '-Elevated')
  if ($Uninstall) { $args2 += '-Uninstall' }
  $p = Start-Process powershell -Verb RunAs -ArgumentList $args2 -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Fonts: the elevated copy failed (exit $($p.ExitCode))" }
}
$left = Get-Todo
if ($left.Count -gt 0) { throw "Fonts: not done in ${dst}: $($left -join ', ')" }
Write-Host "Fonts: $(if ($Uninstall) { 'taken out of' } else { 'copied to' }) ${dst}: $($todo -join ', ')"
