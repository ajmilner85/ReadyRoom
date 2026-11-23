-- CATCC PARKING PROBE (an experiment, not part of the mod): can the CLIENT choose where its dynamic spawn stands?
-- A dynamic spawn is built by the joining client's DCS (the spawn probe, 2026-11-21: no Lua on the server). On the
-- client there is one Lua step: DCS's slot screen (Scripts/UI/MultiplayerSelectRoleMap/MultiplayerSelectAirdromeDialog.lua)
-- calls DCS.create_client_aircraft(params) in the GUI state. The parameters DCS passes have no deck spot, but the
-- native builder (lua-MissionGenerator.dll) names `parking` and `parking_id` among its fields. This hook:
--   1. reads the carrier's terminals (Airbase:getParking() in the mission scripting state: index, where on the deck,
--      taken or free) and picks the TARGET: the free terminal with the highest index (one DCS would not take first);
--   2. wraps DCS.create_client_aircraft in the GUI state: logs what DCS's screen sends, adds parking / parking_id =
--      the target, logs what is passed on and what comes back;
--   3. once a player's aircraft exists, logs where it stands on the deck and the nearest terminal: on the target or not.
-- Everything goes to Saved Games\DCS\Logs\catcc-parkprobe.log (and a line per event to dcs.log, CATCC-PARKPROBE).
-- Needs net.allow_dostring_in "gui" and "server" (the crew test's installer adds them). Install: copy to
-- Saved Games\DCS\Scripts\Hooks\ with DCS closed. Remove it when done.

local writedir = lfs.writedir()
local LOG = writedir .. 'Logs/catcc-parkprobe.log'

local function out(s)
  pcall(log.write, 'CATCC-PARKPROBE', log.INFO, (#s > 300) and (s:sub(1, 300) .. ' ...') or s)
  local f = io.open(LOG, 'a')
  if f then
    f:write(os.date('%H:%M:%S '), s, '\n')
    f:close()
  end
end

local SER = [[
local function ser(v, depth, seen, ind)
  depth, seen, ind = depth or 0, seen or {}, ind or ''
  local t = type(v)
  if t == 'string' then return string.format('%q', v) end
  if t ~= 'table' then return tostring(v) end
  if seen[v] then return '<cycle>' end
  if depth > 8 then return '<deep>' end
  seen[v] = true
  local keys = {}
  for k in pairs(v) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b)
    local ta, tb = type(a), type(b)
    if ta ~= tb then return ta < tb end
    if ta == 'number' or ta == 'string' then return a < b end
    return tostring(a) < tostring(b)
  end)
  local parts = {}
  for _, k in ipairs(keys) do
    parts[#parts + 1] = ind .. '  [' .. (type(k) == 'string' and string.format('%q', k) or tostring(k)) .. '] = ' .. ser(v[k], depth + 1, seen, ind .. '  ')
  end
  seen[v] = nil
  if #parts == 0 then return '{}' end
  return '{\n' .. table.concat(parts, ',\n') .. '\n' .. ind .. '}'
end
]]

-- in the mission scripting state: the first carrier's terminals, in its own frame (forward, to starboard), and the target
local TERMINALS = [[
-- (a terminal's point on the ship: DCS's vTerminalPos read whichever way puts it nearest the ship (the run of
-- 2026-11-21: read as x / z it came out 290 km away); heights left out)
local function tp(v, p)
  local c = { { x = v.x, y = p.y, z = v.z or 0 }, { x = v.x, y = p.y, z = v.y or 0 }, { x = v.z or 0, y = p.y, z = v.x }, { x = v.y or 0, y = p.y, z = v.x } }
  local best, bd
  for i, q in ipairs(c) do
    local d = (q.x - p.x) ^ 2 + (q.z - p.z) ^ 2
    if d < 400 * 400 then best, bd = i, d break end -- (the first reading in this order that lands on the ship)
    if not bd or d < bd then best, bd = i, d end
  end
  return c[best], ({ 'x / z', 'x / y', 'z / x', 'y / x' })[best]
end
local function frame(ab)
  local pos = ab:getPosition()
  return function(v)
    local dx, dy, dz = v.x - pos.p.x, v.y - pos.p.y, v.z - pos.p.z
    return dx * pos.x.x + dy * pos.x.y + dz * pos.x.z, dx * pos.z.x + dy * pos.z.y + dz * pos.z.z
  end, pos.p
end
local lines, target, ship = {}, nil, nil
for _, side in ipairs({ 2, 1 }) do
  for _, ab in ipairs(coalition.getAirbases(side) or {}) do
    local d = ab:getDesc()
    if not ship and d and d.category == Airbase.Category.SHIP then
      local okp, park = pcall(ab.getParking, ab)
      if okp and type(park) == 'table' and #park > 0 then
        ship = ab:getName()
        local f, p = frame(ab)
        table.sort(park, function(a, b) return (a.Term_Index or 0) < (b.Term_Index or 0) end)
        -- (the target: a free terminal of the kind the carrier's first terminal is (a jet's: the run of 2026-11-21 took
        -- terminal 48, of another kind, a Hornet's spawn could not use it), the one with the highest index)
        local jetType
        for _, t in ipairs(park) do if not jetType and (t.Term_Index or -1) > 0 then jetType = t.Term_Type end end
        local v1 = park[1] and park[1].vTerminalPos
        lines[#lines + 1] = string.format('(the ship at x %.1f, y %.1f, z %.1f; a terminal as DCS gives it: x %s, y %s, z %s)', p.x, p.y, p.z, tostring(v1 and v1.x), tostring(v1 and v1.y), tostring(v1 and v1.z))
        for _, t in ipairs(park) do
          local q, how = tp(t.vTerminalPos, p)
          local fw, st = f(q)
          lines[#lines + 1] = string.format('terminal %s: type %s, %.1f m forward, %.1f m to starboard, %s (read as %s)', tostring(t.Term_Index), tostring(t.Term_Type), fw, st, t.TO_AC and 'TAKEN' or 'free', how)
          if not t.TO_AC and t.Term_Type == jetType and (t.Term_Index or -1) > 0 then target = t.Term_Index end
        end
      end
    end
  end
end
CATCC_PARKPROBE = { ship = ship, target = target }
return tostring(ship) .. '|' .. tostring(target) .. '|' .. table.concat(lines, '\n')
]]

-- in the mission scripting state: every player's aircraft on the carrier, where it stands, the nearest terminal
local WHERE = [[
-- (a terminal's point on the ship: DCS's vTerminalPos read whichever way puts it nearest the ship (the run of
-- 2026-11-21: read as x / z it came out 290 km away); heights left out)
local function tp(v, p)
  local c = { { x = v.x, y = p.y, z = v.z or 0 }, { x = v.x, y = p.y, z = v.y or 0 }, { x = v.z or 0, y = p.y, z = v.x }, { x = v.y or 0, y = p.y, z = v.x } }
  local best, bd
  for i, q in ipairs(c) do
    local d = (q.x - p.x) ^ 2 + (q.z - p.z) ^ 2
    if d < 400 * 400 then best, bd = i, d break end -- (the first reading in this order that lands on the ship)
    if not bd or d < bd then best, bd = i, d end
  end
  return c[best], ({ 'x / z', 'x / y', 'z / x', 'y / x' })[best]
end
local P = CATCC_PARKPROBE
if not (P and P.ship) then return '' end
local ab = Airbase.getByName(P.ship)
if not ab then return '' end
local pos = ab:getPosition()
local function f(v)
  local dx, dy, dz = v.x - pos.p.x, v.y - pos.p.y, v.z - pos.p.z
  return dx * pos.x.x + dy * pos.x.y + dz * pos.x.z, dx * pos.z.x + dy * pos.z.y + dz * pos.z.z
end
local okp, park = pcall(ab.getParking, ab) -- (all terminals: getParking(true) would leave out the taken ones)
if not okp then park = {} end
local out = {}
for _, side in ipairs({ 2, 1 }) do
  for _, u in ipairs(coalition.getPlayers(side) or {}) do
    local fw, st = f(u:getPoint())
    local best, bd
    for _, t in ipairs(park or {}) do
      local tf, ts = f((tp(t.vTerminalPos, pos.p)))
      local d = math.sqrt((tf - fw) ^ 2 + (ts - st) ^ 2)
      if not bd or d < bd then best, bd = t.Term_Index, d end
    end
    out[#out + 1] = string.format('%s (%s, unit %s): %.1f m forward, %.1f m to starboard; nearest terminal %s at %.1f m; the target was %s: %s',
      tostring(u:getPlayerName()), tostring(u:getTypeName()), tostring(u:getID()), fw, st, tostring(best), bd or -1, tostring(P.target),
      (bd and bd < 3 and tostring(best) == tostring(P.target)) and 'ON THE TARGET' or 'not on the target')
  end
end
return table.concat(out, '\n')
]]

-- in the GUI state: wrap DCS.create_client_aircraft (once), set the target
local function wrapCode(target)
  return SER .. [[
local target = ]] .. string.format('%q', tostring(target)) .. [[

if type(DCS) ~= 'table' or type(DCS.create_client_aircraft) ~= 'function' then return 'no DCS.create_client_aircraft here: ' .. type(DCS) end
if not CATCC_PP then
  CATCC_PP = { out = {}, n = 0, orig = DCS.create_client_aircraft }
  local wrapper = function(p)
    local W = CATCC_PP
    W.n = W.n + 1
    W.out[#W.out + 1] = 'CALL ' .. W.n .. ' FROM DCS: ' .. ser(p)
    if type(p) == 'table' and W.target and W.target ~= 'nil' then
      p.parking = W.target
      p.parking_id = W.target
      if type(p.addProps) == 'table' then
        p.addProps.parking = W.target
        p.addProps.parking_id = W.target
      end
      W.out[#W.out + 1] = 'CALL ' .. W.n .. ' PASSED ON with parking = parking_id = ' .. W.target
    end
    local res = { pcall(W.orig, p) }
    W.out[#W.out + 1] = 'CALL ' .. W.n .. ' ANSWER: ' .. tostring(res[1]) .. ' ' .. ser(res[2]) .. (res[3] ~= nil and (' ' .. ser(res[3])) or '')
    if not res[1] then error(res[2], 0) end
    return unpack(res, 2)
  end
  DCS.create_client_aircraft = wrapper
  CATCC_PP.wrapper = wrapper
end
CATCC_PP.target = target
return 'wrapped: ' .. tostring(DCS.create_client_aircraft == CATCC_PP.wrapper) .. ', target ' .. target
]]
end

local DRAIN = [[
local W = CATCC_PP
if not W or #W.out == 0 then return '' end
local s = table.concat(W.out, '\n')
W.out = {}
return s
]]

local function runIn(state, code)
  local ok, r = pcall(net.dostring_in, state, code)
  return ok, r
end

local S = { ready = false, lastTry = -1e9, lastDrain = -1e9, lastWhere = -1e9, where = {} }

local function setup()
  local ok, r = runIn('server', TERMINALS)
  if not ok or type(r) ~= 'string' then
    out('terminals: ' .. tostring(r))
    return
  end
  local ship, target, lines = r:match('^(.-)|(.-)|(.*)$')
  if not ship or ship == 'nil' then
    out('terminals: no carrier with terminals yet (' .. tostring(r):sub(1, 200) .. ')')
    return
  end
  out(string.format('carrier %s; target terminal %s (the free one of the kind for jets with the highest index)', ship, target))
  for l in (lines .. '\n'):gmatch('(.-)\n') do if l ~= '' then out('  ' .. l) end end
  local okw, w = runIn('gui', wrapCode(target))
  out('GUI state: ' .. tostring(okw and w or ('error: ' .. tostring(w))))
  S.ready = okw and type(w) == 'string' and w:match('^wrapped: true') ~= nil
end

local function drain()
  local ok, r = runIn('gui', DRAIN)
  if ok and type(r) == 'string' and r ~= '' then
    for l in (r .. '\n'):gmatch('(.-)\n') do out('[gui] ' .. l) end
  end
end

local function where()
  local ok, r = runIn('server', WHERE)
  if not ok or type(r) ~= 'string' or r == '' then return end
  for l in (r .. '\n'):gmatch('(.-)\n') do
    if l ~= '' then
      local who = l:match('^(.-) %(')
      -- (logged when it changes by more than a rounding: the jet settles, then stands)
      local key = l:gsub('%-?%d+%.%d', function(n) return string.format('%.0f', tonumber(n)) end)
      if S.where[who] ~= key then
        S.where[who] = key
        out('player: ' .. l)
      end
    end
  end
end

local cb = {}

function cb.onMissionLoadEnd()
  out('---- mission loaded; server: ' .. tostring(DCS.isServer and DCS.isServer()) .. ', multiplayer: ' .. tostring(DCS.isMultiplayer and DCS.isMultiplayer()))
  S.ready, S.lastTry, S.where = false, -1e9, {}
end

function cb.onSimulationFrame()
  local t = os.clock()
  if not S.ready and t - S.lastTry > 5 then
    S.lastTry = t
    setup()
  end
  if t - S.lastDrain > 1 then
    S.lastDrain = t
    drain()
  end
  if t - S.lastWhere > 3 then
    S.lastWhere = t
    where()
  end
end

function cb.onPlayerChangeSlot(playerID)
  local okn, n = pcall(net.get_player_info, playerID, 'name')
  local oks, s = pcall(net.get_player_info, playerID, 'slot')
  out(string.format('onPlayerChangeSlot: %s -> slot %s', tostring(okn and n), tostring(oks and s)))
  drain()
end

function cb.onSimulationStop()
  drain()
  out('---- simulation stopped')
end

DCS.setUserCallbacks(cb)
out('==== probe loaded (DCS started)')
