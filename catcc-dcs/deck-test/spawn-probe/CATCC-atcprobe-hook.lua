-- CATCC ATC PROBE (an experiment, not part of the mod): can the carrier's air traffic control (class woATC in
-- Flight.dll) be told which spawn spot ("terminal") a client's spawn gets?
-- ROUND 9 (2026-11-22; NOT YET RUN IN DCS). What is known:
--   * every jet terminal has an ORDER NUMBER (the word at +0x8c: untouched, the deck spot's number); a real spawn
--     takes the lowest number from 5 on that has no aircraft, and the jet appears at that number's place;
--   * native.aim(ship, T) lifts every number in play before T out of play, native.restore(ship) puts them back.
--     Run 8: six aimed spawns (spots 32, 32, 19, 18, 20, 24) all ON THE TARGET, every restore clean;
--   * but run 7: the same aim as THE FIRST SPAWN OF THE MISSION froze DCS. The numbers were lifted to 105..123
--     then (number + 100). A first spawn with two numbers exchanged (run 6), both within 1..40, did not freeze.
-- So this round: THE FIRST SPAWN AIMED, with the lifted numbers kept out of the way differently. One case per
-- mission start (the user hosts the mission again for the next case); which case is next is kept in a small file
-- of the hook's own, Logs\catcc-atcprobe-case.txt. A case whose spawn froze DCS is not run again.
--   case 1 'low'   every lifted number becomes 4: a number of the spawn table (1 to 4 are never chosen)
--   case 2 'neg'   every lifted number becomes -(1000 + number): out of the table the other way
--   case 3 'prime' (only if neither landed) DCS's chooser is asked once at mission start and what it gives given
--                  back, in the hope that DCS then does its once-a-mission work before any number is lifted; then
--                  aim as runs 6 and 8 did (number + 100)
-- In the start whose first spawn lands, the same mission goes on: spot 20 the same way; spot 36 and spot 40 (the
-- spawn-only spots, with the direct write of the numbers of the spawn-only spots before them, in the same mode).
-- From the slot request to the aircraft the log has a line before and after every native call, a line for each of the
-- first frames, and a line a second: where the log stops is where DCS stopped.
-- Two missions (by name; any other mission is left alone; multiplayer server only): "dynamic spawn" (the cases),
-- and "slot per spot" (watch only in this round: every terminal change and slot event is logged).
-- The native module: Scripts\CATCC\bin\catcc_atcprobe.dll (source in native\); it calls functions DCS's own DLLs
-- export, every call guarded.
-- Log: Saved Games\DCS\Logs\catcc-atcprobe.log (written and closed line by line), and one line per event in dcs.log
-- (CATCC-ATCPROBE).
-- Needs net.allow_dostring_in "server" (the crew test's installer adds it), the deck spots installed as DCS's spawn
-- spots (director-test.ps1 -Spawn Spots) and Scripts\CATCC\crewtest_routes.lua (the crew test's install).
-- Install: see README.md in this folder. Remove the hook when done.

-- ---------------------------------------------------------------- SETTINGS (no rebuild needed)
-- THE CASES, one per mission start, in this order. Each is the FIRST spawn of its mission:
--   spot       the spot aimed at
--   mode       how a number is lifted out of play: 'low' (it becomes 4), 'neg' (-(1000 + number)), 'up' (number + 100)
--   prime      DCS's chooser asked once and given back before anything is lifted
--   ifNoneLanded   run only if no case before it put the jet on the target
local CASES = {
  { name = 'low', spot = 24, mode = 'low' },
  { name = 'neg', spot = 24, mode = 'neg' },
  { name = 'prime', spot = 24, mode = 'up', prime = true, ifNoneLanded = true },
}
-- after a case's first spawn has landed, in the same mission and the same mode: these, one spawn each
-- (write = true: the spawn-only spots before the target have their number word written directly)
local FOLLOW = {
  { spot = 20 },
  { spot = 36, write = true },
  { spot = 40, write = true },
}
-- THE ONE MEMORY WRITE OF OURS: the number word (+0x8c) of the spawn-only terminals before a target, only in a round
-- that asks for it (write = true). The module writes only after finding every terminal's two words where the ATC's
-- own records say, checks the terminal and the word's present value, reads the word back, and writes the old number
-- back at restore. false: such a round is not set and no spawn is asked for it.
local WRITE_SPAWN_ONLY_NUMBERS = true
-- These two stay OFF and are not used: RESTORE_BY_POKE and HOLD_WITHOUT_RELEASE (settings of rounds 4 and 5).
local RESTORE_BY_POKE = false
local HOLD_WITHOUT_RELEASE = false
-- the made-up id of case 3's one chooser call (a number no unit of a mission has), its type and the float run 2 gave
local DUMMY_ID = 900000
local HORNET, HORNET_MASS = 'FA-18C_hornet', 16000
-- from the slot request to the end of the round: a line before and after every native call (TRACE_AFTER_SLOT), and
-- a line for each of the first TRACE_FRAMES frames
local TRACE_AFTER_SLOT = true
local TRACE_FRAMES = 30
-- the "slot per spot" mission: a round that sets nothing (false: every slot event is logged all the same)
local SLOT_WATCH_FIRST = true
-- at slot events, for each of the ATC's clients: canClientSpawnOnTerminal, getTerminalByClient and (FORCED_QUERY)
-- the private getForcedTerminalByClient_; only ever asked for ids the ATC itself lists as clients
local CLIENT_QUERIES = true
local FORCED_QUERY = true
local SPAWN_WAIT = 120 -- seconds from the slot asked for to "no aircraft appeared"
local AFTER_SPAWN = 5 -- seconds from the aircraft seen to restore
local READY_WAIT = 900 -- seconds the user is given to ask for a slot

-- ---------------------------------------------------------------- log
local writedir = lfs.writedir()
local LOG = writedir .. 'Logs/catcc-atcprobe.log'

-- a line in the probe's own log
local function out(s)
  local f = io.open(LOG, 'a')
  if f then
    f:write(os.date('%H:%M:%S '), s, '\n')
    f:close()
  end
end
-- an event: the same, and a line in dcs.log
local function ev(s)
  pcall(log.write, 'CATCC-ATCPROBE', log.INFO, (#s > 300) and (s:sub(1, 300) .. ' ...') or s)
  out(s)
end

local function split(s, sep)
  local t = {}
  for v in (s .. sep):gmatch('(.-)' .. sep:gsub('%p', '%%%0')) do t[#t + 1] = v end
  return t
end
local function yn(v)
  if v == nil then return '?' end
  return v and 'Y' or 'n'
end

-- ---------------------------------------------------------------- the case file
-- Logs\catcc-atcprobe-case.txt, one line an event: "case <n> started" (written when the slot is asked for, just before
-- DCS spawns), "case <n> done landed" / "case <n> done missed" (the aircraft appeared), "case <n> froze" (found
-- started and never done at a later mission start), "case <n> stopped" (the simulation was stopped in between: the
-- case is run again), "case <n> not set". The last line of a case is what it stands at.
local CASEFILE = writedir .. 'Logs/catcc-atcprobe-case.txt'
local function caseNote(n, what)
  local f = io.open(CASEFILE, 'a')
  if f then
    f:write(string.format('case %d %s\n', n, what))
    f:close()
  end
end
local function caseStates()
  local st = {}
  local f = io.open(CASEFILE, 'r')
  if f then
    for line in f:lines() do
      local n, what = line:match('^case (%d+) (.+)$')
      if n then st[tonumber(n)] = what end
    end
    f:close()
  end
  return st
end
-- the case this mission start runs (its number), or nil with why none; a case found started and never done is
-- marked as frozen and passed over
local function nextCase()
  local st = caseStates()
  local landed = false
  for n = 1, #CASES do
    if st[n] == 'started' then
      ev(string.format('case %d (%s) was started on an earlier mission start and never finished: DCS FROZE on it; it is not run again', n, tostring(CASES[n].name)))
      caseNote(n, 'froze')
      st[n] = 'froze'
    end
    if st[n] == 'done landed' then landed = true end
  end
  for n = 1, #CASES do
    local done = st[n] == 'froze' or (st[n] or ''):find('^done') or st[n] == 'not set'
    if not done then
      if CASES[n].ifNoneLanded and landed then
        out(string.format('case %d (%s) is only for when no case before it landed: left out', n, tostring(CASES[n].name)))
      else
        return n, st
      end
    end
  end
  return nil, st
end

-- ---------------------------------------------------------------- the native module
local native, nativeWhy
local function loadNative()
  if native then return true end
  local path = writedir .. 'Scripts\\CATCC\\bin\\catcc_atcprobe.dll'
  local ok, loader, err = pcall(package.loadlib, path, 'luaopen_catcc_atcprobe')
  if ok and type(loader) == 'function' then
    local ok2, m = pcall(loader)
    if ok2 and type(m) == 'table' then native = m else nativeWhy = 'it did not start: ' .. tostring(m) end
  else
    nativeWhy = tostring(ok and err or loader)
  end
  if native then pcall(native.setlog, LOG) end
  return native ~= nil
end
-- a call into the module: its results, or nil, error (also when the call itself raised)
local TRACING = false
local function N(name, ...)
  local f = native and native[name]
  if not f then return nil, 'the module has no function ' .. tostring(name) end
  if TRACING then out('    > native.' .. tostring(name)) end
  local r = { pcall(f, ...) }
  if TRACING then out('    < native.' .. tostring(name) .. (r[1] and '' or ' RAISED')) end
  if not r[1] then return nil, tostring(r[2]) end
  return r[2], r[3], r[4]
end

-- ---------------------------------------------------------------- the deck spots
local function loadSpots()
  local f, err = loadfile(writedir .. 'Scripts/CATCC/crewtest_routes.lua')
  if not f then return nil, tostring(err) end
  local ok, t = pcall(f)
  if not ok or type(t) ~= 'table' then return nil, tostring(t) end
  local spots = {}
  for _, s in ipairs(t) do
    if type(s) == 'table' and tonumber(s.spot) and tonumber(s.x) and tonumber(s.z) then
      spots[#spots + 1] = { n = tonumber(s.spot), name = tostring(s.name or s.id or s.spot), x = tonumber(s.x), z = tonumber(s.z),
        a = (math.atan2 or math.atan)(tonumber(s.fz) or 0, tonumber(s.fx) or 1) % (2 * math.pi) }
    end
  end
  if #spots == 0 then return nil, 'no spots in the file' end
  return spots
end

-- ---------------------------------------------------------------- THE MISSION SCRIPTING STATE's side
-- (net.dostring_in 'server'): the carrier, Lua's own list of its terminals, the static object, the players
local MISSION = [[
CATCC_ATCP = CATCC_ATCP or {}
local S = CATCC_ATCP
S.spots = SPOTS
local TWO_PI = 2 * math.pi
local function shipUnit()
  if S.ship then
    local u = Unit.getByName(S.ship)
    if u and u:isExist() then return u end
  end
  for _, side in ipairs({ 2, 1, 0 }) do
    for _, ab in ipairs(coalition.getAirbases(side) or {}) do
      local okd, d = pcall(ab.getDesc, ab)
      if okd and d and d.category == Airbase.Category.SHIP then
        local okp, park = pcall(ab.getParking, ab)
        if okp and type(park) == 'table' and #park >= 20 then
          local u = Unit.getByName(ab:getName())
          if u and u:isExist() then
            S.ship = ab:getName()
            return u
          end
        end
      end
    end
  end
  return nil
end
local function frame(u)
  local p = u:getPosition()
  return function(q)
    local dx, dy, dz = q.x - p.p.x, q.y - p.p.y, q.z - p.p.z
    return dx * p.x.x + dy * p.x.y + dz * p.x.z, dx * p.z.x + dy * p.z.y + dz * p.z.z
  end
end
-- the carrier: "OK|<name>|<unit id>|<object id>|<type>|<terminals>|<marked taken>|<listed as available>"
function S.carrier()
  local u = shipUnit()
  if not u then return 'ERR|no aircraft carrier with deck spots in this mission (yet)' end
  local n, taken, avail = -1, -1, -1
  local ab = Airbase.getByName(S.ship)
  if ab then
    local ok, park = pcall(ab.getParking, ab)
    if ok and type(park) == 'table' then
      n, taken = #park, 0
      for _, t in ipairs(park) do if t.TO_AC then taken = taken + 1 end end
    end
    local ok2, free = pcall(ab.getParking, ab, true)
    if ok2 and type(free) == 'table' then avail = #free end
  end
  return string.format('OK|%s|%s|%s|%s|%d|%d|%d', S.ship, tostring(u:getID()), tostring(u.id_), tostring(u:getTypeName()), n, taken, avail)
end
-- Lua's own list of the terminals, in ITS order: "<Term_Index>,<Term_Type>,<x>,<y>,<z>,<TO_AC>,<Term_Index_0>;..."
function S.parking()
  local u = shipUnit()
  local ab = u and Airbase.getByName(S.ship)
  if not ab then return '' end
  local ok, park = pcall(ab.getParking, ab)
  if not ok or type(park) ~= 'table' then return '' end
  local res = {}
  for i, t in ipairs(park) do
    local p = t.vTerminalPos or {}
    res[i] = string.format('%s,%s,%.3f,%.3f,%.3f,%s,%s', tostring(t.Term_Index), tostring(t.Term_Type), p.x or 0, p.y or 0, p.z or 0, t.TO_AC and '1' or '0', tostring(t.Term_Index_0))
  end
  return table.concat(res, ';')
end
-- a place of the ship (metres forward, up, to starboard) in the world: "<x>|<y>|<z>"
function S.world(fw, up, st)
  local u = shipUnit()
  if not u then return '' end
  local p = u:getPosition()
  return string.format('%.3f|%.3f|%.3f', p.p.x + fw * p.x.x + up * p.y.x + st * p.z.x, p.p.y + fw * p.x.y + up * p.y.y + st * p.z.y,
    p.p.z + fw * p.x.z + up * p.y.z + st * p.z.z)
end
-- every player's aircraft on the carrier:
-- "<player>|<type>|<fwd>|<stbd>|<nearest spot's number>|<its name>|<how far>|<object id>|<unit id>;..."
function S.players()
  local u = shipUnit()
  if not u then return '' end
  local f = frame(u)
  local res = {}
  for _, side in ipairs({ 1, 2 }) do
    for _, pu in ipairs(coalition.getPlayers(side) or {}) do
      local okq, q = pcall(pu.getPoint, pu)
      if okq and q then
        local fw, st = f(q)
        if math.abs(fw) < 250 and math.abs(st) < 80 then
          local best, bd
          for _, sp in ipairs(S.spots) do
            local d = math.sqrt((fw - sp.x) ^ 2 + (st - sp.z) ^ 2)
            if not bd or d < bd then best, bd = sp, d end
          end
          res[#res + 1] = string.format('%s|%s|%.1f|%.1f|%d|%s|%.1f|%s|%s', tostring(pu:getPlayerName()), tostring(pu:getTypeName()), fw, st, best.n, best.name, bd,
            tostring(pu.id_), tostring(pu:getID()))
        end
      end
    end
  end
  return table.concat(res, ';')
end
-- a static Hornet, linked to the ship, on one spot (as the steer probe makes them): "OK|<made>|<why not>"
function S.block(n)
  local u = shipUnit()
  if not u then return 'ERR|no carrier' end
  local c = u:getPoint()
  local sx = u:getPosition().x
  local hc = math.atan2(sx.z, sx.x) % TWO_PI
  for _, sp in ipairs(S.spots) do
    if sp.n == n then
      local name = 'catcc-atcp-' .. sp.n
      local old = StaticObject.getByName(name)
      if old then pcall(old.destroy, old) end
      local ok, res = pcall(coalition.addStaticObject, u:getCountry(), { type = 'FA-18C_hornet', category = 'Planes', name = name,
        x = c.x + sp.x * math.cos(hc) - sp.z * math.sin(hc), y = c.z + sp.x * math.sin(hc) + sp.z * math.cos(hc), heading = (hc + sp.a) % TWO_PI,
        linkUnit = u:getID(), linkOffset = true, offsets = { x = sp.x, y = sp.z, angle = sp.a % TWO_PI }, canCargo = false, dead = false })
      if ok and res then return 'OK|1|' end
      return 'OK|0|' .. tostring(res)
    end
  end
  return 'OK|0|no such spot'
end
-- every static of ours taken away: "OK|<taken away>"
function S.unblock()
  local gone = 0
  for _, sp in ipairs(S.spots) do
    local old = StaticObject.getByName('catcc-atcp-' .. sp.n)
    if old then
      pcall(old.destroy, old)
      gone = gone + 1
    end
  end
  return 'OK|' .. gone
end
function S.say(text) trigger.action.outText(text, 30) return 'OK' end
return 'OK'
]]

local function mission(code)
  local ok, r = pcall(net.dostring_in, 'server', code)
  if not ok then return nil, tostring(r) end
  if type(r) ~= 'string' then return nil, 'it gave ' .. tostring(r) end
  return r
end

-- ---------------------------------------------------------------- state
-- P.T[i]: what is known of the terminal at place i of the ATC's list: spot (its deck spot's number), name, ix
-- (Lua's Term_Index), typ (Lua's Term_Type), heli
local P = { phase = 'off', at = 0, lastPoll = 0 }

local function go(phase, t)
  P.phase, P.at, P.lastPoll = phase, t, 0
end

local function say(text)
  ev('SAID: ' .. text)
  pcall(net.send_chat, text, true)
  mission(string.format('return CATCC_ATCP.say(%q)', text))
end

local function label(i)
  local k = P.T and P.T[i]
  if not k then return '#' .. tostring(i) end
  local parts = {}
  if k.spot then parts[#parts + 1] = string.format('spot %d %s', k.spot, tostring(k.name)) end
  if k.ix then parts[#parts + 1] = 'Term_Index ' .. tostring(k.ix) end
  if k.typ then parts[#parts + 1] = 'type ' .. tostring(k.typ) end
  if #parts == 0 then return '#' .. tostring(i) end
  return string.format('#%d (%s)', i, table.concat(parts, ', '))
end

-- Of the 16 bytes at +0x88 of a terminal (as hex): the word at +0x88 (run 1: its Term_Index), the word at +0x8c
-- (run 3: the word DCS's chooser changes), the byte at +0x94 (run 3: the byte it sets)
local function fields(hex)
  if type(hex) ~= 'string' or #hex < 26 then return nil end
  local function le(o)
    local v = 0
    for k = 3, 0, -1 do v = v * 256 + (tonumber(hex:sub((o + k) * 2 + 1, (o + k) * 2 + 2), 16) or 0) end
    if v >= 2147483648 then v = v - 4294967296 end
    return v
  end
  return le(0), le(4), tonumber(hex:sub(25, 26), 16)
end

-- The terminals now. With `full`: a summary (an event) and every terminal's line. Else: only the terminals that
-- changed since the last reading, and the summary if it changed. Returns the list (nil: it could not be read).
local function read(what, full)
  local r, err = N('terminals')
  if not r then
    if P.readErr ~= tostring(err) then
      P.readErr = tostring(err)
      ev(what .. ': the terminals could not be listed: ' .. tostring(err))
    end
    return nil
  end
  P.readErr = nil
  local line, free = {}, 0
  for i, t in ipairs(r.t) do
    if t.free then free = free + 1 end
    local _, w8c, b94 = fields(t.x)
    line[i] = string.format('free=%s client=%s miss=%q type=%q object=%s order=%s +0x8c=%s +0x94=%s', yn(t.free), tostring(t.client), tostring(t.miss or '?'), tostring(t.type or '?'), yn(t.obj),
      tostring(t.order), tostring(w8c), tostring(b94))
  end
  local c = N('clients')
  local ids = {}
  for k, v in ipairs(c and c.ids or {}) do ids[k] = string.format('%d', v) end
  local lua = mission('return CATCC_ATCP.carrier()')
  local lf = lua and split(lua, '|') or {}
  local sum = string.format('%d terminals, %d free; the ATC\'s clients: %s; Lua getParking: %s marked taken, %s listed available', r.n, free,
    c and ('{' .. table.concat(ids, ',') .. '}') or '?', tostring(lf[7]), tostring(lf[8]))
  if full then
    ev(what .. ': ' .. sum)
    for i = 1, r.n do
      local k = P.T and P.T[i] or {}
      out(string.format('  %s %s: %s +0x88=%s [Lua: Term_Index_0 %s, TO_AC %s]', label(i), tostring(r.t[i].ptr), line[i], tostring((fields(r.t[i].x))), tostring(k.ix0), tostring(k.toac)))
    end
  else
    for i = 1, r.n do
      if P.line and P.line[i] ~= line[i] then out(string.format('  %s: %s: %s  ->  %s', what, label(i), tostring(P.line[i]), line[i])) end
    end
    if P.sum ~= sum then out(string.format('  %s: %s', what, sum)) end
  end
  P.line, P.sum, P.clientIds = line, sum, c and c.ids or {}
  return r
end

-- a terminal's own memory, 384 bytes, logged in rows of 16; the second time on only the rows that changed
local function dump(i, what)
  if not i then return end
  local hex, err = N('peek', i, 0, 384)
  if not hex then
    out(string.format('  memory of %s: %s', label(i), tostring(err)))
    return
  end
  P.dumps = P.dumps or {}
  local old = P.dumps[i]
  for o = 0, #hex / 2 - 1, 16 do
    local row = hex:sub(o * 2 + 1, o * 2 + 32)
    if not old or old:sub(o * 2 + 1, o * 2 + 32) ~= row then
      out(string.format('  memory of %s, %s, +0x%03x: %s%s', label(i), what, o, row, old and ('   (was ' .. old:sub(o * 2 + 1, o * 2 + 32) .. ')') or ''))
    end
  end
  P.dumps[i] = hex
end

-- everything the probe set, undone: the terminals it took freed (their wait flags off), the orders put back
local function undo(why)
  if not native then return end
  local freed, kept, restored = N('undo')
  if freed == nil then
    ev(string.format('UNDO FAILED (%s): %s', why, tostring(kept)))
  elseif freed + kept + (restored or 0) > 0 then
    ev(string.format('UNDONE (%s): %s terminals freed, %s left alone (no longer as we took them), %s orders put back', why, tostring(freed), tostring(kept), tostring(restored)))
  end
end

-- every player's aircraft on the carrier: { name, type, fw, st, spot, spotName, dist, obj, unit }
local function players()
  local list = {}
  local r = mission('return CATCC_ATCP.players()')
  if not r or r == '' then return list end
  for _, part in ipairs(split(r, ';')) do
    local f = split(part, '|')
    if f[1] and f[5] then
      list[#list + 1] = { name = f[1], type = f[2], fw = f[3], st = f[4], spot = tonumber(f[5]), spotName = f[6], dist = tonumber(f[7]) or 99, obj = tonumber(f[8]), unit = f[9] }
    end
  end
  return list
end

-- what the ATC says of each of its clients (asked only for ids it lists itself); a line when it is new or changed
local function clientReport(when)
  if not CLIENT_QUERIES then return end
  P.clientLine = P.clientLine or {}
  for _, id in ipairs(P.clientIds or {}) do
    local function show(v, e)
      if v == nil then return '? [' .. tostring(e) .. ']' end
      return tostring(v)
    end
    local function term(ti, ptr)
      if ti == nil then
        if tostring(ptr):find('exception', 1, true) then P.forcedOff = true end
        return '? [' .. tostring(ptr) .. ']'
      end
      return ti > 0 and label(ti) or (ti == 0 and 'none' or ('one not in the list, ' .. tostring(ptr)))
    end
    local parts = { 'canClientSpawnOnTerminal: ' .. show(N('canspawn', id)), 'getTerminalByClient(id, false): ' .. show(N('termbyclient', id, false)),
      'getTerminalByClient(id, true): ' .. show(N('termbyclient', id, true)) }
    if FORCED_QUERY and not P.forcedOff then
      parts[#parts + 1] = 'getForcedTerminalByClient_(id, false): ' .. term(N('forced', id, false))
      if not P.forcedOff then parts[#parts + 1] = 'getForcedTerminalByClient_(id, true): ' .. term(N('forced', id, true)) end
    end
    local l = table.concat(parts, '; ')
    if P.clientLine[id] ~= l then
      P.clientLine[id] = l
      out(string.format('  %s: the ATC\'s client %d: %s', when, id, l))
    end
  end
end

-- at a slot event: what changed, which terminal carries the slot's id as its mission id, the clients' answers
local function slotReport(when, slot)
  local r = read(when)
  if not r then return end
  local at = {}
  for i, t in ipairs(r.t) do
    if t.miss == slot then at[#at + 1] = string.format('%s (client %s, object=%s, free=%s)', label(i), tostring(t.client), yn(t.obj), yn(t.free)) end
  end
  out(string.format('  %s: the terminal with mission id %q: %s', when, slot, #at > 0 and table.concat(at, '; ') or 'none'))
  clientReport(when)
end

-- ---------------------------------------------------------------- STAGE A: read only
local function stageA()
  ev('STAGE A (read only): the ship\'s air traffic control and its terminals')
  if not loadNative() then
    ev('STAGE A FAILED: the native module is not loaded (Scripts\\CATCC\\bin\\catcc_atcprobe.dll): ' .. tostring(nativeWhy))
    return false
  end
  local inf = N('info')
  if not inf then
    ev('STAGE A FAILED: the native module does not answer')
    return false
  end
  ev(string.format('native module %s; %d functions of DCS not found', tostring(inf.version), #(inf.missing or {})))
  for _, m in ipairs(inf.missing or {}) do out('  NOT EXPORTED: ' .. tostring(m)) end
  local a, err = N('attach', tonumber(P.objId))
  if not a then
    ev(string.format('STAGE A FAILED: the ship (object id %s) or its ATC could not be reached: %s', tostring(P.objId), tostring(err)))
    return false
  end
  ev(string.format('the ship is a %s (register kind %s); its ATC is a %s at %s', tostring(a.cls), tostring(a.kind), tostring(a.atcCls), tostring(a.atc)))
  local r, e2 = N('terminals')
  if not r then
    ev('STAGE A FAILED: the terminal list could not be walked: ' .. tostring(e2))
    -- (the other way to list them, for the log: a later build could use it)
    for _, ret in ipairs({ true, false }) do
      local fe, e3 = N('foreach', ret)
      out(string.format('  forEachTerminal with our function answering %s: %s', tostring(ret), fe and (tostring(fe.n) .. ' terminals') or tostring(e3)))
    end
    return false
  end
  -- Lua's own list
  local park = {}
  local pr = mission('return CATCC_ATCP.parking()')
  if pr and pr ~= '' then
    for i, part in ipairs(split(pr, ';')) do
      local f = split(part, ',')
      park[i] = { ix = tonumber(f[1]), typ = tonumber(f[2]), x = tonumber(f[3]), y = tonumber(f[4]), z = tonumber(f[5]), toac = f[6] == '1', ix0 = tonumber(f[7]) }
    end
  end
  ev(string.format('the ATC\'s list: %d terminals (its size word: %s); Lua Airbase:getParking: %d; expected 48: %s', r.n, tostring(r.size), #park,
    (r.n == 48 and #park == 48) and 'yes' or 'NO'))
  local notOwn = 0
  for _, t in ipairs(r.t) do if not t.vt then notOwn = notOwn + 1 end end
  out(string.format('  the terminals\' class: %s; %d of %d have another virtual table than wsAdrTerminal\'s own (a derived class)', tostring(r.t[1] and r.t[1].cls), notOwn, r.n))
  for _, ret in ipairs({ true, false }) do
    local fe, e3 = N('foreach', ret)
    out(string.format('  forEachTerminal with our function answering %s: %s', tostring(ret),
      fe and string.format('%d terminals, %s', fe.n, fe.same and 'the same and in the same order as the list' or 'NOT the list (or stopped early)') or tostring(e3)))
  end

  -- THE TERMINALS MATCHED TO THE DECK SPOTS, three ways:
  -- 1. by position: each spot's two numbers looked for in each terminal's own memory (needs no order, no layout)
  local T, tally = {}, {}
  for i = 1, r.n do
    T[i] = {}
    for _, s in ipairs(P.spots) do
      local off, how = N('locate', i, s.x, s.z, 0.06)
      if off then
        T[i].posSpot, T[i].posAt = s, off .. '/' .. tostring(how)
        tally[T[i].posAt] = (tally[T[i].posAt] or 0) + 1
        break
      end
    end
  end
  local posAt, posN = nil, 0
  for k, v in pairs(tally) do if v > posN then posAt, posN = k, v end end
  local byPos = 0
  for i = 1, r.n do
    -- (found somewhere else than in most terminals: a chance match)
    if T[i].posSpot and T[i].posAt ~= posAt then T[i].posSpot = nil end
    if T[i].posSpot then byPos = byPos + 1 end
  end
  out(string.format('  by position: %d terminals hold a deck spot\'s position (offset/kind %s)', byPos, tostring(posAt)))
  -- 2. by order: the ATC's list taken to be in the order of Lua's; 3. checked by the terminals' own numbers
  -- (getTerminalByTermIndex_(Term_Index) must give the terminal at the same place)
  local sameCount = #park == r.n
  local agree, disagree, posAgree, posDisagree = 0, 0, 0, 0
  for which = 1, 2 do
    local lines = {}
    for n = -1, 48 do
      local ti, ptr = N('byindex', which, n)
      lines[#lines + 1] = string.format('%d>%s', n, ti == nil and ('error: ' .. tostring(ptr)) or (ti == 0 and '-' or (ti < 0 and tostring(ptr) or ('#' .. ti))))
      if ti == nil then break end
      if which == 1 and sameCount and ti ~= 0 and n > 0 then
        local at
        for i, p in ipairs(park) do if p.ix == n then at = i end end
        if at then
          if at == ti then agree = agree + 1 else disagree = disagree + 1 end
        end
      end
    end
    out(string.format('  getTerminalByTermIndex_%s(n) for n = -1..48 (n>place in the list): %s', which == 2 and '0' or '', table.concat(lines, ' ')))
  end
  if sameCount then
    for i, p in ipairs(park) do
      local best, bd
      for _, s in ipairs(P.spots) do
        local d = math.sqrt((p.x - s.x) ^ 2 + (p.z - s.z) ^ 2)
        if not bd or d < bd then best, bd = s, d end
      end
      if bd and bd < 1.5 then T[i].ordSpot = best end
      if T[i].posSpot and T[i].ordSpot then
        if T[i].posSpot.n == T[i].ordSpot.n then posAgree = posAgree + 1 else posDisagree = posDisagree + 1 end
      end
    end
  end
  local orderOk = sameCount and disagree == 0 and posDisagree == 0 and (agree > 0 or posAgree > 0)
  out(string.format('  by order: the ATC\'s list %s Lua\'s list in the same order (the terminals\' own numbers: %d agree, %d do not; positions: %d agree, %d do not)',
    orderOk and 'IS' or (sameCount and 'is NOT shown to be' or 'has not the length of'), agree, disagree, posAgree, posDisagree))
  local mapped = 0
  for i = 1, r.n do
    local s = T[i].posSpot or (orderOk and T[i].ordSpot) or nil
    if s then
      T[i].spot, T[i].name = s.n, s.name
      mapped = mapped + 1
    end
    if orderOk and park[i] then
      T[i].ix, T[i].typ = park[i].ix, park[i].typ
      T[i].heli = park[i].typ ~= nil and park[i].typ ~= 72 and not s
    end
  end
  P.T, P.orderOk, P.nterms = T, orderOk, r.n
  -- WHAT THE WORD AT +0x8c IS: held against the deck spot matched by position and against Lua's own two numbers
  P.x0, P.order0 = {}, {}
  local eqSpot, jets, eqIx0, eqIx, known = 0, 0, 0, 0, 0
  for i = 1, r.n do
    P.x0[i], P.order0[i] = r.t[i].x, r.t[i].order
    local w88, w8c = fields(r.t[i].x)
    if T[i].spot then
      jets = jets + 1
      if w8c == T[i].spot then eqSpot = eqSpot + 1 end
    end
    if orderOk and park[i] then
      T[i].ix0, T[i].toac = park[i].ix0, park[i].toac
      known = known + 1
      if w8c == park[i].ix0 then eqIx0 = eqIx0 + 1 end
      if w88 == park[i].ix then eqIx = eqIx + 1 end
    end
  end
  ev(string.format('the word at +0x8c of a terminal: the deck spot\'s number for %d of the %d terminals matched to spots; Lua\'s Term_Index_0 for %d of %d; the word at +0x88: Lua\'s Term_Index for %d of %d',
    eqSpot, jets, eqIx0, known, eqIx, known))
  P.targetI, P.targetY = {}, {}
  for k, s in ipairs(P.targets) do
    for i = 1, r.n do
      if T[i].spot == s.n then P.targetI[k] = (P.targetI[k] == nil) and i or false end
    end
    if P.targetI[k] == false then P.targetI[k] = nil end
    -- (the target's height on the ship, for 'spawnOnPoint': Lua's own number for that terminal)
    if P.targetI[k] and orderOk and park[P.targetI[k]] then P.targetY[k] = park[P.targetI[k]].y end
    ev(string.format('target %d: spot %d, %s (%.2f m forward, %.2f m to starboard): %s', k, s.n, s.name, s.x, s.z,
      P.targetI[k] and ('terminal ' .. label(P.targetI[k])) or 'ITS TERMINAL IS NOT FOUND (rounds that aim at it will set nothing)'))
  end
  ev(string.format('%d of %d terminals matched to deck spots', mapped, r.n))
  if not read('STAGE A', true) then return false end
  for k = 1, #P.targets do dump(P.targetI[k], 'at the start') end
  ev('STAGE A done')
  return true
end

-- ---------------------------------------------------------------- the numbers, read
-- a terminal, short: "spot 5 [Term_Index 22]"
local function short(i)
  local k = P.T and P.T[i] or {}
  return string.format('%s [Term_Index %s]', k.spot and ('spot ' .. k.spot) or ('#' .. tostring(i)), tostring(k.ix or '?'))
end

-- a terminal's order number at stage A (the word at +0x8c), and now (from a reading of the terminals)
local function num0(i)
  local _, b = fields(P.x0 and P.x0[i])
  return b
end
local function numNow(r, i)
  local _, b = fields(r and r.t[i] and r.t[i].x)
  return b
end

-- BY THE NUMBERS AS THEY READ NOW: the jet terminal with the lowest number from 5 on and no aircraft on it (what
-- runs 2 to 6 say a real spawn takes, and where its jet appears: at that number's place)
local function predict(r)
  local best, bn
  for i = 1, r.n do
    local k, b = P.T[i], numNow(r, i)
    if k and k.spot and not k.heli and not r.t[i].obj and b and b >= 5 and (not bn or b < bn) then best, bn = i, b end
  end
  return best, bn
end
local lookups
local function sayPrediction(when)
  local r = read(when)
  if not r then return end
  local i, n = predict(r)
  ev(string.format('%s, by the numbers read: the lowest from 5 on without an aircraft is %s%s%s', when, tostring(n), i and (', on ' .. label(i)) or '',
    P.target and (n == P.target.n and ': THE TARGET\'S NUMBER' or ': NOT the target\'s number') or ''))
  return n
end

-- every terminal's number against stage A's, by reading: the spots that differ
local function numbersWrong(r)
  local wrong = {}
  for i = 1, P.nterms or 0 do
    if numNow(r, i) ~= num0(i) then wrong[#wrong + 1] = string.format('%s (reads %s, stage A %s)', short(i), tostring(numNow(r, i)), tostring(num0(i))) end
  end
  return wrong
end

-- FOR EVERY NUMBER FROM 5 ON: which terminal would a search through the ATC's list find FIRST, if it matched on the
-- number only, on the Term_Index only, or on either? (Run 4: asked for number 17, the chooser gave spot 15, which then
-- had that number, over and over. Run 7's freeze was on number 24, and the terminal with Term_Index 24 stands before
-- the one with number 24 in the list.) A number is "collision-free" under a reading if the first find is its own terminal.
function lookups()
  local n = P.nterms or 0
  local free, hit, byIx = {}, {}, {}
  for N = 5, 48 do
    local own, either
    for i = 1, n do
      local k = P.T[i]
      if k and k.spot and not k.heli and num0(i) == N then own = own or i end
      if not either and (num0(i) == N or (k and k.ix == N)) then either = i end
    end
    if own then
      if either == own then
        free[#free + 1] = tostring(N)
      else
        hit[#hit + 1] = string.format('%d (first: %s)', N, short(either))
      end
      local ix
      for i = 1, n do if not ix and P.T[i] and P.T[i].ix == N then ix = i end end
      if ix ~= own then byIx[#byIx + 1] = tostring(N) end
    end
  end
  P.collides = {}
  for _, h in ipairs(hit) do P.collides[tonumber(h:match('^%d+'))] = true end
  ev('a search of the list that matched number OR Term_Index would find the number\'s own terminal first for: ' .. table.concat(free, ', '))
  ev('... and another terminal first (a collision) for: ' .. (#hit > 0 and table.concat(hit, '; ') or 'none'))
  out('  (matching the number only: every number finds its own terminal, the numbers being all different; matching Term_Index only, another terminal for: ' .. table.concat(byIx, ', ') .. ')')
end

-- ---------------------------------------------------------------- THE TWO CALLS
-- native.aim: every number in play before the spot lifted out of play. Logged as it answers; the terminals read.
local function aim(v, when)
  local write = v.write and WRITE_SPAWN_ONLY_NUMBERS or false
  local was = TRACING
  TRACING = true
  local a, err = N('aim', tonumber(P.objId), v.spot, v.mode or 'up', write)
  TRACING = was
  if not a then
    ev(string.format('%s: aim(%d) FAILED: %s', when, v.spot, tostring(err)))
    return nil
  end
  P.aimed = true
  ev(string.format('%s: aim(spot %d, %s%s): %d numbers lifted through procInitTerminals, %d written directly, %d spawn-only spots still in the way, %d not as wanted%s; the target\'s terminal reads taken=%s client=%s',
    when, v.spot, v.mode or 'up', write and ', writes allowed' or '', a.lifted, a.written, a.blocked, a.failed, a.layoutBad and ' (THE TWO WORDS ARE NOT WHERE EXPECTED: nothing was written)' or '',
    tostring(a.taken), tostring(a.client)))
  return a
end

-- native.restore: every lifted number put back; then every terminal's number read against stage A's. Safe to call
-- with nothing lifted.
local function restore(why)
  if not native or not P.aimed then return true end
  local was = TRACING
  TRACING = true
  local o, err = N('restore', tonumber(P.objId))
  TRACING = was
  P.aimed = false
  local r = read('restored')
  local wrong = r and numbersWrong(r) or { 'the terminals could not be read' }
  ev(string.format('RESTORED (%s): %s; %s', why, o and string.format('%d numbers put back through procInitTerminals, %d written back, %d left alone, %d not as at the start', o.records, o.written, o.left, o.failed)
    or ('restore FAILED: ' .. tostring(err)), #wrong == 0 and 'every terminal\'s number reads as at stage A' or ('NOT AS AT STAGE A: ' .. table.concat(wrong, ', '))))
  return o ~= nil and #wrong == 0
end

-- the deck spot the mission itself gives a slot (the "slot per spot" mission: unit 20 is spot 1's, 200 + n spot n's)
local function ownSpot(slot)
  if P.mode ~= 'slots' then return nil end
  local n = tonumber(slot)
  if n == 20 then return 1 end
  if n and n > 200 and n <= 240 then return n - 200 end
  return nil
end

local function describe(v)
  if v.watch then return v.plain and 'a plain spawn: nothing set' or 'watch only: nothing set' end
  return string.format('%saim(%d, %s%s)%s', v.case and string.format('case %d, the first spawn of the mission: %s', v.case, v.prime and 'the chooser asked once and given back, then ' or '') or '', v.spot,
    v.mode or 'up', v.write and ', writes allowed' or '', v.inCallback and ', and again inside the slot request' or '')
end

local function finish(t)
  restore('the series is over')
  ev(string.format('THE SERIES IS OVER: %d rounds', #P.results))
  local hits = {}
  for i, res in ipairs(P.results) do
    ev(string.format('  RESULT round %d [%s], aim %s: %s', i, res.what, res.aim, res.text))
    if res.on then hits[#hits + 1] = res.aim end
  end
  say(#hits > 0 and ('CATCC test: finished. ON THE TARGET: ' .. table.concat(hits, '; ') .. '.') or 'CATCC test: finished. Nothing put the jet on the target. The log has it all.')
  go('watch', t)
end

local startRound

local function record(t, text, on, p)
  local v = P.v
  P.results[#P.results + 1] = { what = describe(v), aim = v.watch and 'none' or string.format('spot %d (%s)', P.target.n, P.target.name), text = text, on = on }
  ev(string.format('ROUND %d RESULT [%s]: %s', P.round, describe(v), text))
  if p then P.prevObj = p.obj end
  if v.case then
    caseNote(v.case, p and (on and 'done landed' or 'done missed') or 'not set')
    P.caseOpen = nil
    if on then
      -- THE FIRST SPAWN OF THE MISSION LANDED: the same mode on other spots, in this mission
      for _, f in ipairs(FOLLOW) do P.plan[#P.plan + 1] = { spot = f.spot, mode = v.mode, write = f.write, risky = f.write, why = f.write and 'the first spawn with numbers written directly into spawn-only terminals' or nil } end
      ev(string.format('CASE %d (%s) LANDED: %d more rounds follow in this mission, in the same mode', v.case, tostring(v.name), #FOLLOW))
    else
      ev(string.format('CASE %d (%s) did not land. Host the mission again for the next case.', v.case, tostring(v.name)))
    end
  end
  P.round = P.round + 1
  return startRound(t, string.format('round %d: %s.', P.round - 1, v.watch and ('spot ' .. tostring(p and p.spot)) or (on and 'ON THE TARGET' or (p and ('spot ' .. tostring(p.spot) .. ', ' .. tostring(p.spotName)) or 'not set'))))
end

-- is an aircraft standing on the round's target?
local function targetTaken()
  local r = N('terminals')
  if not r then return false end
  for i = 1, r.n do
    if P.T[i] and P.T[i].spot == P.target.n and r.t[i].obj then return true end
  end
  return false
end

-- CASE 3, "prime": DCS's chooser (woATC::setClientSpawnOnTerminalMiss) asked once, and what it took given back (free(),
-- then woATC::procInitTerminals with stage A's record: run 4's release, good for a terminal with a Term_Index of its
-- own). The hope: whatever DCS does once at the first client spawn, it does here, with every number untouched.
-- true: asked, given back, and every terminal reads as at stage A.
local function prime()
  local was = TRACING
  TRACING = true
  local ns, es = N('snapstate')
  if not ns then
    TRACING = was
    ev('prime: the terminals\' records could not be kept (nothing could be given back): not done: ' .. tostring(es))
    return false
  end
  local c, err = N('spawnonmiss', DUMMY_ID + 1, HORNET, HORNET_MASS)
  if not c or c <= 0 then
    TRACING = was
    ev('prime: the chooser gave ' .. (c == 0 and 'nothing' or ('an error: ' .. tostring(err))))
    return c == 0
  end
  local lost = (P.T[c] and P.T[c].ix or -1) < 0
  N('release', c)
  local ok, e = N('initterms', c)
  TRACING = was
  local r = read('prime')
  local wrong = r and numbersWrong(r) or { 'the terminals could not be read' }
  local same = r and r.t[c] and r.t[c].x == P.x0[c] and r.t[c].free == true
  ev(string.format('PRIMED: the chooser asked once (id %d): it gave %s; given back: %s', DUMMY_ID + 1, label(c),
    (same and #wrong == 0) and 'done, every terminal reads as at stage A' or (lost and 'NOT POSSIBLE: it has no Term_Index' or ('IT DID NOT TAKE: ' .. tostring(ok and table.concat(wrong, ', ') or e)))))
  return same and #wrong == 0
end

-- aim, the numbers read, and the lowest in play must be the target's. false: the round cannot be asked of the user
-- (what was lifted is restored)
local function setRound(v, when)
  P.aimPending = false
  if v.prime and not prime() then
    ev('prime failed: this round is not asked of the user')
    return false
  end
  local a = aim(v, when)
  local n = a and sayPrediction('after aim')
  if not a or a.failed > 0 or a.blocked > 0 or n ~= v.spot then
    -- (the target's number is not the lowest in play: a spawn would go elsewhere)
    ev(a and string.format('THE TARGET IS NOT THE NEXT SPOT (%d spawn-only spots in the way, %d numbers not as wanted): this round is not asked of the user', a.blocked, a.failed)
      or 'aim failed: this round is not asked of the user')
    restore('the round could not be set')
    return false
  end
  return true
end

-- the round's target aimed at (native.aim), verified by reading, and the user asked for a spawn; `done`: what to say
-- of the round before
startRound = function(t, done)
  local v = P.plan[P.round]
  if not v then return finish(t) end
  P.v = v
  P.spawnAt, P.slot, P.target, P.aimPending = nil, nil, nil, false
  if v.watch then
    ev(string.format('ROUND %d of %d: %s', P.round, #P.plan, describe(v)))
  else
    for _, s in ipairs(P.spots) do if s.n == v.spot then P.target = s end end
    if not P.target then
      P.target = { n = v.spot, name = '?' }
      ev(string.format('ROUND %d of %d: spot %d is not a spot of crewtest_routes.lua', P.round, #P.plan, v.spot))
      return record(t, 'the round could not be set (see above)', false, nil)
    end
    ev(string.format('ROUND %d of %d: %s; aim: spot %d (%s)', P.round, #P.plan, describe(v), P.target.n, P.target.name))
    if v.write and not WRITE_SPAWN_ONLY_NUMBERS then out('  (WRITE_SPAWN_ONLY_NUMBERS is off: the spawn-only spots before the target stay in play)') end
    if targetTaken() then
      -- (the jet of the round before stands on this round's target: aim follows once it has gone)
      P.aimPending = true
      ev('an aircraft stands on the target: aim follows when it has gone (release the slot)')
    elseif not setRound(v, 'the round set') then
      return record(t, 'the round could not be set (see above)', false, nil)
    end
  end
  local warn = v.risky and ' THIS SPAWN MAY FREEZE DCS.' or ''
  if v.case then warn = string.format(' Case %d of %d ("%s"): the first spawn of the mission.', v.case, #CASES, tostring(v.name)) .. warn end
  if v.risky then ev(string.format('round %d is one that may freeze DCS: %s', P.round, tostring(v.why or ''))) end
  if done then
    say(string.format('CATCC test: %s Release the slot and spawn again (round %d of %d).%s%s', done, P.round, #P.plan, v.watch and '' or (' Aim: ' .. P.target.name .. '.'), warn))
  else
    say(string.format('CATCC test: ready (round %d of %d). Take a Hornet slot on %s now.%s%s', P.round, #P.plan, tostring(P.ship), v.watch and '' or (' Aim: ' .. P.target.name .. '.'), warn))
  end
  go('await', t)
end

-- the round is over: restore, verified by reading; the result
local function finishRound(t, p)
  local v = P.v
  TRACING, P.frames = false, nil
  local on = (not v.watch) and p.spot == P.target.n and p.dist < 3
  if v.watch then read('after the round') else restore('round ' .. P.round) end
  local own = ownSpot(P.slot)
  local text = string.format('the jet stood on spot %d (%s)%s', p.spot, tostring(p.spotName), v.watch and (own and (own == p.spot and ': the slot\'s own spot' or string.format(': NOT the slot\'s own spot (%d)', own)) or '')
    or (on and ': ON THE TARGET' or ': NOT on the target'))
  return record(t, text, on, p)
end

-- the slot was asked for (onPlayerTryChangeSlot), in a round: aim once more (as the slot picker will call it: just
-- before the slot is taken; it lifts nothing twice), and the numbers read
local function onTry(playerID, side, slot)
  local t = os.clock()
  if slot == '' or tonumber(side) == 0 then return end
  if P.phase == 'spawning' and P.spawnAt then return end
  local v = P.v
  local own = ownSpot(slot)
  P.slot, P.player = slot, playerID
  ev(string.format('round %d: slot %s asked for by player %s%s', P.round, slot, tostring(playerID), own and string.format(' (the mission puts it on spot %d)', own) or ''))
  if own and not v.watch and own == P.target.n then out('  (this slot is the target\'s own slot: landing there proves nothing)') end
  if v.case then
    -- (written before DCS spawns: found again without "done" at the next mission start, it says the spawn froze)
    caseNote(v.case, 'started')
    P.caseOpen = v.case
    out(string.format('  the case file: case %d started', v.case))
  end
  -- (from here to the aircraft: every native call and the first frames are logged, so that a freeze can be placed)
  TRACING = TRACE_AFTER_SLOT
  P.frames, P.beat = 0, 0
  if v.watch then
    read('slot ' .. slot .. ' asked for')
  else
    if v.inCallback or P.aimPending then
      P.aimPending = false
      aim(v, 'at the slot request')
    end
    sayPrediction('at the slot request')
  end
  out('  the slot request is answered: back to DCS')
  go('spawning', t)
end

-- ---------------------------------------------------------------- the run
local function begin(t)
  P.results, P.round = {}, 1
  if #P.plan == 0 then
    ev('WATCH MODE only (no rounds are set for this mission): every terminal change and every slot event is logged')
    if P.allDone then say('CATCC test: every case has been run. Nothing is aimed in this mission.') end
    return go('watch', t)
  end
  return startRound(t)
end

local function tick()
  local t = os.clock()
  if P.phase == 'off' then return end
  if t - P.lastPoll < 1 then return end
  P.lastPoll = t
  if P.phase == 'start' then
    -- (ten seconds into the mission: the mission's own objects are there)
    if t - P.at < 10 then return end
    local spots, err = loadSpots()
    if not spots then
      ev('STOPPED: the deck spots could not be read (Scripts/CATCC/crewtest_routes.lua): ' .. tostring(err))
      return go('off', t)
    end
    -- (stage A names the rounds' targets and shows their terminals)
    P.spots, P.targets = spots, {}
    local all = {}
    for _, v in ipairs(CASES) do all[#all + 1] = v end
    for _, v in ipairs(FOLLOW) do all[#all + 1] = v end
    for _, v in ipairs(all) do
      local had = false
      for _, s in ipairs(P.targets) do if s.n == v.spot then had = true end end
      for _, s in ipairs(spots) do if s.n == v.spot and not had then P.targets[#P.targets + 1] = s end end
    end
    local lit = {}
    for _, s in ipairs(spots) do lit[#lit + 1] = string.format('{n=%d,name=%q,x=%.3f,z=%.3f,a=%.5f}', s.n, s.name, s.x, s.z, s.a) end
    local r, e = mission('local SPOTS = {' .. table.concat(lit, ',') .. '}\n' .. MISSION)
    if r ~= 'OK' then
      ev('STOPPED: the mission scripting state could not be reached (net.allow_dostring_in "server"?): ' .. tostring(r or e))
      return go('off', t)
    end
    local c = mission('return CATCC_ATCP.carrier()')
    local f = c and split(c, '|') or {}
    if f[1] ~= 'OK' then
      ev('STOPPED: no carrier: ' .. tostring(c))
      return go('off', t)
    end
    P.ship, P.shipId, P.objId = f[2], f[3], f[4]
    ev(string.format('carrier %s (%s; unit id %s, object id %s); %d deck spots', P.ship, tostring(f[5]), P.shipId, tostring(P.objId), #spots))
    if not tonumber(P.objId) then
      ev('STOPPED: the ship\'s object id could not be read from the mission (Unit.id_)')
      return go('off', t)
    end
    if not stageA() then
      ev('THE ROUNDS ARE SKIPPED: stage A failed')
      return go('off', t)
    end
    lookups()
    return begin(t)
  end
  if P.phase == 'await' then
    read('while waiting')
    if P.aimPending and not targetTaken() then
      if not setRound(P.v, 'the target is free') then return record(t, 'the round could not be set (see above)', false, nil) end
    end
    -- (an aircraft of a player's that is on the deck already is not the spawn awaited)
    local pl = players()
    if pl[1] then P.prevObj = pl[1].obj end
    if t - P.at > READY_WAIT then
      ev(string.format('nobody asked for a slot in %d s', READY_WAIT))
      return finish(t)
    end
    return
  end
  if P.phase == 'spawning' then
    if not P.spawnAt then
      P.beat = (P.beat or 0) + 1
      out(string.format('  second %d after the slot request: the hook runs, no aircraft yet', P.beat))
    end
    read(string.format('%.0f s after slot %s was asked for', t - P.at, tostring(P.slot)))
    local p
    for _, q in ipairs(players()) do if q.obj ~= P.prevObj then p = q end end
    if p then
      if not P.spawnAt then
        P.spawnAt = t
        local v = P.v
        local on = (not v.watch) and p.spot == P.target.n and p.dist < 3
        ev(string.format('PLAYER %s (%s; object id %s, unit id %s) stands %s m forward, %s m to starboard: %.1f m from spot %d (%s)%s', p.name, p.type, tostring(p.obj), tostring(p.unit), p.fw,
          p.st, p.dist, p.spot, tostring(p.spotName), v.watch and '' or (on and ': ON THE TARGET' or string.format(': NOT on the target (spot %d, %s)', P.target.n, P.target.name))))
        if p.obj then
          local ti, ptr, cls = N('termof', p.obj)
          out(string.format('  the ATC\'s terminal for object %d (%s): %s', p.obj, tostring(cls), ti == nil and ('could not be asked: ' .. tostring(ptr))
            or (ti > 0 and label(ti) or (ti == 0 and 'none' or ('one not in the list, ' .. tostring(ptr))))))
        end
        slotReport('the aircraft is there', tostring(P.slot))
        if not P.sideSaid then
          -- (once: which side decided. Here the server is also the player's own client: one process, one ATC.)
          P.sideSaid = true
          local okm, me = pcall(function() return net.get_my_player_id() end)
          ev(string.format('WHICH SIDE DECIDES: this process is the server (%s) and the player asking was player %s; its own player id is %s: %s.',
            tostring(DCS.isServer and DCS.isServer()), tostring(P.player), tostring(okm and me), (okm and tostring(me) == tostring(P.player)) and 'the host is the player: server and client are one process, so this run cannot tell them apart'
            or 'the player is a remote client: what this process\'s ATC gave is the SERVER\'s decision'))
        end
      end
      if t - P.spawnAt >= AFTER_SPAWN then return finishRound(t, p) end
    elseif t - P.at > SPAWN_WAIT then
      -- (what is lifted stays lifted: the round is still on)
      ev(string.format('no aircraft appeared in %d s after slot %s was asked for (refused by another hook? no spot left for it?)', SPAWN_WAIT, tostring(P.slot)))
      say(string.format('CATCC test: no aircraft appeared. Take a slot again (round %d of %d).', P.round, #P.plan))
      return go('await', t)
    end
    return
  end
  if P.phase == 'watch' then read('watching') end
end

local cb = {}

function cb.onMissionLoadEnd()
  P = { phase = 'off', at = 0, lastPoll = 0 }
  local server = DCS.isServer and DCS.isServer()
  local mp = DCS.isMultiplayer and DCS.isMultiplayer()
  -- (only in the test missions: any other mission is left alone, should this hook still be installed)
  local okn, name = pcall(function() return DCS.getMissionName() end)
  local okf, file = pcall(function() return DCS.getMissionFilename() end)
  local which = (tostring(okn and name or '') .. ' ' .. tostring(okf and file or '')):lower()
  -- (the file's folder is left out of the log: it holds the user's name)
  ev('---- mission loaded: ' .. tostring(okn and name or '?') .. '; server: ' .. tostring(server) .. ', multiplayer: ' .. tostring(mp))
  local plan = {}
  local steer = true
  if which:find('slot per spot', 1, true) then
    P.mode = 'slots'
    if SLOT_WATCH_FIRST then plan[1] = { watch = true } end
    steer = false
  elseif which:find('dynamic spawn', 1, true) then
    P.mode = 'dynamic'
  else
    out('not a test mission (its name has neither "dynamic spawn" nor "slot per spot"): nothing is done')
    return
  end
  if not (server and mp) then
    out('not a multiplayer server: nothing is done')
    return
  end
  if steer then
    local n, st = nextCase()
    local list = {}
    for k = 1, #CASES do list[k] = string.format('%d %s: %s', k, tostring(CASES[k].name), tostring(st[k] or 'not run yet')) end
    ev('the cases so far: ' .. table.concat(list, '; '))
    if n then
      local c = CASES[n]
      plan[#plan + 1] = { case = n, name = c.name, spot = c.spot, mode = c.mode, prime = c.prime, risky = true, why = 'an aimed spawn as the first spawn of the mission (case "' .. tostring(c.name) .. '")' }
      ev(string.format('THIS MISSION START RUNS CASE %d of %d ("%s")', n, #CASES, tostring(c.name)))
    else
      P.allDone = true
      ev('every case has been run (or left out): nothing is aimed in this mission start. Delete Logs\\catcc-atcprobe-case.txt to start over.')
    end
  end
  P.plan = plan
  out(string.format('mode: %s', P.mode == 'slots' and 'mission slots (watch mode)' or 'dynamic spawn'))
  go('start', os.clock())
end

-- restore: on a stop and on an error
local function cleanUp(why)
  pcall(restore, why)
end

local function failed(err)
  if P.errSaid then return end
  P.errSaid = true
  ev('ERROR (the probe stops; what it lifted is restored): ' .. tostring(err))
  cleanUp('an error in the probe')
  P.phase = 'off'
end

function cb.onSimulationFrame()
  if P.frames and P.frames < TRACE_FRAMES then
    P.frames = P.frames + 1
    out(string.format('  frame %d after the slot request (the hook runs)', P.frames))
  end
  local ok, err = pcall(tick)
  if not ok then failed(err) end
end

-- (nothing is ever returned: DCS, and any other hook, decides about the slot as it would)
function cb.onPlayerTryChangeSlot(playerID, side, slotID)
  if P.phase == 'off' or P.phase == 'start' then return end
  local slot = tostring(slotID == nil and '' or slotID)
  out(string.format('onPlayerTryChangeSlot: player %s, side %s, slot %q', tostring(playerID), tostring(side), slot))
  local ok, err = pcall(function()
    if P.phase == 'await' or P.phase == 'spawning' then
      onTry(playerID, side, slot)
    elseif slot ~= '' then
      slotReport('slot ' .. slot .. ' asked for', slot)
    end
  end)
  if not ok then failed(err) end
end

function cb.onPlayerChangeSlot(playerID)
  if P.phase == 'off' or P.phase == 'start' then return end
  local okn, n = pcall(net.get_player_info, playerID, 'name')
  local oks, s = pcall(net.get_player_info, playerID, 'slot')
  local slot = tostring(oks and s or '')
  out(string.format('onPlayerChangeSlot: player %s (%s) -> slot %q', tostring(playerID), tostring(okn and n), slot))
  if slot ~= '' then
    local ok, err = pcall(slotReport, 'slot ' .. slot .. ' taken', slot)
    if not ok then failed(err) end
  end
end

function cb.onSimulationStop()
  if P.phase ~= 'off' or native then ev('---- simulation stopped (phase: ' .. tostring(P.phase) .. ')') end
  if P.caseOpen then
    caseNote(P.caseOpen, 'stopped')
    out(string.format('the case file: case %d stopped before its aircraft appeared: it is run again', P.caseOpen))
    P.caseOpen = nil
  end
  cleanUp('the simulation stopped')
  if native then pcall(native.detach) end
  P.phase = 'off'
end

DCS.setUserCallbacks(cb)
out('==== ATC probe loaded (DCS started)')
