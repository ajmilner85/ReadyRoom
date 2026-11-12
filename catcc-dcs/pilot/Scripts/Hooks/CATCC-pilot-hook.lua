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

local CMD_GATE = 11873 -- must match Mods/aircraft/CATCC-Pilot/Cockpit/Scripts/catcc_gate.lua
local GATE_ARG = 997   -- the gate device's draw argument (read back once to check it took)
local FRESH_S = 12

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
local held = {}          -- player name -> true
local heardAt = -1e9     -- last hold list from the server
local lastSentAt = -1e9
local lastSent = nil
local running = false
local checked = false

local function now() return (DCS and DCS.getRealTime and DCS.getRealTime()) or socket.gettime() end

local function myName()
  local ok, id = pcall(net.get_my_player_id)
  if not ok or not id then return nil end
  local ok2, name = pcall(net.get_player_info, id, 'name')
  return ok2 and name or nil
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

-- {"type":"hold","p":["name",...]}
local function onLine(line)
  if not line:find('"type":"hold"', 1, true) then return end
  local _, i = line:find('"p":[', 1, true)
  if not i then return end
  -- the strings in the array, until its closing bracket (names may hold brackets, quotes, escapes)
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
  held = list
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

-- tell the gate device (LoSetCommand lives in the export environment)
local function setGate(v)
  local code = string.format('LoSetCommand(%d, %d)', CMD_GATE, v)
  if Export and Export.LoSetCommand then
    pcall(Export.LoSetCommand, CMD_GATE, v)
  else
    pcall(net.dostring_in, 'export', code)
  end
end

local function tick()
  poll()
  local t = now()
  local name = myName()
  local hold = name ~= nil and t - heardAt < FRESH_S and held[name] == true
  local v = hold and 1 or 0
  if v ~= lastSent or t - lastSentAt >= 2 then
    setGate(v)
    if v ~= lastSent then
      local names = {}
      for n in pairs(held) do names[#names + 1] = n end
      logi((hold and 'held by PriFly' or 'not held') .. ' (me: ' .. tostring(name) .. '; list: ' ..
        (#names > 0 and table.concat(names, ', ') or 'empty') .. (t - heardAt < FRESH_S and '' or ', stale') .. ')')
    end
    lastSent, lastSentAt = v, t
    -- once per mission: check the gate argument really changes on this aircraft
    if hold and not checked and Export and Export.LoGetAircraftDrawArgumentValue then
      checked = true
      local ok, a = pcall(Export.LoGetAircraftDrawArgumentValue, GATE_ARG)
      logi('gate argument ' .. GATE_ARG .. ' reads ' .. tostring(ok and a or 'n/a') .. ' while held')
    end
  end
end

local handler = {}
function handler.onSimulationStart()
  running, checked, held, heardAt, lastSent = true, false, {}, -1e9, nil
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
