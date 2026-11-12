-- CATCC pilot hook (GameGUI, runs on the pilot's PC; Lua 5.1).
--
-- Connects to the CATCC hook on the DCS server (the same port the room uses) as a PILOT client and
-- hears the list of players PriFly is holding on deck. Tells this aircraft's CATCC gate device
-- (Mods/aircraft/CATCC-Pilot) whether you're held, every 2 s. Never blocks DCS: non-blocking socket,
-- everything in pcall.
--
-- Fail-open everywhere: no config, no server, no word from the server for 12 s, or not on the list
-- means not held. The gate device also opens by itself if this hook goes quiet.
--
-- Config (optional): Saved Games\DCS\Config\CATCC-pilot.lua returning { host = '..', port = 10310 }

local CMD_GATE = 11873      -- must match Mods/aircraft/CATCC-Pilot/Cockpit/Scripts/catcc_gate.lua
local CMD_SALUTE_ID = 11874 -- tells the gate device which command is the pilot salute
local CMD_CHOCKS = 11875    -- tells the gate device to draw chocks (PriFly holds them, parked)
local GATE_ARG = 997        -- the gate device's draw argument (0.25 / 0.75 for a few seconds after a salute)
local SALUTE_ARGS = { 520, 521 } -- the pilot figure's salute (right / left hand) on the Hornet
local LB_ARG = 85                -- the launch bar (the deck crew's own check: above 0.6 = down)
local FRESH_S = 12
local SALUTE_POLL_S = 0.2
local SALUTE_COOLDOWN_S = 5

local cfg = { host = 'dcs.fightingstingrays.com', port = 10310, enabled = true }

local function logi(m) if log and log.write then log.write('CATCC-PILOT', log.INFO, m) end end

do
  local writedir = (lfs and lfs.writedir and lfs.writedir()) or ''
  local f = loadfile(writedir .. 'Config/CATCC-pilot.lua')
  if f then
    local ok, user = pcall(f)
    if ok and type(user) == 'table' then for k, v in pairs(user) do cfg[k] = v end end
  end
end

package.path = (package.path or '') .. ';.\\LuaSocket\\?.lua'
package.cpath = (package.cpath or '') .. ';.\\LuaSocket\\?.dll'
local socket = require('socket')

local sock, rbuf = nil, ''
local nextConnectAt = 0
local held = {}          -- player name -> true (held for launch)
local chocked = {}       -- player name -> true (chocks held: no taxi instruction yet)
local lastChockCheckAt = -1e9
local exportListed = false
local lbDown = nil       -- launch bar down, as last reported (nil: not reported this hold)
local lastLbAt = -1e9
local heardAt = -1e9     -- last hold list from the server
local lastSentAt = -1e9
local lastSent = nil
local lastChocks = 0
local running = false
local checkAt = nil      -- when to read the gate argument back (once per mission, a moment after the first hold)
local saluteId = nil     -- the salute command's number (false: not found)
local lastPollAt = -1e9
local wasSaluting = false
local lastSaluteAt = -1e9

local function now() return (DCS and DCS.getRealTime and DCS.getRealTime()) or socket.gettime() end

-- something from the export environment (this aircraft): Export.<fn>() if the GUI has it, else via dostring
local function exportVal(fn, expr)
  if Export and Export[fn] then
    local ok, v = pcall(Export[fn])
    if ok then return v end
  end
  local ok, v = pcall(net.dostring_in, 'export', 'return ' .. expr)
  return ok and v or nil
end

local function netName()
  local ok, id = pcall(net.get_my_player_id)
  if not ok or not id then return nil end
  local ok2, name = pcall(net.get_player_info, id, 'name')
  return ok2 and name or nil
end

-- the aircraft's pilot name: what the server sees in single player (the mission's name for the unit)
local pilotNameAt, pilotNameV = -1e9, nil
local function pilotName()
  local t = now()
  if t - pilotNameAt >= 1 then
    pilotNameAt = t
    local v = exportVal('LoGetPilotName', 'LoGetPilotName()')
    pilotNameV = type(v) == 'string' and v ~= '' and v or nil
  end
  return pilotNameV
end

-- the name PriFly knows this pilot by: the multiplayer name, or in single player the unit's pilot name
local function myName()
  local a, b = netName(), pilotName()
  for _, n in ipairs({ a or false, b or false }) do
    if n and (held[n] or chocked[n]) then return n end
  end
  return a or b
end

-- ground speed (m/s) and whether an engine is running (a hot start), for chocking a jet that spawned without
-- (the GUI's Export table first: autoexec.cfg rarely lets hooks dostring into "export")
local function groundSpeed()
  local v
  if Export and Export.LoGetVectorVelocity then
    local ok, w = pcall(Export.LoGetVectorVelocity)
    if ok and type(w) == 'table' then v = math.sqrt((w.x or 0) ^ 2 + (w.z or 0) ^ 2) end
  else
    v = tonumber(exportVal(nil, 'tostring((function() local v = LoGetVectorVelocity() return v and math.sqrt(v.x * v.x + v.z * v.z) end)())'))
  end
  return v
end
local function engineRunning()
  local v
  if Export and Export.LoGetEngineInfo then
    local ok, e = pcall(Export.LoGetEngineInfo)
    if ok and type(e) == 'table' and type(e.RPM) == 'table' then v = math.max(e.RPM.left or 0, e.RPM.right or 0) end
  else
    v = tonumber(exportVal(nil, 'tostring((function() local e = LoGetEngineInfo() return e and e.RPM and math.max(e.RPM.left or 0, e.RPM.right or 0) end)())'))
  end
  return (v or 0) > 50
end

local function close(why)
  if sock then pcall(function() sock:close() end) end
  sock, rbuf = nil, ''
  nextConnectAt = now() + 10
  if why then logi('disconnected: ' .. why) end
end

local function connect()
  if not cfg.enabled or now() < nextConnectAt then return end
  nextConnectAt = now() + 10
  local s = socket.tcp()
  s:settimeout(0)
  s:connect(cfg.host, cfg.port) -- non-blocking: completes in the background
  sock, rbuf = s, ''
  sock:send('PILOT\n')
end

-- the strings in the JSON array after `key` ("p":[ ...), as a set (names may hold brackets, quotes, escapes)
local function nameSet(line, key)
  local _, i = line:find(key, 1, true)
  if not i then return nil end
  local list = {}
  i = i + 1
  while i <= #line do
    local ch = line:sub(i, i)
    if ch == ']' then break end
    if ch == '"' then
      local buf = {}
      i = i + 1
      while i <= #line do
        local c = line:sub(i, i)
        if c == '\\' then
          local e = line:sub(i + 1, i + 1)
          if e == 'u' then
            local cp = tonumber(line:sub(i + 2, i + 5), 16) or 63
            buf[#buf + 1] = cp < 128 and string.char(cp) or '?'
            i = i + 6
          else
            buf[#buf + 1] = e
            i = i + 2
          end
        elseif c == '"' then
          break
        else
          buf[#buf + 1] = c
          i = i + 1
        end
      end
      list[table.concat(buf)] = true
    end
    i = i + 1
  end
  return list
end

-- {"type":"hold","p":["name",...],"c":["name",...]}
local function onLine(line)
  if not line:find('"type":"hold"', 1, true) then return end
  local list = nameSet(line, '"p":[')
  if not list then return end
  held = list
  chocked = nameSet(line, '"c":[') or {}
  heardAt = now()
end

local function poll()
  if not sock then return connect() end
  for _ = 1, 16 do
    local line, err, partial = sock:receive('*l')
    if line then
      onLine(rbuf .. line)
      rbuf = ''
    else
      if partial and partial ~= '' then rbuf = rbuf .. partial end
      if #rbuf > 65536 then return close('line too long') end
      if err == 'closed' then return close('closed by server') end
      return
    end
  end
end

local function sendLine(l)
  if sock then pcall(function() sock:send(l .. '\n') end) end
end

local function fresh(t) return t - heardAt < FRESH_S end

-- The F8 menu's "Wheel chocks" (Hornet comm.lua, patched by install.ps1) runs in DCS's main Lua state,
-- not this one: it keeps CATCC_CHOCKS there (held flag, the pilot's kept requests, place / remove).
-- Every second this hook sets the flag and collects the requests through net.dostring_in; while
-- PriFly holds the chocks a request is kept (and PriFly hears the pilot is ready to taxi), and the
-- chocks come off once the taxi instruction is given. Not found, or no word from here: stock menu.
local MENU_STATES = { 'server', 'mission' }
local menuState = nil
local lastProbeAt, lastSyncAt, menuWarned = -1e9, -1e9, false
local startedAt = 0

local function menuDo(code)
  if not menuState then return nil end
  local ok, r = pcall(net.dostring_in, menuState, code)
  return ok and r or nil
end

local function findMenu(t)
  if menuState or t - lastProbeAt < 5 then return end
  lastProbeAt = t
  for _, st in ipairs(MENU_STATES) do
    local ok, r = pcall(net.dostring_in, st, 'return CATCC_CHOCKS and "yes" or "no"')
    if ok and r == 'yes' then
      menuState = st
      logi('chocks menu found in Lua state "' .. st .. '"')
      return
    end
  end
  if not menuWarned and t - startedAt > 60 then
    menuWarned = true
    logi('chocks menu not found (is comm.lua patched, and does autoexec.cfg net.allow_dostring_in include "server"?)')
  end
end

local function syncMenu(t, chock, name)
  findMenu(t)
  if not menuState or t - lastSyncAt < 1 then return end
  lastSyncAt = t
  local r = menuDo(string.format('local S = CATCC_CHOCKS; if not S then return "gone" end; S.held = %s; ' ..
    'S.at = os and os.clock and os.clock() or 0; local a = S.asked or 0; S.asked = 0; local out = tostring(a); ' ..
    'if not S.held and S.pending then S.pending = false; S.remove(); out = out .. ",removed" end; return out', chock and 'true' or 'false'))
  if r == 'gone' or r == nil then
    if r == 'gone' then menuState = nil end
    return
  end
  if (tonumber(r:match('^(%d+)')) or 0) > 0 then
    if name then sendLine('EV taxi ' .. name) end
    logi('chocks request held: waiting for the taxi instruction from PriFly')
  end
  if r:find('removed', 1, true) then logi('taxi instruction given: chocks coming off') end
end

-- tell the gate device (LoSetCommand lives in the export environment)
local function setCmd(cmd, v)
  if Export and Export.LoSetCommand then
    pcall(Export.LoSetCommand, cmd, v)
  else
    pcall(net.dostring_in, 'export', string.format('LoSetCommand(%d, %d)', cmd, v))
  end
end

local function readArg(n)
  if Export and Export.LoGetAircraftDrawArgumentValue then
    local ok, a = pcall(Export.LoGetAircraftDrawArgumentValue, n)
    return ok and tonumber(a) or nil
  end
  local ok, a = pcall(net.dostring_in, 'export', string.format('return tostring(LoGetAircraftDrawArgumentValue(%d))', n))
  return ok and tonumber(a) or nil
end

-- the pilot-salute command's number, from the input system's own table (so any key binding works)
local function resolveSalute()
  if saluteId ~= nil then return end
  saluteId = false
  local ok, Input = pcall(require, 'Input')
  if ok and type(Input) == 'table' and Input.getEnvTable then
    local ok2, env = pcall(Input.getEnvTable)
    local id = ok2 and type(env) == 'table' and type(env.Actions) == 'table' and env.Actions.iCommandPilotGestureSalute
    if type(id) == 'number' then saluteId = id end
  end
  logi('salute command: ' .. (saluteId and tostring(saluteId) or 'not found (watching the pilot figure only)'))
end

-- on deck while held: did the pilot just salute? (the gate device's mark, or the pilot figure's arm)
local function pollSalute(t, name, heldNow, chockedNow)
  if t - lastPollAt < SALUTE_POLL_S then return end
  lastPollAt = t
  local how = nil
  local g = readArg(GATE_ARG)
  if g and g > 0.1 and g < 0.9 then how = 'command' end
  if not how then
    for _, n in ipairs(SALUTE_ARGS) do
      local a = readArg(n)
      if a and a > 0.3 and a < 0.99 then how = 'gesture ' .. n break end
    end
  end
  local saluting = how ~= nil
  if saluting and not wasSaluting and t - lastSaluteAt >= SALUTE_COOLDOWN_S and sock then
    lastSaluteAt = t
    sendLine('SALUTE ' .. name)
    logi('salute reported to PriFly (' .. how .. ')')
  end
  wasSaluting = saluting
end

local function tick()
  poll()
  local t = now()
  local name = myName()
  local hold = name ~= nil and t - heardAt < FRESH_S and held[name] == true
  local v = hold and 1 or 0
  -- chocks drawn while PriFly holds them and the jet is parked (never on a catapult: launch bar down)
  local showChocks = (name ~= nil and fresh(t) and chocked[name] == true and (readArg(LB_ARG) or 0) <= 0.6) and 1 or 0
  if v ~= lastSent or showChocks ~= lastChocks or t - lastSentAt >= 2 then
    setCmd(CMD_GATE, v)
    if saluteId then setCmd(CMD_SALUTE_ID, saluteId) end
    setCmd(CMD_CHOCKS, showChocks)
    if showChocks ~= lastChocks then logi(showChocks == 1 and 'chocks shown (PriFly holds them)' or 'chocks no longer shown') end
    lastChocks = showChocks
    if v ~= lastSent then
      local names = {}
      for n in pairs(held) do names[#names + 1] = n end
      logi((hold and 'held by PriFly' or 'not held') .. ' (me: ' .. tostring(name) .. '; list: ' ..
        (#names > 0 and table.concat(names, ', ') or 'empty') .. (t - heardAt < FRESH_S and '' or ', stale') .. ')')
    end
    lastSent, lastSentAt = v, t
    if hold and checkAt == nil then checkAt = t + 3 end
  end
  -- once per mission, a moment after the first hold: check the gate argument really changed
  if checkAt and t >= checkAt then
    checkAt = false
    logi('gate argument ' .. GATE_ARG .. ' reads ' .. tostring(readArg(GATE_ARG) or 'n/a') .. (hold and ' while held' or ' (no longer held)'))
  end
  local chock = name ~= nil and fresh(t) and chocked[name] == true
  -- the kept chocks request goes through once PriFly lets go (taxi instruction, or no word: fail-open)
  syncMenu(t, chock, name)
  -- held for launch: tell PriFly when the launch bar is down (the shooter is ready and waiting)
  if hold and t - lastLbAt >= 0.5 then
    lastLbAt = t
    local a = readArg(LB_ARG)
    if a then
      local down = a > 0.6
      -- up is only news after down
      if down ~= (lbDown or false) then sendLine('EV ' .. (down and 'lb1' or 'lb0') .. ' ' .. name) end
      lbDown = down
    end
  elseif not hold then
    lbDown = nil
  end
  if hold or chock then pollSalute(t, name, hold, chock) else wasSaluting = false end
end

local handler = {}
function handler.onSimulationStart()
  running, checkAt, held, heardAt, lastSent = true, nil, {}, -1e9, nil
  chocked, lbDown, lastChocks = {}, nil, 0
  menuState, menuWarned, startedAt = nil, false, now()
  wasSaluting, lastSaluteAt = false, -1e9
  resolveSalute()
  if not exportListed then
    exportListed = true
    local keys = {}
    if type(Export) == 'table' then for k in pairs(Export) do keys[#keys + 1] = tostring(k) end end
    table.sort(keys)
    logi('GUI Export table: ' .. (#keys > 0 and table.concat(keys, ', ') or 'none'))
  end
  nextConnectAt = 0
end
function handler.onSimulationStop()
  running = false
  close(nil)
end
function handler.onSimulationFrame()
  if not running then return end
  local ok, err = pcall(tick)
  if not ok then logi('tick error: ' .. tostring(err)) end
end

DCS.setUserCallbacks(handler)
logi('CATCC pilot hook loaded (server ' .. tostring(cfg.host) .. ':' .. tostring(cfg.port) .. ')')
