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
-- With messages on, what the mod is doing goes on screen ("CATCC: ..." in the mission message area):
-- shown directly in single player or when hosting, relayed through the server hook from a client.
-- Everything always goes to dcs.log.
--
-- Chocks: while PriFly holds a parked jet's chocks (until its taxi instruction), the jet's own
-- chocks stay in: the salute is held back from the deck crew, or the ground crew is asked for
-- chocks. See "chocks held by PriFly" below.
--
-- Config (optional): Saved Games\DCS\Config\CATCC-pilot.lua returning { host = '..', port = 10310 }
-- (messages = true: what the mod is doing is shown on screen. Off by default; on with the test
-- config, Config\CATCC-test.lua returning { chockTest = true })

local CMD_GATE = 11873      -- must match Mods/aircraft/CATCC-Pilot/Cockpit/Scripts/catcc_gate.lua
local CMD_SALUTE_ID = 11874 -- tells the gate device which command is the pilot salute
local CMD_HELD_SALUTE = 11876 -- what the salute key sends while PriFly holds the chocks (the gate device marks it)
local GATE_ARG = 997        -- the gate device's draw argument (0.25 / 0.75 for a few seconds after a salute)
local SALUTE_ARGS = { 520, 521 } -- the pilot figure's salute (right / left hand) on the Hornet
local LB_ARG = 85                -- the launch bar (the deck crew's own check: above 0.6 = down)
local CHOCK_ARG = 23             -- the Hornet's wheel chocks: its flight model draws them while they are in
local HORNET = 'FA-18C_hornet'
local HOLD_LAYER = 'CATCC hold'  -- the input layer that takes the salute key while PriFly holds the chocks
local FRESH_S = 12
local SALUTE_POLL_S = 0.2
local SALUTE_COOLDOWN_S = 5

local cfg = { host = 'dcs.fightingstingrays.com', port = 10310, enabled = true, messages = false }

local function logi(m) if log and log.write then log.write('CATCC-PILOT', log.INFO, m) end end

do
  local writedir = (lfs and lfs.writedir and lfs.writedir()) or ''
  local userMessages = nil
  local f = loadfile(writedir .. 'Config/CATCC-pilot.lua')
  if f then
    local ok, user = pcall(f)
    if ok and type(user) == 'table' then
      for k, v in pairs(user) do cfg[k] = v end
      userMessages = user.messages
    end
  end
  -- test switches (the same file the server hook reads): { chockTest = true } turns on the F10 test
  -- hold (testSwitch below) and the on-screen messages (unless the pilot config says otherwise)
  local tf = loadfile(writedir .. 'Config/CATCC-test.lua')
  if tf then
    local ok, test = pcall(tf)
    if ok and type(test) == 'table' and test.chockTest == true then
      cfg.chockTest = true
      if userMessages == nil then cfg.messages = true end
    end
  end
end

package.path = (package.path or '') .. ';.\\LuaSocket\\?.lua'
package.cpath = (package.cpath or '') .. ';.\\LuaSocket\\?.dll'
local socket = require('socket')

local sock, rbuf = nil, ''
local nextConnectAt = 0
local held = {}          -- player name -> true (held for launch)
local chocked = {}       -- player name -> true (chocks held: no taxi instruction yet)
local exportListed = false
local lbDown = nil       -- launch bar down, as last reported (nil: not reported this hold)
local lastLbAt = -1e9
local heardAt = -1e9     -- last hold list from the server
local lastSentAt = -1e9
local lastSent = nil
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

-- speed over the ground (m/s). On a carrier under way a parked jet has the ship's speed, so this only
-- tells a jet on deck from one flying
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
  if cfg.messages ~= true then return end
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

-- the aircraft being flown: its type, and something that changes when the pilot takes another jet
local typeAt, typeV = -1e9, nil
local function playerType()
  local t = now()
  if t - typeAt >= 1 then
    typeAt, typeV = t, nil
    if DCS and DCS.getPlayerUnitType then
      local ok, ty = pcall(DCS.getPlayerUnitType)
      if ok and type(ty) == 'string' and ty ~= '' then typeV = ty end
    end
  end
  return typeV
end
local function playerUnit()
  if DCS and DCS.getPlayerUnit then
    local ok, id = pcall(DCS.getPlayerUnit)
    if ok and id ~= nil and id ~= '' then return tostring(id) end
  end
  return nil
end

-- ---- chocks held by PriFly ------------------------------------------------------------------------
-- A parked jet is held by its own wheel chocks: the ones DCS puts in, which hold a Hornet in full
-- afterburner. Nothing is added to the deck and no cockpit control moves.
--   * Supercarrier deck crew ON: the jet spawns chocked and the crew pulls the chocks after the pilot's
--     salutes. While PriFly holds the chocks the salute never reaches the crew: the key or button is
--     taken by an input layer above the aircraft's (the salute key, held: below), the F8 "Salute!" item
--     by the comm.lua patch, and PriFly hears "ready to taxi" instead.
--   * deck crew OFF: nothing chocks the jet, so the mod asks the Hornet's ground crew to (the F8
--     "Wheel chocks > Place" request) and has them taken out again when PriFly lets go.
--   * either way the F8 "Wheel chocks > Remove" request is kept until PriFly lets go.
-- PriFly lets go with the taxi instruction, or by going quiet (fail-open).
--
-- What did not work is parked in pilot/experiments (the carrier's chock flags through a native module,
-- chocks drawn by the gate device) and Scripts/CATCC/chocktest.lua (collision blockers).
--
-- The F8 menu (Hornet comm.lua, patched by install.ps1) runs in DCS's main Lua state, not this one: it
-- keeps CATCC_CHOCKS there (held flags, the pilot's kept requests, place / remove). Every second this
-- hook sets the flags and collects the requests through net.dostring_in. Not found, or no word from
-- here for 15 s: the stock menu.
local MENU_STATES = { 'server', 'mission' }
local menuState = nil
local lastProbeAt, lastSyncAt, lastSyncFlags, menuWarned = -1e9, -1e9, nil, false
local menuSalute, menuSaluteSaid = nil, false -- the F8 "Salute!" item is routed through PriFly too (an older install: not)
local startedAt = 0
-- chocks this mod asked the ground crew for (deck crew off)
local gc = { askedAt = nil, tries = 0, ours = false, still = nil, release = false, at = -1e9 }
-- asked as soon as the hold arrives (the crew itself takes a few seconds; nothing scriptable is faster)
local PLACE_SETTLE_S, PLACE_RETRY_S, PLACE_TRIES = 0, 45, 3
-- The crew's radio call ("copy", "wheel chocks are now placed") when this mod asked: silenced. DCS builds
-- every radio call through speech.make(message) (Scripts/Speech/speech.lua, loaded in the same Lua state
-- as the F8 menu); while S.quietUntil runs, those two calls come back empty. The pilot's own requests
-- (chocks out on the taxi instruction) are voiced as stock. Installed once, again if speech is reloaded.
local QUIET_S = 20
local QUIET_CREW = 'local quiet = "no speech module"; ' ..
  'local sp = (package and package.loaded and package.loaded.speech) or speech; ' ..
  'if type(sp) == "table" and type(sp.make) == "function" and Message then ' ..
  '  if not sp.catccQuiet then ' ..
  '    local orig = sp.make; ' ..
  '    local ev = { [Message.wMsgGroundCrewCopy or -1] = true, [Message.wMsgGroundCrewWheelChocksOn or -1] = true }; ' ..
  '    sp.make = function(m) ' ..
  '      local S = CATCC_CHOCKS; ' ..
  '      if S and S.quietUntil and m and ev[m.event] and os.clock() < S.quietUntil then ' ..
  '        S.quieted = (S.quieted or 0) + 1; return nil end; ' ..
  '      return orig(m) end; ' ..
  '    sp.catccQuiet = true end; ' ..
  '  quiet = "on" end; '

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
      local ok2, r2 = pcall(net.dostring_in, st, 'return CATCC_CHOCKS.salPatched and "yes" or "no"')
      menuSalute = ok2 and r2 == 'yes'
      logi('chocks menu found in Lua state "' .. st .. '"; F8 "Salute!" item ' ..
        (menuSalute and 'routed through PriFly' or 'NOT routed through PriFly (run the CATCC installer again)'))
      return
    end
  end
  if not menuWarned and t - startedAt > 60 then
    menuWarned = true
    logi('chocks menu not found (is comm.lua patched, and does autoexec.cfg net.allow_dostring_in include "server"?)')
    say('the F8 chocks menu is not routed through PriFly (run the CATCC installer again)')
  end
end

-- Flags to the menu, the pilot's kept requests back. Once PriFly has let go, a kept Remove request
-- goes through, and so does the removal of chocks this mod asked for (gc.release).
local function syncMenu(t, chock, salHeld, name)
  findMenu(t)
  local flags = (chock and 'c' or '-') .. (salHeld and 's' or '-') .. (gc.release and 'r' or '-')
  if not menuState or (t - lastSyncAt < 1 and flags == lastSyncFlags) then return end
  lastSyncAt, lastSyncFlags = t, flags
  local r = menuDo(string.format('local S = CATCC_CHOCKS; if not S then return "gone" end; S.held = %s; S.sal = %s; ' ..
    'S.at = os and os.clock and os.clock() or 0; local a, b = S.asked or 0, S.salAsked or 0; S.asked = 0; S.salAsked = 0; ' ..
    'local out = a .. "," .. b; if not S.held and (S.pending or %s) then S.pending = false; S.remove(); out = out .. ",removed" end; ' ..
    'return out', chock and 'true' or 'false', salHeld and 'true' or 'false', gc.release and 'true' or 'false'))
  if r == 'gone' or r == nil then
    if r == 'gone' then menuState = nil end
    lastSyncFlags = nil
    return
  end
  gc.release = false
  local a, b = tostring(r):match('^(%d+),(%d+)')
  a, b = tonumber(a) or 0, tonumber(b) or 0
  if a + b > 0 and name then sendLine('EV taxi ' .. name) end
  if a > 0 then say('chocks request kept: they come off with your taxi instruction') end
  if b > 0 then say('ready call sent to PriFly: salute again once you have your taxi instruction') end
  if tostring(r):find('removed', 1, true) then say('PriFly let go: chocks coming off') end
end

-- the Hornet's own chocks are in (its flight model draws them)
local function chocksIn()
  local a = readArg(CHOCK_ARG)
  return a ~= nil and a > 0.5
end

-- Deck crew off: nothing chocks the jet. A moment after the hold starts, ask the Hornet's ground crew
-- (a few tries: on a carrier whose deck crew already pulled its own chocks they answer "unable").
-- Chocks that were already in (the deck crew's, or the pilot's own request) are left to their owner.
local function groundChocks(t, chock, onDeck, hornet)
  if t - gc.at < 0.5 then return end
  gc.at = t
  if not hornet then return end
  local inNow = chocksIn()
  if not chock then
    if gc.ours and inNow then gc.release = true end
    gc.askedAt, gc.tries, gc.ours, gc.still = nil, 0, false, nil
    return
  end
  if inNow then
    if gc.askedAt and not gc.ours then
      gc.ours = true
      say('ground crew chocks in: PriFly holds them until your taxi instruction')
    end
    gc.still = nil
    return
  end
  gc.ours = false
  if not onDeck or not menuState then gc.still = nil return end
  gc.still = gc.still or t
  if t - gc.still < PLACE_SETTLE_S or gc.tries >= PLACE_TRIES or (gc.askedAt and t - gc.askedAt < PLACE_RETRY_S) then return end
  gc.tries, gc.askedAt = gc.tries + 1, t
  local r = menuDo(QUIET_CREW .. 'local S = CATCC_CHOCKS; if S and S.place then S.quietUntil = (os and os.clock and os.clock() or 0) + ' ..
    QUIET_S .. '; S.place() return "asked," .. quiet end return "no"')
  if r and r:sub(1, 6) == 'asked,' then
    logi('ground crew asked for chocks; their radio call ' .. (r == 'asked,on' and 'silenced' or ('NOT silenced (' .. r:sub(7) .. ')')))
    say('no chocks in: asking the ground crew for them (PriFly holds you until your taxi instruction)')
  else
    logi('ground crew chocks: the F8 menu did not take the request')
  end
end

-- ---- the salute key, held ---------------------------------------------------------------------------
-- DCS reads keys and buttons through a stack of input layers: a layer above the aircraft's takes the
-- key combinations it defines and lets everything else through (the radio menu's F-keys work this way).
-- While PriFly holds the chocks, HOLD_LAYER sits above the aircraft's layer with every combination the
-- pilot has bound to the salute, each sending CMD_HELD_SALUTE instead: the deck crew never sees a
-- salute, the gate device marks the press, and PriFly hears "ready to taxi". The layer is built from
-- the tables DCS builds the aircraft's own layer from (as Scripts/Input/Loader.lua does), so custom
-- bindings and modifiers are covered. It is read again every LAYER_SCAN_S, checked every
-- LAYER_CHECK_S, and gone the moment PriFly lets go, on any error, and when the mission stops.
local LAYER_CHECK_S, LAYER_SCAN_S, RETOP_MAX = 0.5, 30, 40
local UNIT_MARK = 'Unit ' -- the aircraft's own layer is "Unit <type>" (Input.Data getUnitMarker)
local inp = { tried = false, ok = false, registered = false }
local layer = { on = false, checkAt = -1e9, scanAt = -1e9, sig = nil, topFirst = nil, dead = false, none = false, noneSaid = false, retops = 0 }

local function inputApi()
  if inp.tried then return inp.ok end
  inp.tried = true
  for k, mod in pairs({ Input = 'Input', Data = 'Input.Data', Utils = 'Input.Utils', Db = 'Input.ProfileDatabase' }) do
    local ok, m = pcall(require, mod)
    if ok and type(m) == 'table' then inp[k] = m end
  end
  local I = inp.Input
  inp.ok = I ~= nil and inp.Data ~= nil and inp.Utils ~= nil and type(I.createLayer) == 'function'
    and type(I.deleteLayer) == 'function' and type(I.addKeyCombo) == 'function' and type(I.addReformer) == 'function'
    and type(I.setTopLayer) == 'function' and type(I.removeLayerFromStack) == 'function' and type(I.getDeviceId) == 'function'
    and type(inp.Utils.getInputEvent) == 'function' and type(inp.Data.getProfileKeyCommands) == 'function'
  if not inp.ok then
    logi('salute hold: the input modules are not available here (only the F8 "Salute!" item is held)')
    return false
  end
  if type(inp.Data.getUnitMarker) == 'function' then
    local ok, m = pcall(inp.Data.getUnitMarker)
    if ok and type(m) == 'string' and m ~= '' then UNIT_MARK = m end
  end
  return true
end

-- the layer stack as names, or nil when it can't be read
local function stackNames()
  if type(inp.Input.getLayerStack) ~= 'function' then return nil end
  local ok, st = pcall(inp.Input.getLayerStack)
  if not ok or type(st) ~= 'table' then return nil end
  local names = {}
  for i, l in ipairs(st) do
    names[i] = type(l) == 'string' and l or tostring(type(l) == 'table' and (l.name or l[1]) or l)
  end
  return names
end

local function isUnitLayer(n) return n:sub(1, #UNIT_MARK) == UNIT_MARK end

-- the aircraft types whose input layers are in use (normally one: the jet being flown)
local function unitTypes(names)
  local types, seen = {}, {}
  for _, n in ipairs(names or {}) do
    if isUnitLayer(n) then
      local ty = n:sub(#UNIT_MARK + 1)
      if ty ~= '' and not seen[ty] then seen[ty] = true; types[#types + 1] = ty end
    end
  end
  local ty = playerType()
  if ty and not seen[ty] then types[#types + 1] = ty end
  return types
end

local function profileOf(ty)
  local Data = inp.Data
  local ok, p = pcall(Data.getProfileNameByUnitName, ty)
  if ok and p then return p end
  if not inp.registered and inp.Db and DCS and DCS.getInputProfiles then
    -- no input profiles listed in this Lua state yet: list them the way the in-game controls dialog
    -- does (Scripts/UI/AdjustControlsDialog.lua loadProfiles_)
    inp.registered = true
    pcall(function()
      local wd = (lfs and lfs.writedir and lfs.writedir()) or ''
      Data.initialize(wd .. 'Config/Input/', './Config/Input/')
      for _, info in ipairs(inp.Db.createDefaultProfilesSet('./Config/Input/', DCS.getInputProfiles())) do
        Data.createProfile(info)
      end
    end)
    ok, p = pcall(Data.getProfileNameByUnitName, ty)
    if ok and p then return p end
  end
  return nil
end

-- Every valid key combination bound to the salute in the aircraft's profile, and all of the profile's
-- modifiers (the layer needs them to tell "button" from "modifier + button", exactly as the
-- aircraft's own layer does). Also a signature, to see when the bindings change.
local function saluteCombos(names)
  local combos, mods, seen, read = {}, {}, {}, 0
  for _, ty in ipairs(unitTypes(names)) do
    local profile = profileOf(ty)
    local okc, cmds
    if profile then okc, cmds = pcall(inp.Data.getProfileKeyCommands, profile) end
    if okc and type(cmds) == 'table' then
      read = read + 1
      local okm, pm = pcall(inp.Data.getProfileModifiers, profile)
      for name, m in pairs(okm and type(pm) == 'table' and pm or {}) do
        if type(m) == 'table' and m.event and m.deviceId and not mods[name] then mods[name] = m end
      end
      for _, c in ipairs(cmds) do
        if (c.down == saluteId or c.pressed == saluteId or c.up == saluteId) and type(c.combos) == 'table' then
          for dev, list in pairs(c.combos) do
            for _, combo in ipairs(type(list) == 'table' and list or {}) do
              if combo.valid and combo.key then
                local refs = {}
                for _, r in ipairs(combo.reformers or {}) do refs[#refs + 1] = r end
                table.sort(refs)
                local sig = tostring(dev) .. ' ' .. (#refs > 0 and (table.concat(refs, '+') .. '+') or '') .. tostring(combo.key)
                if not seen[sig] then
                  seen[sig] = true
                  combos[#combos + 1] = { dev = dev, key = combo.key, reformers = refs, sig = sig }
                end
              end
            end
          end
        end
      end
    end
  end
  local how = read > 0 and 'read from the aircraft profile' or 'the aircraft profile could not be read'
  if read == 0 and type(inp.Data.createModifier) == 'function' then
    -- at least the stock key: LShift + LCtrl + LAlt + S (Config/Input/Supercarrier)
    local ok = pcall(function()
      for _, k in ipairs({ 'LShift', 'RShift', 'LAlt', 'RAlt', 'LCtrl', 'RCtrl', 'LWin', 'RWin' }) do
        mods[k] = inp.Data.createModifier(k, 'Keyboard')
      end
    end)
    if ok then
      combos[1] = { dev = 'Keyboard', key = 'S', reformers = { 'LAlt', 'LCtrl', 'LShift' }, sig = 'Keyboard LAlt+LCtrl+LShift+S' }
      how = 'the aircraft profile could not be read: the stock key only'
    end
  end
  table.sort(combos, function(a, b) return a.sig < b.sig end)
  local parts, mnames = {}, {}
  for _, c in ipairs(combos) do parts[#parts + 1] = c.sig end
  for name in pairs(mods) do mnames[#mnames + 1] = tostring(name) end
  table.sort(mnames)
  local text = table.concat(parts, '; ')
  return combos, mods, text .. ' | ' .. table.concat(mnames, ','), how, text
end

local function dropLayer(inStack)
  local I = inp.Input
  if not I then return end
  if inStack then pcall(I.removeLayerFromStack, HOLD_LAYER) end
  pcall(I.deleteLayer, HOLD_LAYER)
end

local function buildLayer(combos, mods)
  local I, U = inp.Input, inp.Utils
  dropLayer(layer.on)
  I.createLayer(HOLD_LAYER)
  for _, m in pairs(mods) do I.addReformer(HOLD_LAYER, m.event, m.deviceId, m.switch) end
  local n = 0
  for _, c in ipairs(combos) do
    local devId, ev = I.getDeviceId(c.dev), U.getInputEvent(c.key)
    local refs, known = nil, true
    if #c.reformers > 0 then
      refs = {}
      for _, name in ipairs(c.reformers) do
        local m = mods[name]
        if m then refs[#refs + 1] = { key = m.event, deviceId = m.deviceId } else known = false end
      end
    end
    -- the call the aircraft's own layer gets for this combination, with our command in the salute's place
    if devId and ev and known then
      I.addKeyCombo(HOLD_LAYER, ev, devId, refs, CMD_HELD_SALUTE, nil, nil, nil, nil, nil, nil)
      n = n + 1
    end
  end
  return n
end

local function holdLayerOff(why)
  if not layer.on then return end
  layer.on, layer.sig = false, nil
  dropLayer(true)
  logi('salute key no longer held (' .. why .. ')')
end

-- is the hold layer above every aircraft layer? (nil: can't tell, or there is none to be above)
local function aboveUnitLayers(names)
  local mine, units = nil, {}
  for i, n in ipairs(names) do
    if n == HOLD_LAYER then mine = i elseif isUnitLayer(n) then units[#units + 1] = i end
  end
  if #units == 0 then return nil end
  if not mine then return false end
  if layer.topFirst == nil then return nil end
  for _, u in ipairs(units) do
    if (layer.topFirst and mine > u) or (not layer.topFirst and mine < u) then return false end
  end
  return true
end

local function holdLayerSync(t, want)
  if not want then return holdLayerOff('PriFly let go') end
  if layer.dead or not saluteId or not inputApi() then return end
  if t - layer.checkAt < LAYER_CHECK_S then return end
  layer.checkAt = t
  local ok, err = pcall(function()
    local I = inp.Input
    local names = stackNames()
    -- read the bindings: when the hold starts, and every LAYER_SCAN_S after (nothing bound: only then)
    if t - layer.scanAt >= LAYER_SCAN_S or (not layer.on and not layer.none) then
      layer.scanAt = t
      local combos, mods, sig, how, text = saluteCombos(names)
      layer.none = #combos == 0
      if layer.none then
        holdLayerOff('nothing is bound to the salute any more')
        if not layer.noneSaid then
          layer.noneSaid = true
          logi('salute hold: no key or button is bound to the salute (' .. how .. '); the F8 "Salute!" item is held')
        end
        return
      end
      if sig ~= layer.sig then
        local n = buildLayer(combos, mods)
        I.setTopLayer(HOLD_LAYER)
        layer.on, layer.sig, layer.retops = true, sig, 0
        names = stackNames()
        if names and #names > 1 then
          if names[1] == HOLD_LAYER then layer.topFirst = true elseif names[#names] == HOLD_LAYER then layer.topFirst = false end
        end
        logi(string.format('salute key held: %d binding(s) [%s] (%s); input layers %s: %s', n, text, how,
          layer.topFirst == nil and '(order unknown)' or (layer.topFirst and '(top first)' or '(top last)'),
          names and table.concat(names, ' > ') or 'not readable'))
        say('your salute is held until your taxi instruction (' .. n .. (n == 1 and ' binding)' or ' bindings)'))
        return
      end
    end
    -- still above the aircraft's layer? (a new jet, or a view change, can put its layer back on top)
    if layer.on and names and aboveUnitLayers(names) == false and layer.retops < RETOP_MAX then
      layer.retops = layer.retops + 1
      pcall(I.removeLayerFromStack, HOLD_LAYER)
      I.setTopLayer(HOLD_LAYER)
      local after = stackNames()
      logi("salute key held: layer put back above the aircraft's (" .. layer.retops .. '): ' .. (after and table.concat(after, ' > ') or '?'))
    end
  end)
  if not ok then
    layer.dead = true
    layer.on, layer.sig = false, nil
    dropLayer(true)
    logi('salute hold failed: ' .. tostring(err))
    say('the salute key cannot be held here (the F8 "Salute!" item still is): ' .. tostring(err):sub(1, 100))
  end
end

-- TEST ONLY (Config/CATCC-test.lua chockTest = true): F10 > CATCC chock test > PriFly hold ON / OFF /
-- follow PriFly sets CATCC_CT.hold in the mission's Lua state, so the hold can be tried with nobody in
-- PriFly. ON stands in for "PriFly holds this jet's chocks", OFF for the taxi instruction.
local testHold, testPollAt = nil, -1e9
local function testSwitch(t)
  if not cfg.chockTest or t - testPollAt < 0.5 then return end
  testPollAt = t
  local ok, r = pcall(net.dostring_in, 'server', 'return tostring(CATCC_CT and CATCC_CT.hold or "")')
  local want = (ok and (r == 'on' or r == 'off')) and r or nil
  if want ~= testHold then
    testHold = want
    logi('test switch: PriFly hold ' .. (want or 'follows PriFly'))
  end
end

-- on deck while held: did the pilot just salute? (the gate device's mark, or the pilot figure's arm)
local function pollSalute(t, name, salHeld)
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
  if saluting and not wasSaluting and t - lastSaluteAt >= SALUTE_COOLDOWN_S then
    lastSaluteAt = t
    if name then sendLine('SALUTE ' .. name) end
    -- held and seen as a command: our layer took the key. The pilot figure saluting means the real
    -- salute went through (a path this mod doesn't hold).
    local kept = salHeld and layer.on and how == 'command'
    logi('salute seen (' .. how .. ')' .. (kept and ': held, the deck crew did not get it'
      or (salHeld and ': NOT held, it went through to the deck crew' or '')))
    say(kept and 'ready call sent to PriFly: salute again once you have your taxi instruction' or 'salute reported to PriFly')
  end
  wasSaluting = saluting
end

local inContact, contactWarned, tickErrSaid = false, false, false
local chockWas, unitWas = false, nil

local function tick()
  poll()
  local t = now()
  testSwitch(t)
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
  if v ~= lastSent or t - lastSentAt >= 2 then
    setCmd(CMD_GATE, v)
    if saluteId then setCmd(CMD_SALUTE_ID, saluteId) end
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
  -- chocks: PriFly holds them until the taxi instruction (no word from PriFly: not held)
  local chock = name ~= nil and fresh(t) and chocked[name] == true
  if testHold == 'on' then chock = true elseif testHold == 'off' then chock = false end
  if chock ~= chockWas then
    chockWas = chock
    say(chock and 'PriFly holds your chocks until your taxi instruction' or 'PriFly let go of your chocks')
  end
  if chock and menuState and menuSalute == false and not menuSaluteSaid then
    menuSaluteSaid = true
    say('the F8 "Salute!" item is not held yet: run the CATCC installer again')
  end
  -- another jet (or none): its bindings are read afresh, and chocks asked for stayed with the old one
  local unit = playerUnit()
  if unit ~= unitWas then
    unitWas = unit
    layer.scanAt, layer.none = -1e9, false
    gc.askedAt, gc.tries, gc.ours, gc.still, gc.release = nil, 0, false, nil, false
  end
  local lbUp = (readArg(LB_ARG) or 0) <= 0.6
  -- never on a catapult (launch bar down): there the salute is the launch signal, held by the launch gate
  local salHeld = chock and lbUp
  holdLayerSync(t, salHeld)
  -- (a carrier makes 15 m/s at most: faster than that is not a jet on deck)
  local sp = groundSpeed()
  groundChocks(t, chock, lbUp and (sp == nil or sp < 25), playerType() == HORNET)
  syncMenu(t, chock, salHeld, name)
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
  if hold or chock then pollSalute(t, name, salHeld) else wasSaluting = false end
end

local handler = {}
function handler.onSimulationStart()
  running, checkAt, held, heardAt, lastSent = true, nil, {}, -1e9, nil
  chocked, lbDown = {}, nil
  menuState, menuWarned, startedAt, lastSyncFlags = nil, false, now(), nil
  menuSalute, menuSaluteSaid = nil, false
  wasSaluting, lastSaluteAt = false, -1e9
  saidAt, pendingSay = {}, {}
  inContact, contactWarned, tickErrSaid = false, false, false
  chockWas, unitWas, testHold, testPollAt = false, nil, nil, -1e9
  gc.askedAt, gc.tries, gc.ours, gc.still, gc.release, gc.at = nil, 0, false, nil, false, -1e9
  -- a layer left over from the last mission goes; the bindings are read again
  holdLayerOff('new mission')
  layer.checkAt, layer.scanAt, layer.sig, layer.dead, layer.none, layer.noneSaid, layer.retops = -1e9, -1e9, nil, false, false, false, 0
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
  pcall(holdLayerOff, 'mission stopped')
  close(nil)
end
function handler.onSimulationFrame()
  if not running then return end
  local ok, err = pcall(tick)
  if not ok then
    -- whatever went wrong, the salute key goes back to the pilot
    pcall(holdLayerOff, 'error')
    logi('tick error: ' .. tostring(err))
    if not tickErrSaid then
      tickErrSaid = true
      pcall(say, 'pilot mod error: ' .. tostring(err):sub(1, 120))
    end
  end
end

DCS.setUserCallbacks(handler)
logi('CATCC pilot hook loaded (server ' .. tostring(cfg.host) .. ':' .. tostring(cfg.port) .. ')')
