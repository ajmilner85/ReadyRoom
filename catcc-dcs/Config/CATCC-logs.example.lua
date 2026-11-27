-- CATCC live logs (Scripts/CATCC/catcc_logs.lua): this PC's DCS and CATCC logs go to SDOBot while DCS runs.
-- scripts/catcc/catcc-logs-setup.ps1 writes catcc-dcs/Config/CATCC-logs.lua from this (with a new token, which it also
-- puts in .env.local as CATCC_LOG_TOKEN); the crew test's installer copies that file to Saved Games\DCS\Config.
-- Without that file nothing is sent.
return {
  -- tried in turn; the first that takes a chunk is kept until it fails. http only (DCS's Lua has no TLS).
  urls = {
    'http://readyroom.fly.dev/api/catcc/logs',   -- SDOBot on Fly
    'http://127.0.0.1:3001/api/catcc/logs',      -- SDOBot on this PC (the local backend)
  },
  token = 'replace-with-the-CATCC_LOG_TOKEN-of-SDOBot',
}
