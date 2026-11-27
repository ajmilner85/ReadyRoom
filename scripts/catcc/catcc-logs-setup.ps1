# CATCC live logs: the token that DCS sessions send their logs to SDOBot with (catcc-dcs/Scripts/CATCC/catcc_logs.lua,
# SDOBot/routes/catccLogs.js). Prints no token.
#
#   powershell -ExecutionPolicy Bypass -File scripts\catcc\catcc-logs-setup.ps1         (once)
#   powershell -ExecutionPolicy Bypass -File scripts\catcc\catcc-logs-setup.ps1 -Fly    (also stages SDOBot's Fly secret)
#
# It writes catcc-dcs\Config\CATCC-logs.lua (gitignored; the crew test's installer and the USB builder take it to
# Saved Games\DCS\Config) with the addresses and the token, making a new token only when that file has none, and adds
# CATCC_LOG_TOKEN to .env.local when it is not there (the local backend reads it at its next start). With -Fly it runs
# "fly secrets set --stage" for SDOBot's app: the secret applies at the next deploy.
param(
  [string[]]$Urls = @('http://readyroom.fly.dev/api/catcc/logs', 'http://127.0.0.1:3001/api/catcc/logs'),
  [switch]$Fly
)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path (Split-Path -Parent $PSCommandPath) '..\..')
$cfgFile = Join-Path $root 'catcc-dcs\Config\CATCC-logs.lua'
$envFile = Join-Path $root '.env.local'
$enc = New-Object System.Text.UTF8Encoding($false)

foreach ($u in $Urls) { if ($u -notmatch '^http://') { throw "$u is not http:// (DCS's Lua has no TLS)" } }

$token = $null
if (Test-Path -LiteralPath $cfgFile) {
  $m = [regex]::Match([IO.File]::ReadAllText($cfgFile), "token\s*=\s*'([0-9a-f]{32,})'")
  if ($m.Success) { $token = $m.Groups[1].Value }
}
$made = -not $token
if ($made) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

$list = ($Urls | ForEach-Object { "    '$_'," }) -join "`n"
$text = "-- CATCC live logs (Scripts/CATCC/catcc_logs.lua): written by scripts/catcc/catcc-logs-setup.ps1. Private: holds`n" +
  "-- SDOBot's CATCC_LOG_TOKEN. The crew test's installer copies it to Saved Games\DCS\Config.`n" +
  "return {`n  urls = {`n$list`n  },`n  token = '$token',`n}`n"
[IO.File]::WriteAllText($cfgFile, $text, $enc)
Write-Host "$cfgFile written ($(if ($made) { 'a new token' } else { 'its token kept' }); $($Urls -join ', '))"

if (Test-Path -LiteralPath $envFile) {
  $envText = [IO.File]::ReadAllText($envFile)
  $line = [regex]::Match($envText, '(?m)^CATCC_LOG_TOKEN=(.*?)\r?$')
  if ($line.Success -and $line.Groups[1].Value.Trim() -ne $token) {
    Write-Host ".env.local has a different CATCC_LOG_TOKEN: left as it is. Make the two the same by hand."
  } elseif ($line.Success) {
    Write-Host '.env.local has CATCC_LOG_TOKEN already.'
  } else {
    $nl = if ($envText.Contains("`r`n")) { "`r`n" } else { "`n" }
    $add = $(if ($envText.Length -gt 0 -and -not $envText.EndsWith("`n")) { $nl } else { '' }) + "CATCC_LOG_TOKEN=$token$nl"
    [IO.File]::AppendAllText($envFile, $add, $enc)
    Write-Host '.env.local: CATCC_LOG_TOKEN added (the local backend reads it when it starts again).'
  }
} else {
  Write-Host '.env.local not found: CATCC_LOG_TOKEN not added there.'
}

if ($Fly) {
  Push-Location (Join-Path $root 'SDOBot')
  try {
    & fly secrets set --stage "CATCC_LOG_TOKEN=$token" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "fly secrets set failed ($LASTEXITCODE)" }
    Write-Host "SDOBot's Fly secret CATCC_LOG_TOKEN staged: it applies at the next deploy."
  } finally { Pop-Location }
}
