# The crew test's line in Saved Games\DCS\Config\autoexec.cfg, for the slot picker (Scripts\CATCC\crewtest_slots.lua).
#
# DCS's own slot screen lives in DCS's GUI Lua state; the hooks of Saved Games run in a state of their own
# ("userhooks"). The picker reaches that screen with net.dostring_in('gui', ...), which DCS allows only when
# autoexec.cfg lists "userhooks" in net.allow_unsafe_api and "gui" in net.allow_dostring_in (API\Sim_ControlAPI.md).
# One line, marked "-- CATCC slot picker", adds both to whatever the file allows by then: nothing another mod
# allowed is taken away. It is kept last, so a line before it that sets either list outright cannot drop them.
# install.ps1 runs this (and -Uninstall with its own -Uninstall); on its own:
#   powershell -ExecutionPolicy Bypass -File catcc-dcs\deck-test\crew-test\autoexec.ps1 [-Uninstall] [-SavedGames <folder>]

param(
  [switch]$Uninstall,
  [string]$SavedGames = (Join-Path $env:USERPROFILE 'Saved Games\DCS')
)

$ErrorActionPreference = 'Stop'
$file = Join-Path $SavedGames 'Config\autoexec.cfg'
$mark = '-- CATCC slot picker'
$line = 'do local function allow(t, v) t = t or {} for _, x in ipairs(t) do if x == v then return t end end table.insert(t, v) return t end ' +
  'net.allow_unsafe_api = allow(net.allow_unsafe_api, "userhooks") net.allow_dostring_in = allow(net.allow_dostring_in, "gui") end ' +
  $mark + ': its hook reaches DCS''s slot screen (the GUI state)'
$enc = New-Object Text.UTF8Encoding($false)

$old = if (Test-Path $file) { [IO.File]::ReadAllText($file, $enc) } else { '' }
# the line taken out wherever it is (and put back at the end)
$text = [regex]::Replace($old, '(?m)^[^\r\n]*' + [regex]::Escape($mark) + '[^\r\n]*(\r?\n|$)', '')
if (-not $Uninstall) {
  $nl = if ($text.Contains("`r`n") -or -not $text.Contains("`n")) { "`r`n" } else { "`n" }
  if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += $nl }
  $text += $line + $nl
}
if ($text -ceq $old) {
  if (-not $Uninstall) { Write-Host "autoexec.cfg: the slot picker's line is in place: $file" }
  return
}
New-Item -ItemType Directory -Force (Split-Path $file) | Out-Null
[IO.File]::WriteAllText($file, $text, $enc)
if ($Uninstall) { Write-Host "autoexec.cfg: the slot picker's line taken out: $file" }
else { Write-Host "autoexec.cfg: the slot picker may reach DCS's slot screen (net.allow_dostring_in ""gui""): $file" }
