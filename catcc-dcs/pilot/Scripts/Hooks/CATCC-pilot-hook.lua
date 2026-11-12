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
-- What the pilot needs to know while flying goes on screen ("CATCC: ..." in the mission message area):
-- shown directly in single player or when hosting, relayed through the server hook from a client.
-- Everything also goes to dcs.log.
--
-- Config (optional): Saved Games\DCS\Config\CATCC-pilot.lua returning { host = '..', port = 10310 }
-- (messages = false: nothing on screen)

local CMD_GATE = 11873      -- must match Mods/aircraft/CATCC-Pilot/Cockpit/Scripts/catcc_gate.lua
local CMD_SALUTE_ID = 11874 -- tells the gate device which command is the pilot salute
local CMD_CHOCKS = 11875    -- tells the gate device to draw chocks (PriFly holds them, parked)
local GATE_ARG = 997        -- the gate device's draw argument (0.25 / 0.75 for a few seconds after a salute)
local SALUTE_ARGS = { 520, 521 } -- the pilot figure's salute (right / left hand) on the Hornet
local LB_ARG = 85                -- the launch bar (the deck crew's own check: above 0.6 = down)
local FRESH_S = 12
local SALUTE_POLL_S = 0.2
local SALUTE_COOLDOWN_S = 5

local cfg = { host = 'dcs.fightingstingrays.com', port = 10310, enabled = true, messages = true }

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

-- ---- on screen: a line in the mission message area, for this pilot only
local SAY_REPEAT_S = 10 -- the same text at most this often
local saidAt, pendingSay = {}, {}

local function simFn(n)
  for _, tbl in ipairs({ DCS or false, Sim or false }) do
    if tbl and type(tbl[n]) == 'function' then
      local ok, v = pcall(tbl[n])
      if ok then return v end
    end
  end
  return nil
end

-- joined someone else's server: the mission's message functions only work on the server
local function isClient()
  local mp, srv = simFn('isMultiplayer'), simFn('isServer')
  if mp ~= nil and srv ~= nil then return mp == true and srv ~= true end
  local ok1, me = pcall(net.get_my_player_id)
  local ok2, sv = pcall(net.get_server_id)
  return ok1 and ok2 and me ~= nil and sv ~= nil and me ~= sv
end

local SAY_LOCAL = 'local u = world and world.getPlayer and world.getPlayer(); ' ..
  'if u and u.getID and trigger and trigger.action and trigger.action.outTextForUnit then ' ..
  'trigger.action.outTextForUnit(u:getID(), %q, %d) return "ok" end return "no"'

local function say(text)
  logi(text)
  if cfg.messages == false then return end
  local t = now()
  if t - (saidAt[text] or -1e9) < SAY_REPEAT_S then return end
  saidAt[text] = t
  if isClient() then
    -- the server hook shows it (once it's in touch: kept until then)
    if #pendingSay < 10 then pendingSay[#pendingSay + 1] = { text = text, at = t } end
    return
  end
  local ok, r = pcall(net.dostring_in, 'server', string.format(SAY_LOCAL, 'CATCC: ' .. text, SAY_REPEAT_S))
  if not (ok and r == 'ok') and #pendingSay < 10 then pendingSay[#pendingSay + 1] = { text = text, at = t } end
end

-- kept messages go through the server hook once it's in touch; old news is dropped
local function flushSay(t, name)
  if #pendingSay == 0 or not name or not fresh(t) then return end
  for _, m in ipairs(pendingSay) do
    if t - m.at < 30 then sendLine('MSG ' .. name .. '\t' .. m.text) end
  end
  pendingSay = {}
end

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
    say('the F8 chocks menu is not routed through PriFly (run the CATCC installer again)')
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
  if r:find('removed', 1, true) then say('taxi instruction given: chocks coming off') end
end

-- The carrier's own wheel chocks (catcc_chocks.dll, next to the gate device): the ship keeps one chock
-- flag per parking spot. While PriFly holds this jet's chocks, the spot's flag goes back on whenever
-- the deck crew pulls it (their second salute); on the taxi instruction it is let go. The spot is the
-- one whose flag last changed while this jet sat parked (the crew placing or pulling its chocks).
-- First version: also logs what it sees (flags, ship memory around them) so the spot can be found
-- without that. Anything missing or failing: no native chocks, everything else carries on.
local native, nativeTried = nil, false
local lastNativeAt, nativeFlags, nativeErr = -1e9, nil, nil
local mySlot, slotSetByUs, nativeDumped, slotUnknownSaid = nil, false, false, false

-- the spots with chocks on (as the ship counts them, from 0), short enough for the screen
local function spotList(flags)
  local l = {}
  for i = 1, #flags do
    if flags:sub(i, i) == '1' then
      if #l == 12 then l[#l + 1] = '...' break end
      l[#l + 1] = tostring(i - 1)
    end
  end
  return #l > 0 and ('spots ' .. table.concat(l, ', ')) or 'no spots'
end

local function loadNative()
  if nativeTried then return native end
  nativeTried = true
  local path = ((lfs and lfs.writedir and lfs.writedir()) or '') .. 'Mods\\aircraft\\CATCC-Pilot\\bin\\catcc_chocks.dll'
  local ok, loader, err = pcall(package.loadlib, path, 'luaopen_catcc_chocks')
  if ok and loader then
    local ok2, m = pcall(loader)
    if ok2 and type(m) == 'table' then native = m end
  end
  say(native and 'native chocks module loaded' or ('native chocks module not loaded: ' .. tostring(ok and err or loader)))
  return native
end

local function selfPos()
  if not (Export and Export.LoGetSelfData) then return nil end
  local ok, d = pcall(Export.LoGetSelfData)
  local p = ok and type(d) == 'table' and d.Position
  if type(p) == 'table' and p.x then return p end
  return nil
end

local function dumpNative(why)
  for off = 0x1300, 0x16ff, 0x100 do
    local ok, hex = pcall(native.dump, off, 0x100)
    logi(string.format('ship memory %s +0x%x: %s', why, off, ok and tostring(hex) or 'n/a'))
  end
end

local function nativeChocks(t, name, chock, parked)
  if t - lastNativeAt < 1 or not loadNative() then return end
  lastNativeAt = t
  local p = selfPos()
  if not p then return end
  local ok, info, err = pcall(native.probe, p.x, p.y, p.z)
  if not ok or not info then
    local e = tostring(ok and err or info)
    if e ~= nativeErr then
      nativeErr = e
      -- away from the carrier is no news
      if e == 'no carrier here' then logi('native chocks: ' .. e) else say('native chocks: ' .. e) end
    end
    nativeFlags = nil
    return
  end
  nativeErr = nil
  local flags = info.flags
  if flags ~= nativeFlags then
    logi(string.format('carrier chock flags (%d spots, ship %s, me %s %s, %.0f m off): %s',
      info.count, tostring(info.ship), tostring(info.self), tostring(info.selfType), info.dist or -1, flags))
    if not nativeFlags then
      say(string.format('carrier found (%d parking spots), chocks on %s', info.count, spotList(flags)))
    elseif parked then
      say('carrier chocks now on ' .. spotList(flags))
    end
    -- a flag that changed while this jet sat parked: its spot
    if nativeFlags and #nativeFlags == #flags and parked then
      for i = 1, #flags do
        if flags:sub(i, i) ~= nativeFlags:sub(i, i) and i - 1 ~= mySlot then
          mySlot = i - 1
          say('my parking spot: ' .. mySlot .. ' (its chock flag changed while I was parked)')
        end
      end
    end
    if not nativeDumped or (nativeFlags and parked) then
      nativeDumped = true
      dumpNative(nativeFlags and 'after a change' or 'first look')
    end
    nativeFlags = flags
  end
  if not mySlot then
    if chock and parked and not slotUnknownSaid then
      slotUnknownSaid = true
      say('PriFly holds the chocks, but my parking spot is not known yet')
    end
    return
  end
  -- Re-setting the ship's chock flag does NOT physically hold the player, and the deck crew's C++
  -- update clears it the next frame (it flickers). Off by default; the flag read above still finds
  -- the parking spot. cfg.fightDeckCrew = true only to re-test the flag behaviour.
  if not cfg.fightDeckCrew then return end
  local on = flags:sub(mySlot + 1, mySlot + 1) == '1'
  if chock and parked and not on then
    local ok2, r, e2 = pcall(native.set, mySlot, true)
    slotSetByUs = ok2 and r == true
    say('PriFly holds the chocks: spot ' .. mySlot .. ' chocked again' .. (slotSetByUs and '' or (' (failed: ' .. tostring(ok2 and e2 or r) .. ')')))
  elseif not chock and slotSetByUs then
    slotSetByUs = false
    if on then pcall(native.set, mySlot, false) end
    say('chocks let go (spot ' .. mySlot .. ')')
  end
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
    logi('salute seen (' .. how .. ')')
    say('salute reported to PriFly')
  end
  wasSaluting = saluting
end

local inContact, contactWarned, tickErrSaid = false, false, false

local function tick()
  poll()
  local t = now()
  local name = myName()
  -- in touch with the CATCC server hook (it sends the hold list every 5 s, PriFly staffed or not)
  local contact = fresh(t)
  if contact ~= inContact then
    if contact then say('in contact with PriFly') else say('lost contact with PriFly: nothing is held') end
    inContact = contact
  elseif not contact and not contactWarned and t - startedAt > 30 then
    contactWarned = true
    say('no contact with PriFly (CATCC server ' .. tostring(cfg.host) .. ':' .. tostring(cfg.port) .. ')')
  end
  if contact then contactWarned = true end
  flushSay(t, name)
  local hold = name ~= nil and t - heardAt < FRESH_S and held[name] == true
  local v = hold and 1 or 0
  -- chocks drawn while PriFly holds them and the jet is parked (never on a catapult: launch bar down)
  local showChocks = (name ~= nil and fresh(t) and chocked[name] == true and (readArg(LB_ARG) or 0) <= 0.6) and 1 or 0
  if v ~= lastSent or showChocks ~= lastChocks or t - lastSentAt >= 2 then
    setCmd(CMD_GATE, v)
    if saluteId then setCmd(CMD_SALUTE_ID, saluteId) end
    setCmd(CMD_CHOCKS, showChocks)
    if showChocks ~= lastChocks then say(showChocks == 1 and 'chocks drawn: PriFly holds them until your taxi instruction' or 'chocks no longer drawn') end
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
  local sp = groundSpeed()
  nativeChocks(t, name, chock, (readArg(LB_ARG) or 0) <= 0.6 and sp ~= nil and sp < 0.5)
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
  lastNativeAt, nativeFlags, nativeErr, mySlot, slotSetByUs, nativeDumped = -1e9, nil, nil, nil, false, false
  slotUnknownSaid, saidAt, pendingSay = false, {}, {}
  inContact, contactWarned, tickErrSaid = false, false, false
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
  if not ok then
    logi('tick error: ' .. tostring(err))
    if not tickErrSaid then
      tickErrSaid = true
      pcall(say, 'pilot mod error: ' .. tostring(err):sub(1, 120))
    end
  end
end

DCS.setUserCallbacks(handler)
logi('CATCC pilot hook loaded (server ' .. tostring(cfg.host) .. ':' .. tostring(cfg.port) .. ')')
