-- Copy to Saved Games\<DCS.server>\Config\CATCC.lua and set a long random token.
-- The same token goes in the room service's CATCC_TOKEN secret.
return {
  token = 'replace-with-a-long-random-string',
  port = 10310,        -- LotATC's default port; disable LotATC or pick another open port
  rate_hz = 1,         -- frames per second
  name = 'Fox3',       -- shown to clients
  -- state = 'server', -- net.dostring_in state for the mission scripting environment
  commands = false,    -- true: accept ship orders (helm, waypoints, escort stations) from the room
  -- max_cmds_per_s = 5,
}
