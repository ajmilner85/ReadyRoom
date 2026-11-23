-- Offline stand-ins for the ATC probe's hook (CATCC-atcprobe-hook.lua), run under fengari (Lua 5.3) by
-- catcc-dcs/test/atcprobe.test.ts. Injected globals: HOOK_SRC (the hook), ROUTES_SRC (crewtest_routes.lua), SCRIPT
-- (what to do, Lua). Stands in for: DCS's hook environment (lfs, log, net, DCS, io.open), the mission scripting
-- state (Unit, Airbase, coalition, trigger: run in this same state through net.dostring_in), the native module (a
-- Lua table with catcc_atcprobe.dll's API over a model of the ATC), and DCS's own choice of a terminal for a slot.
-- THE MODEL OF DCS'S CHOICE, as runs 1 and 2 showed it: DCS has an order of its own (ORDER: spot 5, 6, then the
-- rest); a spawn gets the first terminal of that order that has no aircraft on it, no static on it, and is not HELD
-- BY DCS'S OWN CHOOSER (t.held: set by setClientSpawnOnTerminalMiss, the stand-in of woATC's function, which takes
-- the first such terminal for client 0 and the id as mission id). A terminal taken by a raw acquire() is NOT honoured
-- (overwritten). Switches:
--   OPT.freeGivesBack = false   free() empties the terminal but DCS's hold stays, until procTerminalStatus(0, .., false)
--   OPT.statusGivesBack = false ... and that does not lift it either
--   OPT.neverTarget = n         the chooser never hands out spot n
--   OPT.spawnIgnoresHold        the spawn does not honour the chooser's holds after all
--   OPT.statusHolds             a terminal marked through procTerminalStatus(id, .., true) is honoured by the spawn
--   OPT.spawnOnChooses          setClientSpawnOnTerminal is a chooser too
--   OPT.honourCall = 'spawnonpoint'   setClientSpawnOnTerminalByPoint gives the terminal nearest the (world) point,
--                               and the next spawn goes there
-- In the "slot per spot" mission a slot's own spot comes first in the order.
-- Other OPT: scramble (the ATC's list is not in Lua's order), noNative, badList, noPositions, mission (its name),
-- server / mp, slots (the slot ids the user takes, in turn), refuse (how many times another hook refuses the slot).

math.atan2 = math.atan2 or math.atan
OPT = { server = true, mp = true, mission = 'Deck Spotting Test - dynamic spawn', freeGivesBack = true, statusGivesBack = true }
local ORDER = { 5, 6 }
for i = 1, 40 do if i ~= 5 and i ~= 6 then ORDER[#ORDER + 1] = i end end
LINES, CHAT, CALLS = {}, {}, {}
local CLOCK = 0

-- ---------------------------------------------------------------- the hook's environment
lfs = { writedir = function() return 'W/' end }
log = { INFO = 1, write = function(_, _, msg) LINES[#LINES + 1] = 'DCSLOG ' .. msg end }
CASEFILE = nil
io.open = function(path, mode)
  if path == 'W/Logs/catcc-atcprobe-case.txt' then
    if mode == 'a' then
      return { write = function(_, text) CASEFILE = (CASEFILE or '') .. text end, close = function() end }
    end
    if not CASEFILE then return nil, 'No such file or directory' end
    local text = CASEFILE
    return { lines = function() return text:gmatch('([^\n]*)\n') end, close = function() end }
  end
  assert(path == 'W/Logs/catcc-atcprobe.log', 'the log is written elsewhere: ' .. tostring(path))
  local parts = {}
  return { write = function(_, ...) for _, v in ipairs({ ... }) do parts[#parts + 1] = v end end,
    close = function() LINES[#LINES + 1] = (table.concat(parts):gsub('\n$', '')) end }
end
os.date = function() return '00:00:00 ' end
os.clock = function() return CLOCK end
loadfile = function(path)
  if path == 'W/Scripts/CATCC/crewtest_routes.lua' then return load(ROUTES_SRC) end
  return nil, 'no such file ' .. tostring(path)
end

-- ---------------------------------------------------------------- the ship and the mission scripting state
local HC = 0.5
local function v(x, y, z) return { x = x, y = y, z = z } end
local SX, SZ = 1000, 2000
local shipX, shipY, shipZ = v(math.cos(HC), 0, math.sin(HC)), v(0, 1, 0), v(-math.sin(HC), 0, math.cos(HC))
local function toWorld(f, u, s) return v(SX + f * shipX.x + s * shipZ.x, u, SZ + f * shipX.z + s * shipZ.z) end
local SHIP_OBJ = 16777473
local nextObj = 16777729

local ROUTES = load(ROUTES_SRC)()
-- the model of the ATC: 48 terminals in LUA's order: the 40 deck spots (Term_Index 1..31, then -1), 8 helicopter ones
TERMS = {}
local function blank(t)
  t.client, t.order, t.miss, t.type, t.obj, t.waiting = 0, t.order or 0, '', '', false, false
  if t.held == nil then t.held = false end
  return t
end
for _, s in ipairs(ROUTES) do
  if type(s) == 'table' and s.spot then TERMS[s.spot] = blank({ spot = s.spot, ix = s.spot <= 31 and s.spot or -1, typ = 72, x = s.x, y = 20.149, z = s.z }) end
end
for k = 1, 8 do TERMS[40 + k] = blank({ ix = 40 + k, typ = 40, x = -60 + 9 * k, y = 20.149, z = -31 }) end
-- the ATC's own list: place -> terminal
local LIST = {}
local function buildList()
  LIST = {}
  for i = 1, #TERMS do LIST[i] = TERMS[OPT.scramble and (#TERMS + 1 - i) or i] end
end

local player = nil
local statics = {}
local function isFree(t) return t.client == 0 and t.miss == '' and not t.obj end
local function blocked(t)
  for _, st in pairs(statics) do
    if math.abs(st.x - t.x) < 3 and math.abs(st.z - t.z) < 3 then return true end
  end
  return false
end

local CV = {
  id_ = SHIP_OBJ,
  getPoint = function() return v(SX, 0, SZ) end,
  getPosition = function() return { p = v(SX, 0, SZ), x = shipX, y = shipY, z = shipZ } end,
  getName = function() return 'CVN-71' end, isExist = function() return true end,
  getCountry = function() return 2 end, getID = function() return 5 end, getTypeName = function() return 'CVN_71' end,
}
local AB = {
  getDesc = function() return { category = 1 } end,
  getName = function() return 'CVN-71' end,
  getParking = function(_, onlyFree)
    local res = {}
    for _, t in ipairs(TERMS) do
      if not onlyFree or isFree(t) then res[#res + 1] = { Term_Index = t.ix, Term_Index_0 = t.num, Term_Type = t.typ, vTerminalPos = v(t.x, t.y, t.z), TO_AC = t.obj } end
    end
    return res
  end,
}
Unit = { getByName = function(n) return n == 'CVN-71' and CV or nil end }
Airbase = { Category = { SHIP = 1 }, getByName = function(n) return n == 'CVN-71' and AB or nil end }
StaticObject = { getByName = function(n)
  if not statics[n] then return nil end
  return { destroy = function() statics[n] = nil end }
end }
coalition = {
  getAirbases = function(side) return side == 2 and { AB } or {} end,
  addStaticObject = function(_, d)
    assert(d.linkUnit == 5 and d.type == 'FA-18C_hornet' and d.category == 'Planes')
    statics[d.name] = { x = d.offsets.x, z = d.offsets.y }
    return {}
  end,
  getPlayers = function(side)
    if side ~= 2 or not player then return {} end
    local p = player
    return { { id_ = p.obj, getPoint = function() return toWorld(p.x, 22, p.z) end, getPlayerName = function() return 'Tester' end,
      getTypeName = function() return 'FA-18C_hornet' end, getID = function() return p.slot end } }
  end,
}
trigger = { action = { outText = function(text) CHAT[#CHAT + 1] = text end } }

local cb
local curSlot = ''
net = {
  dostring_in = function(state, code)
    assert(state == 'server', 'no such state ' .. tostring(state))
    return load(code)()
  end,
  send_chat = function() end,
  get_player_info = function(_, what) return what == 'name' and 'Tester' or curSlot end,
}
DCS = {
  isServer = function() return OPT.server end, isMultiplayer = function() return OPT.mp end,
  getMissionName = function() return OPT.mission end, getMissionFilename = function() return 'X:/Missions/' .. OPT.mission .. '.miz' end,
  setUserCallbacks = function(t) cb = t end,
}

-- ---------------------------------------------------------------- the native module's stand-in
local attached = false
local taken, orders = {}, {}
local function ptr(t)
  for i, x in ipairs(TERMS) do if x == t then return string.format('00000000%08X', 0x1000 + 0x200 * i) end end
  return '0000000000000000'
end
local function place(t)
  for i, x in ipairs(LIST) do if x == t then return i end end
  return t and -1 or 0
end
local function term(i) return attached and LIST[i] or nil end
local NOATC, NOTERM = 'no ATC (attach first; a new mission needs a new attach)', 'no such terminal (terminals() first)'
local NATIVE = {}
local function rec(name, ...)
  local a = { ... }
  for k = 1, #a do a[k] = tostring(a[k]) end
  CALLS[#CALLS + 1] = name .. '(' .. table.concat(a, ',') .. ')'
end
function NATIVE.info() return { version = 'standin', thread = 1, missing = OPT.missing or {} } end
function NATIVE.setlog() end
function NATIVE.attach(id)
  rec('attach', id)
  if id ~= SHIP_OBJ then return nil, 'no object with that id in the world\'s register' end
  attached = true
  return { cls = '.?AVwoShip@@', kind = 32, atc = '00000000DEADBEEF', atcCls = '.?AVwAirServiceATC@@' }
end
function NATIVE.detach() attached = false taken, orders = {}, {} return true end
function NATIVE.terminals()
  if not attached then return nil, NOATC end
  if OPT.badList then return nil, 'the terminal list is not laid out as guessed (G1): the count is not its size' end
  local res = { n = #LIST, size = #LIST, t = {} }
  for i, t in ipairs(LIST) do
    res.t[i] = { i = i, ptr = ptr(t), cls = '.?AVwsAdrTerminal@@', vt = true, free = isFree(t), client = t.client, order = t.order, miss = t.miss, type = t.type, obj = t.obj,
      dead = (not isFree(t)) and not t.obj and not t.waiting }
  end
  return res
end
function NATIVE.foreach(ret)
  if not attached then return nil, NOATC end
  local res = { n = ret and 1 or #LIST, same = not ret, t = {} }
  for i = 1, res.n do res.t[i] = i end
  return res
end
function NATIVE.byindex(which, n)
  if not attached then return nil, NOATC end
  for _, t in ipairs(TERMS) do
    if which == 1 and t.ix == n and n > 0 then return place(t), ptr(t) end
    if which == 2 and t.ix == -1 and t.spot == n then return place(t), ptr(t) end
  end
  return 0, '0000000000000000'
end
function NATIVE.peek(i, _, len)
  local t = term(i)
  if not t then return nil, NOTERM end
  local s = string.format('%08x%08x%02x', math.floor(t.client) % 4294967296, (math.floor(t.order) + 4294967296) % 4294967296, t.held and 1 or 0)
  return (s .. string.rep('00', len)):sub(1, len * 2)
end
function NATIVE.locate(i, x, z, tol)
  local t = term(i)
  if not t then return nil, NOTERM end
  if not OPT.noPositions and math.abs(t.x - x) < (tol or 0.02) and math.abs(t.z - z) < (tol or 0.02) then return 176, 'f8' end
  return nil, 'the two numbers are not in the terminal\'s first 512 bytes'
end
function NATIVE.clients()
  if not attached then return nil, NOATC end
  local ids = {}
  for _, t in ipairs(TERMS) do if t.obj then ids[#ids + 1] = t.client end end
  return { size = #ids, walked = #ids, ids = ids }
end
function NATIVE.canspawn(id) rec('canspawn', id) return true end
function NATIVE.termbyclient(id, flag)
  rec('termbyclient', id, flag)
  for _, t in ipairs(TERMS) do if t.obj and t.client == id then return t.ix end end
  return -1
end
function NATIVE.forced(id, flag)
  rec('forced', id, flag)
  if OPT.forcedRaises then return nil, 'it raised an exception' end
  return 0, '0000000000000000'
end
function NATIVE.acquire(i, id, miss, typ)
  local t = term(i)
  if not t then return nil, NOTERM end
  rec('acquire', i, id, miss, typ)
  if OPT.acquireRaises then return nil, 'acquire raised an exception' end
  if id == 0 and not miss then return nil, 'client id 0 needs a mission id' end
  t.client, t.miss, t.type = id, miss or '', typ or ''
  taken[t] = { id = id, miss = miss or '' }
  return true
end
function NATIVE.waitspawn(i, on)
  local t = term(i)
  if not t then return nil, NOTERM end
  rec('waitspawn', i, on)
  if not taken[t] then return nil, 'wait_for_objects_spawn is not exported, or the terminal is not one acquire() took' end
  t.waiting = on
  return true
end
function NATIVE.freeforme(i, who)
  local t = term(i)
  if not t then return nil, NOTERM end
  if type(who) == 'string' then return isFree(t) or t.miss == who end
  return t.client == 0 or t.client == who
end
function NATIVE.acquiredby(i, who)
  local t = term(i)
  if not t then return nil, NOTERM end
  if type(who) == 'string' then return t.miss ~= '' and t.miss == who end
  return t.client == who and not isFree(t)
end
function NATIVE.release(i)
  local t = term(i)
  if not t then return nil, NOTERM end
  rec('release', i)
  if OPT.releaseRaises then return nil, 'free raised an exception' end
  blank(t)
  if OPT.freeGivesBack then t.held = false end
  taken[t] = nil
  return true
end
-- woATC::procTerminalStatus for a terminal: (client, its Term_Index, its number, taken)
function NATIVE.termstatus(i, client, isTaken)
  local t = term(i)
  if not t then return nil, NOTERM end
  rec('termstatus', i, client, isTaken)
  if isTaken then
    t.client, t.miss, t.type = client, '', ''
    if OPT.statusHolds then t.held = true end
    taken[t] = { id = client, miss = '' }
  else
    blank(t)
    if OPT.statusGivesBack then t.held = false end
  end
  return t.ix, t.spot or 0
end
-- DCS's own chooser: the first terminal of its order that it can give; taken for client 0 and the id as mission id
local function chooser(id, typ, asClient)
  if typ ~= 'FA-18C_hornet' then return nil end
  for _, n in ipairs(ORDER) do
    local t = TERMS[n]
    if isFree(t) and not t.held and not blocked(t) and n ~= OPT.neverTarget then
      if asClient then t.client = id else t.miss = string.format('%d', id) end
      t.type, t.held = typ, true
      taken[t] = { id = t.client, miss = t.miss }
      return t
    end
  end
  return nil
end
function NATIVE.setorder(i, n)
  local t = term(i)
  if not t then return nil, NOTERM end
  rec('setorder', i, n)
  local was = t.order
  if orders[t] == nil then orders[t] = was end
  t.order = n
  return was
end
function NATIVE.undo()
  rec('undo')
  local freed, kept, restored = 0, 0, 0
  for t, k in pairs(taken) do
    if t.client == k.id and t.miss == k.miss and not t.obj then
      blank(t)
      if OPT.freeGivesBack then t.held = false end
      freed = freed + 1
    else
      kept = kept + 1
    end
  end
  for t, was in pairs(orders) do t.order = was restored = restored + 1 end
  taken, orders = {}, {}
  return freed, kept, restored
end
function NATIVE.spawnon(id)
  rec('spawnon', id)
  local t = OPT.spawnOnChooses and chooser(id, 'FA-18C_hornet', true) or nil
  return place(t), ptr(t)
end
function NATIVE.spawnonfree(id, s, f)
  rec('spawnonfree', id, s, f)
  return 0, '0000000000000000'
end
function NATIVE.spawnonmiss(id, s, f)
  rec('spawnonmiss', id, s, f)
  if OPT.chooserRaises and #CALLS > OPT.chooserRaises then return nil, 'it raised an exception' end
  assert(f == 16000)
  local t = chooser(id, s, false)
  return place(t), ptr(t)
end
function NATIVE.spawnonpoint(id, x, y, z)
  rec('spawnonpoint', id, string.format('%.2f', x), string.format('%.2f', y), string.format('%.2f', z))
  if OPT.honourCall ~= 'spawnonpoint' then return 0, '0000000000000000' end
  local best, bd
  for _, t in ipairs(LIST) do
    local w = toWorld(t.x, 0, t.z)
    local d = math.sqrt((w.x - x) ^ 2 + (w.z - z) ^ 2)
    if not bd or d < bd then best, bd = t, d end
  end
  if bd > 2 then return 0, '0000000000000000' end
  OPT.forced = best
  best.miss, best.type, best.held = string.format('%d', id), 'FA-18C_hornet', true
  taken[best] = { id = 0, miss = best.miss }
  return place(best), ptr(best)
end
function NATIVE.termof(id)
  if not attached then return nil, NOATC end
  for _, t in ipairs(LIST) do if t.obj and t.client == id then return place(t), ptr(t), '.?AVwHumanAircraft@@' end end
  return 0, '0000000000000000', '.?AVwHumanAircraft@@'
end
package.loadlib = function(path, entry)
  assert(path == 'W/Scripts\\CATCC\\bin\\catcc_atcprobe.dll' and entry == 'luaopen_catcc_atcprobe', 'loaded from elsewhere: ' .. tostring(path))
  if OPT.noNative then return nil, 'The specified module could not be found.' end
  return function() return NATIVE end
end

-- ---------------------------------------------------------------- DCS's own choice of a terminal for a slot
local function ownSpot(slot)
  local n = tonumber(slot)
  if not OPT.mission:find('slot per spot', 1, true) then return nil end
  if n == 20 then return 1 end
  if n and n > 200 and n <= 240 then return n - 200 end
end
function removePlayer()
  for _, t in ipairs(TERMS) do if player and t.obj and t.client == player.obj then blank(t) end end
  player = nil
  curSlot = ''
end
function spawnPlayer(slot)
  local pick
  local function usable(t)
    if t.typ ~= 72 or t.obj or blocked(t) then return false end
    if t.held and not OPT.spawnIgnoresHold then return false end
    return true
  end
  if OPT.forced and not OPT.forced.obj then pick = OPT.forced end
  OPT.forced = nil
  if not pick then
    local first = { ownSpot(slot) }
    for _, n in ipairs(ORDER) do first[#first + 1] = n end
    for _, n in ipairs(first) do
      if TERMS[n] and usable(TERMS[n]) then pick = TERMS[n] break end
    end
  end
  if not pick then return false end
  nextObj = nextObj + 256
  pick.client, pick.miss, pick.type, pick.obj, pick.waiting, pick.held = nextObj, slot, 'FA-18C_hornet', true, false, false
  player = { x = pick.x, z = pick.z, obj = nextObj, slot = tonumber(slot) or 0 }
  return true
end

-- ---------------------------------------------------------------- the run
function boot()
  buildList()
  assert(load(HOOK_SRC, 'hook'))()
  assert(cb and cb.onMissionLoadEnd and cb.onSimulationFrame and cb.onSimulationStop and cb.onPlayerTryChangeSlot, 'the hook set no callbacks')
  cb.onMissionLoadEnd()
end
-- The clock runs on; the user does as the chat says: 2 s after "ready" / "spawn again" / "Take a slot again" he
-- asks for a slot (leaving the one he has); 3 s later his aircraft is there. user = false: nobody does anything.
local slotN, refused = 0, 0
function takeSlot()
  slotN = slotN + 1
  local list = OPT.slots or { '1000003', '1000004', '1000005', '1000006', '1000007', '1000008', '1000009', '1000010', '1000011', '1000012', '1000013', '1000014' }
  return list[(slotN - 1) % #list + 1]
end
function advance(seconds, user)
  local chatSeen = #CHAT
  local tryAt, spawnAt, slot
  for _ = 1, seconds * 4 do
    if FROZEN then return end
    CLOCK = CLOCK + 0.25
    cb.onSimulationFrame()
    while chatSeen < #CHAT do
      chatSeen = chatSeen + 1
      local text = CHAT[chatSeen]
      if user ~= false and (text:find('CATCC test: ready', 1, true) or text:find('spawn again', 1, true) or text:find('Take a slot again', 1, true)) then tryAt = CLOCK + 2 end
    end
    if tryAt and CLOCK >= tryAt then
      tryAt = nil
      removePlayer()
      slot = takeSlot()
      local r = cb.onPlayerTryChangeSlot(1, 2, slot)
      assert(r == nil, 'the hook decided about the slot itself')
      if refused < (OPT.refuse or 0) then
        refused = refused + 1
      else
        curSlot = slot
        cb.onPlayerChangeSlot(1)
        spawnAt = CLOCK + 3
      end
    end
    if spawnAt and CLOCK >= spawnAt then
      spawnAt = nil
      spawnPlayer(slot)
    end
  end
end
-- a slot asked for, by hand
function DCSTRY(slot)
  if cb.onPlayerTryChangeSlot then return cb.onPlayerTryChangeSlot(1, 2, slot) end
end
function toSpectators()
  removePlayer()
  cb.onPlayerTryChangeSlot(1, 0, '')
end
function stop() cb.onSimulationStop() end
-- how the model stands: "<terminals taken without an object>/<held by DCS's chooser>/<statics>"
function state()
  local fake, held, st = 0, 0, 0
  for _, t in ipairs(TERMS) do
    if not isFree(t) and not t.obj then fake = fake + 1 end
    if t.held then held = held + 1 end
  end
  for _ in pairs(statics) do st = st + 1 end
  return fake .. '/' .. held .. '/' .. st
end
function playerSpot()
  if not player then return 'none' end
  for i, t in ipairs(TERMS) do if t.x == player.x and t.z == player.z then return tostring(i) end end
  return '?'
end

-- ---------------------------------------------------------------- ROUND 9's MODEL (it replaces what is above)
-- As runs 2 to 5 showed. Each jet terminal has an ORDER NUMBER (the word at +0x8c: its deck spot's number) and a
-- BYTE (at +0x94).
--   A REAL SPAWN takes the terminal with the lowest number from 5 on that has no aircraft and no static on it and is
--   not held by DCS's chooser. A record that says "taken" for a made-up client does not keep it off (run 5). The
--   terminal gets the aircraft, its byte 1; its number stays. THE JET APPEARS AT THE NUMBER'S PLACE (run 6: the
--   number is a place in the spawn table: the first point of that route), not at the terminal's own position.
--   DCS's CHOOSER (setClientSpawnOnTerminalMiss): the lowest number on offer from 5 on (a terminal taken for a client
--   with its byte set is off offer: run 5, way A moved the chooser), and of the terminals that have that number the
--   FIRST IN THE LIST (run 4: spot 15). The terminal gets client 0, the id as mission id, the type, ITS Term_Index
--   AS ITS NUMBER, its byte 1, and is held.
--   procInitTerminals (initterms / initrows) finds a record's terminal by its Term_Index, and a spawn-only terminal
--   (Term_Index -1) by its NUMBER: so a spawn-only terminal's number cannot be changed by a record, and one whose
--   number the chooser has overwritten (-1) is reached by no record any more (run 5). A record that is not taken
--   empties the terminal and lifts the chooser's hold.
--   free(): empties a terminal; number, byte and hold stay.
-- THE FIRST SPAWN OF A MISSION (run 7): DCS does something once with every terminal's number; with a number outside the
-- spawn table (1 to 40) on a jet terminal at that moment DCS FREEZES (FROZEN: the stand-ins then do nothing more
-- until the next mission start). Numbers within the table are fine (run 6), and so is everything after the first spawn
-- (run 8).
--   OPT.negOk = true           a negative number does not freeze the first spawn (only one above the table does)
--   OPT.lowFreezes = true      a number repeated on several terminals freezes it too
--   OPT.primeWorks = true      one call of DCS's chooser does that once-a-mission work
-- Switches:
--   OPT.numbersIgnored = true  a real spawn goes by the spots' own order, whatever the numbers say (way B cannot work)
--   OPT.floor = n              the lowest number a real spawn considers (default 5)
--   OPT.oneWorks = true        ... but number 1 on a terminal that is not one of spots 1 to 4 is considered (way B2)
-- Spots 15 and 17 have each other's Term_Index here, as spot 15 has 17 in DCS.
unpack = unpack or table.unpack
TERMS[15].ix, TERMS[17].ix = 17, 15
for _, t in ipairs(TERMS) do
  t.num0 = t.spot or t.ix
  t.num, t.flag, t.hold = t.num0, 0, false
end
DCS.getModelTime = function() return CLOCK end
net.get_my_player_id = function() return 1 end
local function le(v)
  -- (arithmetic, not bit operations: fengari's integers are 32 bits wide)
  if v < 0 then v = v + 4294967296.0 end
  local b = {}
  for k = 1, 4 do
    b[k] = v % 256
    v = (v - b[k]) / 256
  end
  return string.format('%02x%02x%02x%02x', b[1], b[2], b[3], b[4])
end
local function xOf(t) return le(t.ix) .. le(t.num) .. le(t.typ) .. string.format('%02x', t.flag) .. '000000' end
local baseTerminals = NATIVE.terminals
function NATIVE.terminals()
  local r, e = baseTerminals()
  if not r then return r, e end
  for i, t in ipairs(LIST) do r.t[i].x = xOf(t) end
  return r
end
function NATIVE.peek(i, off, len)
  local t = term(i)
  if not t then return nil, NOTERM end
  local mem = le(t.client) .. le(t.order) .. string.rep('00', 0x80) .. xOf(t) .. string.rep('00', 0x300)
  return mem:sub(off * 2 + 1, (off + len) * 2)
end
function NATIVE.peekatc(off, len) return string.rep('00', len) end
-- the terminal a real spawn takes
local function spawnTerminal(slot)
  local own = slot and ownSpot(slot)
  local function open(t) return t.typ == 72 and not t.obj and not t.hold and not blocked(t) end
  if own and TERMS[own] and open(TERMS[own]) and TERMS[own].num == TERMS[own].num0 then return TERMS[own] end
  local best
  for n, t in ipairs(TERMS) do
    if open(t) then
      local key = OPT.numbersIgnored and (n >= 5 and n or nil) or t.num
      local ok = key and (key >= (OPT.floor or 5) or (OPT.oneWorks and key == 1 and n > 4))
      if ok and (not best or key < best.key) then best = { key = key, t = t } end
    end
  end
  return best and best.t
end
-- the terminal DCS's chooser gives: the first in the list that has the lowest number on offer
local function chooserTerminal()
  local best
  for _, t in ipairs(TERMS) do
    local onOffer = t.typ == 72 and not t.obj and not t.hold and not blocked(t) and (isFree(t) or t.flag == 0)
    if onOffer and t.num >= 5 and (not best or t.num < best) then best = t.num end
  end
  if not best then return nil end
  for _, t in ipairs(LIST) do
    if t.typ == 72 and t.num == best then return t end
  end
  return nil
end
function NATIVE.spawnonmiss(id, s, f)
  rec('spawnonmiss', id, s, f)
  assert(f == 16000)
  local t = (s == 'FA-18C_hornet') and chooserTerminal() or nil
  if OPT.primeWorks then FIRST_DONE = true end
  if t then
    t.client, t.miss, t.type, t.num, t.flag, t.hold = 0, string.format('%d', id), s, t.ix, 1, true
    taken[t] = { id = 0, miss = t.miss }
  end
  return place(t), ptr(t)
end
function NATIVE.release(i)
  local t = term(i)
  if not t then return nil, NOTERM end
  rec('release', i)
  if not t.obj then blank(t) end
  taken[t] = nil
  return true
end
function NATIVE.undo()
  rec('undo')
  taken, orders = {}, {}
  return 0, 0, 0
end
function NATIVE.snapstate()
  rec('snapstate')
  return #LIST
end
function NATIVE.termstate()
  local parts = {}
  for i, t in ipairs(LIST) do parts[i] = le(t.client) .. le(t.ix) .. le(t.num) .. string.format('%02x', (t.flag == 1 or not isFree(t)) and 1 or 0) .. '000000' end
  return 16 * #LIST, table.concat(parts)
end
-- the terminal a record reaches: by its Term_Index; a spawn-only one by its number
local function reached(t, number)
  if t.ix >= 0 then return t end
  for _, o in ipairs(TERMS) do
    if o.typ == 72 and o.ix == -1 and o.num == number then return o end
  end
  return nil
end
-- procInitTerminals: stage A's record for the terminals named
function NATIVE.initterms(...)
  rec('initterms', ...)
  for _, i in ipairs({ ... }) do
    local t = term(i)
    if not t then return nil, 'procInitTerminals is not exported, no snapshot (snapstate first), or no such terminal' end
    local o = reached(t, t.num0)
    if o then
      if not o.obj then blank(o) end
      o.num, o.flag, o.hold = o.num0, 0, false
    end
  end
  return true
end
-- procInitTerminals: chosen fields of the records of the terminals named ("place,client,number,taken;...", "-" keeps)
function NATIVE.initrows(spec)
  rec('initrows', spec)
  if OPT.initRaises then return nil, 'it raised an exception' end
  for part in spec:gmatch('[^;]+') do
    local i, c, n, k = part:match('^(%d+),([-%d]+),([-%d]+),([-%d]+)$')
    local t = term(tonumber(i))
    if not t then return nil, 'procInitTerminals is not exported, or no such terminal' end
    local number = (n == '-') and t.num or tonumber(n)
    local o = reached(t, number)
    if o then
      if o.ix >= 0 then o.num = number end
      if k ~= '-' then
        o.flag = tonumber(k)
        if tonumber(k) == 0 and not o.obj then
          blank(o)
          o.hold = false
        end
      end
      if c ~= '-' and not o.obj and (k == '-' or tonumber(k) == 1) then o.client = tonumber(c) end
    end
  end
  return true
end
OUT_OF_TABLE = 0 -- how often a spawn was given a number that is no place of the spawn table (DCS would read past it)
FROZEN, FIRST_DONE = false, false
function spawnPlayer(slot)
  if FROZEN then return false end
  if not FIRST_DONE then
    -- (the once-a-mission work, at the first spawn)
    local seen = {}
    for _, t in ipairs(TERMS) do
      if t.typ == 72 then
        if t.num > 40 or (t.num < 1 and t.num ~= -1 and not OPT.negOk) or (OPT.lowFreezes and seen[t.num]) then FROZEN = true end
        seen[t.num] = true
      end
    end
    if FROZEN then return false end
    FIRST_DONE = true
  end
  local pick = spawnTerminal(slot)
  if not pick then return false end
  nextObj = nextObj + 256
  pick.client, pick.miss, pick.type, pick.obj, pick.flag = nextObj, slot, 'FA-18C_hornet', true, 1
  -- (the place: the spawn table's entry of that number)
  local at = TERMS[pick.num]
  if not (at and at.typ == 72) then
    OUT_OF_TABLE = OUT_OF_TABLE + 1
    at = pick
  end
  player = { x = at.x, z = at.z, obj = nextObj, slot = tonumber(slot) or 0 }
  return true
end
-- THE SLOT PICKER'S TWO CALLS (catcc_atcprobe.dll's aim / restore): every number in play before T lifted out of
-- play: through a record for a terminal with a Term_Index; a spawn-only terminal's only by a direct write, if allowed
local lifts = {}
function NATIVE.aim(id, target, mode, write)
  rec('aim', id, target, mode, write)
  if id ~= SHIP_OBJ then return nil, 'no object with that id in the world\'s register' end
  if OPT.aimRaises then return nil, 'it raised an exception' end
  attached = true
  local found
  for _, t in ipairs(TERMS) do if t.typ == 72 and t.num == target then found = t end end
  if not found then return nil, 'no terminal has the target\'s number (nothing was changed)' end
  local o = { target = target, taken = found.flag == 1, client = found.client, lifted = 0, written = 0, blocked = 0, failed = 0, layoutBad = false }
  for _, t in ipairs(TERMS) do
    if t.typ == 72 and t.num >= 5 and t.num < target then
      local v = (mode == 'neg') and -(1000 + t.num) or (mode == 'low' and 4 or (t.num + 100))
      if t.ix >= 0 then
        lifts[t] = lifts[t] or t.num
        t.num = v
        o.lifted = o.lifted + 1
      elseif write and not OPT.layoutBad then
        lifts[t] = lifts[t] or t.num
        t.num = v
        o.written = o.written + 1
      else
        o.blocked = o.blocked + 1
        if write then o.layoutBad = true end
      end
    end
  end
  return o
end
-- A NEW MISSION START (the user hosts the mission again): the deck as at the start, the case file kept
function restart()
  -- (a DCS that froze was killed: its hook saw no stop)
  if not FROZEN then cb.onSimulationStop() end
  for _, t in ipairs(TERMS) do
    blank(t)
    t.num, t.flag, t.hold = t.num0, 0, false
  end
  lifts, player, curSlot = {}, nil, ''
  FROZEN, FIRST_DONE = false, false
  attached = false
  taken, orders = {}, {}
  boot()
end
function NATIVE.restore(id)
  rec('restore', id)
  local o = { records = 0, written = 0, left = 0, failed = 0 }
  for t, was in pairs(lifts) do
    t.num = was
    if t.ix >= 0 then o.records = o.records + 1 else o.written = o.written + 1 end
  end
  lifts = {}
  return o
end
-- (the spot a real jet leaves: emptied by DCS; its byte stays 1, as run 2's count of Lua's TO_AC showed)
function removePlayer()
  for _, t in ipairs(TERMS) do if player and t.obj and t.client == player.obj then blank(t) end end
  player = nil
  curSlot = ''
end
-- how the model stands: "<terminals taken without an object>/<terminals whose number is not their own>/<chooser holds>"
function state()
  local fake, changed, held = 0, 0, 0
  for _, t in ipairs(TERMS) do
    if not isFree(t) and not t.obj then fake = fake + 1 end
    if t.num ~= t.num0 then changed = changed + 1 end
    if t.hold then held = held + 1 end
  end
  return fake .. '/' .. changed .. '/' .. held
end

-- the module's stand-in asked directly (no hook): the deck spot of the terminal a call gives
function NATIVE_SETUP()
  NATIVE_T = NATIVE
  buildList()
  NATIVE.attach(SHIP_OBJ)
end
function NATIVE_CALL(name, ...)
  local ti = NATIVE[name](...)
  return LIST[ti] and LIST[ti].spot or 0
end

assert(load(SCRIPT, 'script'))()
OUT = table.concat(LINES, '\n') .. '\n@@CHAT\n' .. table.concat(CHAT, '\n') .. '\n@@CALLS\n' .. table.concat(CALLS, '\n') .. '\n@@RESULT\n' .. tostring(RESULT)
