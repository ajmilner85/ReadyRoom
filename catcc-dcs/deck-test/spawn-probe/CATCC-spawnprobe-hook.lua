-- CATCC SPAWN PROBE (an experiment, not part of the mod): can the server move a DYNAMIC SPAWN onto a spot of its own
-- choosing before the aircraft exists? DCS builds a client's dynamic-spawn aircraft on the server in Lua:
-- Scripts/GeneratorHelper.lua's global createClientAircraftDataServer(parameters) returns the aircraft table that
-- MissionGenerator.createClientAircraft (native) makes. This hook only LOOKS, it changes nothing:
--   1. which Lua state has createClientAircraftDataServer (this hook's own, and each state net.dostring_in reaches:
--      gui, server, mission, config, export), checked at the mission's load and every 5 s until found;
--   2. there, it wraps the function (calls DCS's own and returns its answer unchanged) and keeps what goes in and
--      what comes out; this hook collects that every 2 s and writes it out;
--   3. the hook callbacks around a spawn (onPlayerTryChangeSlot, onPlayerChangeSlot, onCreateAircraftDataNotification)
--      and the carriers' dynamic spawn settings.
-- Everything goes to Saved Games\DCS\Logs\catcc-spawnprobe.log (and a line per event to dcs.log, CATCC-SPAWNPROBE).
-- Install: copy to Saved Games\DCS\Scripts\Hooks\ (with DCS closed). Remove it when done.

local writedir = lfs.writedir()
local LOG = writedir .. 'Logs/catcc-spawnprobe.log'
local STATES = { 'gui', 'server', 'mission', 'config', 'export' }

local function out(s)
  pcall(log.write, 'CATCC-SPAWNPROBE', log.INFO, (#s > 300) and (s:sub(1, 300) .. ' ...') or s)
  local f = io.open(LOG, 'a')
  if f then
    f:write(os.date('%H:%M:%S '), s, '\n')
    f:close()
  end
end

-- the serializer, as code: the same one runs in this state and in whichever state is wrapped
local SER = [[
local function ser(v, depth, seen, ind)
  depth, seen, ind = depth or 0, seen or {}, ind or ''
  local t = type(v)
  if t == 'string' then return string.format('%q', v) end
  if t ~= 'table' then return tostring(v) end
  if seen[v] then return '<cycle>' end
  if depth > 12 then return '<deep>' end
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
local ser = loadstring(SER .. ' return ser')()

-- run in a state: wrap createClientAircraftDataServer once; answers 'wrapped', 'already', or what the name is there
local WRAP = SER .. [[
if CATCC_SPAWNPROBE then return 'already' end
local t = type(createClientAircraftDataServer)
if t ~= 'function' then return t end
local orig = createClientAircraftDataServer
CATCC_SPAWNPROBE = { out = {}, n = 0 }
createClientAircraftDataServer = function(parameters)
  local P = CATCC_SPAWNPROBE
  P.n = P.n + 1
  local okIn, sIn = pcall(ser, parameters)
  P.out[#P.out + 1] = 'CALL ' .. P.n .. ' IN ' .. tostring(sIn)
  local res = { pcall(orig, parameters) }
  if res[1] then
    local okOut, sOut = pcall(ser, res[2])
    P.out[#P.out + 1] = 'CALL ' .. P.n .. ' OUT ' .. tostring(sOut) .. (res[3] ~= nil and (' (and more: ' .. tostring(res[3]) .. ')') or '')
    return unpack(res, 2)
  end
  P.out[#P.out + 1] = 'CALL ' .. P.n .. ' ERROR ' .. tostring(res[2])
  error(res[2], 0)
end
return 'wrapped'
]]
local DRAIN = [[
local P = CATCC_SPAWNPROBE
if not P or #P.out == 0 then return '' end
local s = table.concat(P.out, '\n')
P.out = {}
return s
]]

local found = {} -- state -> true once wrapped there ('self': this hook's own state)
local lastScan, lastDrain = -1e9, -1e9
local scanned = {}

local function runIn(state, code)
  if state == 'self' then
    local f, err = loadstring(code)
    if not f then return false, err end
    return pcall(f)
  end
  local ok, r = pcall(net.dostring_in, state, code)
  return ok, r
end

local function scan(why)
  for _, st in ipairs({ 'self', unpack(STATES) }) do
    if not found[st] then
      local ok, r = runIn(st, WRAP)
      local line = string.format('%s: state %s: %s', why, st, ok and tostring(r) or ('error: ' .. tostring(r)))
      if ok and (r == 'wrapped' or r == 'already') then
        found[st] = true
        out(line .. '  <== createClientAircraftDataServer IS HERE')
      elseif scanned[st] ~= line:sub(#why + 1) then
        scanned[st] = line:sub(#why + 1)
        out(line)
      end
    end
  end
end

local function drain()
  for st in pairs(found) do
    local ok, r = runIn(st, DRAIN)
    if ok and type(r) == 'string' and r ~= '' then
      for chunk in (r .. '\n'):gmatch('(.-)\n') do out('[' .. st .. '] ' .. chunk) end
    elseif not ok then
      out('[' .. st .. '] drain error: ' .. tostring(r))
    end
  end
end

local function pinfo(id)
  local ok, i = pcall(net.get_player_info, id)
  if not ok or type(i) ~= 'table' then return tostring(id) end
  return string.format('%s (id %s, slot %s, side %s)', tostring(i.name), tostring(id), tostring(i.slot), tostring(i.side))
end

local function carriers()
  -- the carriers' dynamic spawn settings, as DCS's own slot screen asks for them (MultiplayerSelectDynamicDialog.lua)
  for _, side in ipairs({ 'blue', 'red' }) do
    local ok, slots = pcall(DCS.getAvailableSlots, side)
    out(string.format('available slots, %s: %s', side, ok and tostring(type(slots) == 'table' and #slots or slots) or ('error: ' .. tostring(slots))))
  end
  for _, id in ipairs({ 5, 1, 2, 3, 4, 6, 7, 8, 9, 10 }) do
    local ok, s = pcall(DCS.getDynamicSpawnSettings, id, false)
    if ok and s ~= nil then out(string.format('getDynamicSpawnSettings(%d, false) = %s', id, ser(s))) end
  end
end

local cb = {}

function cb.onMissionLoadEnd()
  out('---- mission loaded; server: ' .. tostring(DCS.isServer and DCS.isServer()) .. ', multiplayer: ' .. tostring(DCS.isMultiplayer and DCS.isMultiplayer()))
  scanned = {}
  scan('mission load')
  pcall(carriers)
end

function cb.onSimulationStart()
  scan('simulation start')
end

function cb.onSimulationFrame()
  local t = os.clock()
  if t - lastScan > 5 then
    lastScan = t
    local missing = false
    for _, st in ipairs({ 'self', unpack(STATES) }) do if not found[st] then missing = true end end
    if missing then scan('rescan') end
  end
  if t - lastDrain > 2 then
    lastDrain = t
    drain()
  end
end

function cb.onPlayerTryChangeSlot(playerID, side, slotID)
  out(string.format('onPlayerTryChangeSlot: %s -> side %s, slot %s', pinfo(playerID), tostring(side), tostring(slotID)))
  -- (no answer: the decision is left to the other hooks)
end

function cb.onPlayerChangeSlot(playerID)
  out('onPlayerChangeSlot: ' .. pinfo(playerID))
  drain()
end

function cb.onCreateAircraftDataNotification(result)
  out('onCreateAircraftDataNotification: ' .. ser(result))
  drain()
end

function cb.onSimulationStop()
  drain()
  out('---- simulation stopped')
end

DCS.setUserCallbacks(cb)
out('==== probe loaded (DCS started)')
scan('hook load')
