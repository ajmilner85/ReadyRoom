-- CATCC STEER PROBE (an experiment, not part of the mod): can DCS's OWN choice of a spawn spot be steered to the spot
-- we want, by leaving that spot the only free one?
-- What is known (2026-11-21): a client's dynamic spawn on a carrier takes the lowest-numbered free spawn spot (three
-- spawns: all on spot 1); neither the server nor the client can name a spot in the request. DCS skips a spot that is
-- "blocked by players, AI, or static objects" (Hoggit wiki, DCS editor carrier spawns), and its slot screen asks
-- DCS.checkMultiplayerSpawnConflict("TakeOffParking", <ship>, false, "", "") whether a carrier has a free spot at all.
-- This hook, on the server, with nothing else of CATCC's needed (no deck spotting demo):
--   1. puts an object on EVERY spawn spot of the carrier (the 40 deck spots of the spotting plan: Scripts/CATCC/
--      crewtest_routes.lua), first a tiny one of our own (CATCC_AxleProbe), then DCS's deck tractor (AS32-31A), then a
--      static Hornet, each time asking DCS whether the carrier still has a free spot: which kind of object blocks?
--   2. takes the object off ONE spot (the target: the spot with the most room round it, not spot 1) and asks again:
--      does DCS see a free spot now?
--   3. says "ready" in the chat; the user dynamic-spawns with DCS's own screen; the hook logs where the jet stands:
--      on the target, or not. Ten seconds later every object is taken away.
-- Everything goes to Saved Games\DCS\Logs\catcc-steerprobe.log (and a line per event to dcs.log, CATCC-STEERPROBE).
-- Needs net.allow_dostring_in "gui" and "server" (the crew test's installer adds them), the spots installed as DCS's
-- spawn spots (director-test.ps1 -Spawn Spots) and, for the tiny object, the CATCC-Crew mod.
-- Install: copy to Saved Games\DCS\Scripts\Hooks\ with DCS closed. Remove it when done.

local writedir = lfs.writedir()
local LOG = writedir .. 'Logs/catcc-steerprobe.log'
local WAIT_BLOCK = 20 -- seconds DCS is given to call the carrier busy (or free again)
local KINDS = { 'tiny', 'tug', 'jet' }
local KIND_NAME = { tiny = 'our own tiny object (CATCC_AxleProbe)', tug = 'DCS\'s deck tractor (AS32-31A)', jet = 'a static Hornet' }

local function out(s)
  pcall(log.write, 'CATCC-STEERPROBE', log.INFO, (#s > 300) and (s:sub(1, 300) .. ' ...') or s)
  local f = io.open(LOG, 'a')
  if f then
    f:write(os.date('%H:%M:%S '), s, '\n')
    f:close()
  end
end

-- the deck spots (the spawn spots once installed): number, name, where (ship's frame: x forward, z to starboard),
-- the way a jet parked there points (an angle clockwise from the bow)
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

-- the target: the spot with the most room round it (a static Hornet's wings are spread: its neighbours kept clear of
-- the player's jet), never the lowest-numbered one (DCS's own first choice: landing there would prove nothing)
local function pickTarget(spots)
  local lowest
  for _, s in ipairs(spots) do if not lowest or s.n < lowest then lowest = s.n end end
  local best, bd
  for _, s in ipairs(spots) do
    if s.n ~= lowest then
      local d
      for _, o in ipairs(spots) do
        if o.n ~= s.n then
          local q = math.sqrt((s.x - o.x) ^ 2 + (s.z - o.z) ^ 2)
          if not d or q < d then d = q end
        end
      end
      if d and (not bd or d > bd) then best, bd = s, d end
    end
  end
  return best, bd, lowest
end

-- THE MISSION SCRIPTING STATE's side (net.dostring_in 'server'): the objects, the players
local MISSION = [[
CATCC_STEER = CATCC_STEER or {}
local S = CATCC_STEER
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
-- the carrier: "OK|<name>|<unit id>|<terminals>|<marked taken>|<listed as available>" (Airbase:getParking)
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
  return string.format('OK|%s|%s|%d|%d|%d', S.ship, tostring(u:getID()), n, taken, avail)
end
-- an object of that kind on every spot but `except`: "OK|<made>|<failed>|<why>"
function S.block(kind, except, only)
  local u = shipUnit()
  if not u then return 'ERR|no carrier' end
  local typ, cat = 'CATCC_AxleProbe', 'ADEquipment'
  if kind == 'tug' then typ, cat = 'AS32-31A', 'ADEquipment' elseif kind == 'jet' then typ, cat = 'FA-18C_hornet', 'Planes' end
  local c = u:getPoint()
  local sx = u:getPosition().x
  local hc = math.atan2(sx.z, sx.x) % TWO_PI
  local made, failed, why = 0, 0, ''
  for _, sp in ipairs(S.spots) do
    local name = 'catcc-steer-' .. sp.n
    local old = StaticObject.getByName(name)
    if old then pcall(old.destroy, old) end
    if sp.n ~= except and (not only or sp.n == only) then
      -- (a static LINKED to the ship, as the deck spotting demo makes its aircraft: crewtest.lua, linkedStatic)
      local ok, res = pcall(coalition.addStaticObject, u:getCountry(), { type = typ, category = cat, name = name,
        x = c.x + sp.x * math.cos(hc) - sp.z * math.sin(hc), y = c.z + sp.x * math.sin(hc) + sp.z * math.cos(hc), heading = (hc + sp.a) % TWO_PI,
        linkUnit = u:getID(), linkOffset = true, offsets = { x = sp.x, y = sp.z, angle = sp.a % TWO_PI }, canCargo = false, dead = false })
      if ok and res then made = made + 1 else failed = failed + 1 why = tostring(res) end
    end
  end
  return string.format('OK|%d|%d|%s', made, failed, why)
end
-- the object of one spot taken away (n), or of every spot (no n): "OK|<taken away>"
function S.unblock(n)
  local gone = 0
  for _, sp in ipairs(S.spots) do
    if not n or sp.n == n then
      local old = StaticObject.getByName('catcc-steer-' .. sp.n)
      if old then
        pcall(old.destroy, old)
        gone = gone + 1
      end
    end
  end
  return 'OK|' .. gone
end
-- every player's aircraft on the carrier: "<player>|<type>|<fwd>|<stbd>|<nearest spot's number>|<its name>|<how far>;..."
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
          res[#res + 1] = string.format('%s|%s|%.1f|%.1f|%d|%s|%.1f', tostring(pu:getPlayerName()), tostring(pu:getTypeName()), fw, st, best.n, best.name, bd)
        end
      end
    end
  end
  return table.concat(res, ';')
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

local function split(s, sep)
  local t = {}
  for v in (s .. sep):gmatch('(.-)' .. sep:gsub('%p', '%%%0')) do t[#t + 1] = v end
  return t
end

local P = { phase = 'off', at = 0, lastPoll = 0, seen = {} }

-- DCS's own question: has this carrier no free spot? Asked both ways DCS's slot screens ask it: for no aircraft type
-- (its dynamic spawn list) and for a Hornet (as for a slot of that type: an obstruction may be judged by the
-- aircraft's size). true: either says busy; false: both say free; nil: neither could be asked. And both answers, as text.
local function busy()
  local ok, r = pcall(net.dostring_in, 'gui', string.format([[
local function ask(typ)
  local ok, v = pcall(DCS.checkMultiplayerSpawnConflict, "TakeOffParking", %s, false, "", typ)
  return ok and tostring(v) or 'error'
end
return ask("") .. '|' .. ask("FA-18C_hornet")]], tostring(P.shipId)))
  if not ok or type(r) ~= 'string' then return nil, tostring(r) end
  local a, b = r:match('^(%a+)|(%a+)$')
  local text = string.format('for no type: %s, for a Hornet: %s', tostring(a), tostring(b))
  if a == 'true' or b == 'true' then return true, text end
  if a == 'false' or b == 'false' then return false, text end
  return nil, text
end

local function carrierLine(what)
  local r = mission('return CATCC_STEER.carrier()')
  local f = r and split(r, '|') or {}
  if f[1] == 'OK' then
    out(string.format('%s: Airbase:getParking: %s terminals, %s marked taken, %s listed as available', what, f[4], f[5], f[6]))
  end
end

local function say(text)
  out('SAID: ' .. text)
  pcall(net.send_chat, text, true)
  mission(string.format('return CATCC_STEER.say(%q)', text))
end

local function go(phase, t)
  P.phase, P.at, P.lastPoll, P.same = phase, t, 0, 0
end

local function block(kind, except, t, only)
  local r, err = mission(string.format('return CATCC_STEER.block(%q, %s, %s)', kind, except and tostring(except) or 'nil', only and tostring(only) or 'nil'))
  local f = r and split(r, '|') or {}
  out(string.format('%s put on %s spots%s%s', KIND_NAME[kind], tostring(f[2] or '?'),
    (tonumber(f[3]) or 0) > 0 and string.format(' (%s could not be made: %s)', f[3], tostring(f[4])) or '', r and '' or (': ' .. tostring(err))))
  return (tonumber(f[2]) or 0) > 0
end

local function finish(t, why)
  local r = mission('return CATCC_STEER.unblock()')
  out(string.format('%s: every object taken away (%s)', why, tostring(r)))
  go('watch', t)
end

-- the next kind of object put on every spot (one that DCS makes at all); none left: the test is over
local function nextKind(t)
  while true do
    P.kindIx = (P.kindIx or 0) + 1
    P.kind = KINDS[P.kindIx]
    if not P.kind then
      say('CATCC test: DCS does not see our objects as blocking. Do NOT spawn: tell Claude.')
      return finish(t, 'nothing blocked')
    end
    if block(P.kind, nil, t) then return go('blocked?', t) end
  end
end

local function players(t)
  local r = mission('return CATCC_STEER.players()')
  if not r or r == '' then return false end
  local any = false
  for _, part in ipairs(split(r, ';')) do
    local f = split(part, '|')
    if f[1] and f[5] then
      any = true
      local key = f[1] .. '|' .. f[5] .. '|' .. tostring(math.floor((tonumber(f[7]) or 0) + 0.5))
      if P.seen[f[1]] ~= key then
        P.seen[f[1]] = key
        local onTarget = P.target and tonumber(f[5]) == P.target.n and (tonumber(f[7]) or 99) < 3
        out(string.format('PLAYER %s (%s) stands %s m forward, %s m to starboard: %s m from spot %s (%s)%s', f[1], f[2], f[3], f[4], f[7], f[5], f[6],
          P.target and (onTarget and ': ON THE TARGET' or string.format(': NOT on the target (spot %d, %s)', P.target.n, P.target.name)) or ''))
      end
    end
  end
  return any
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
      out('the deck spots could not be read (Scripts/CATCC/crewtest_routes.lua): ' .. tostring(err))
      return go('off', t)
    end
    P.spots = spots
    local lit = {}
    for _, s in ipairs(spots) do lit[#lit + 1] = string.format('{n=%d,name=%q,x=%.3f,z=%.3f,a=%.5f}', s.n, s.name, s.x, s.z, s.a) end
    local r, e = mission('local SPOTS = {' .. table.concat(lit, ',') .. '}\n' .. MISSION)
    if r ~= 'OK' then
      out('the mission scripting state could not be reached (net.allow_dostring_in "server"?): ' .. tostring(r or e))
      return go('off', t)
    end
    local c = mission('return CATCC_STEER.carrier()')
    local f = c and split(c, '|') or {}
    if f[1] ~= 'OK' then
      out('no carrier: ' .. tostring(c))
      return go('off', t)
    end
    P.ship, P.shipId = f[2], f[3]
    local target, room, lowest = pickTarget(spots)
    P.target, P.lowest = target, lowest
    out(string.format('carrier %s (unit %s); %d spawn spots; DCS\'s own first choice is spot %d; the target is spot %d, %s (%.1f m to the nearest other spot)',
      P.ship, P.shipId, #spots, lowest, target.n, target.name, room))
    carrierLine('nothing on the deck')
    local b, why = busy()
    out('nothing on the deck: DCS says the carrier has ' .. (b == nil and '??' or (b and 'NO free spot' or 'a free spot')) .. ' (' .. tostring(why) .. ')')
    if b ~= false then
      out('STOPPED: the carrier is not free before anything is put on it (is dynamic spawn on for it? is net.allow_dostring_in "gui" set?)')
      return go('off', t)
    end
    -- THE SECOND TEST (2026-11-22; the first: with a static Hornet on every spot DCS's own question still answered
    -- "a free spot": that question does not look at objects). Does the SPAWN itself? One static Hornet on DCS's first
    -- choice (spot 1), nothing else: the user dynamic-spawns: on the next spot (it skips a spot with a static on it),
    -- or on spot 1, into the static (it does not).
    -- THE THIRD TEST (2026-11-22; the second: one static Hornet on spot 1: the spawn stood on spot 5, Bow stbd 6 (now Stbd bow 1), not in
    -- the static: the spawn does keep clear of a static, but spots 2 to 4 were passed over too). Now a static Hornet on
    -- EVERY spot but the target: does the spawn stand on the target?
    block('jet', target.n, t)
    out(string.format('a static Hornet on every spot but %d (%s): the only one without', target.n, target.name))
    return go('settle', t)
  end
  if P.phase == 'settle' then
    if t - P.at < 10 then return end
    local b, how = busy()
    out('the static Hornets there for 10 s: DCS says the carrier has ' .. (b and 'NO free spot' or 'a free spot') .. ' (' .. tostring(how) .. ')')
    say('CATCC test: ready. Dynamic spawn a Hornet on ' .. tostring(P.ship) .. ' now: the open spot is ' .. tostring(P.target.name) .. '.')
    return go('ready', t)
  end
  if P.phase == 'blocked?' then
    local b, how = busy()
    -- (the same answer three seconds running: not a moment's answer while the objects were being changed)
    P.same = (b == true) and (P.same + 1) or 0
    if P.same >= 3 then
      out(string.format('BLOCKED by %s: DCS says the carrier has no free spot (3 s running; %s), %.0f s after they were put there', KIND_NAME[P.kind], tostring(how), t - P.at))
      carrierLine('every spot blocked')
      mission('return CATCC_STEER.unblock(' .. P.target.n .. ')')
      out(string.format('the object on spot %d (%s) taken away: the only spot left open', P.target.n, P.target.name))
      return go('open?', t)
    end
    if t - P.at > WAIT_BLOCK then
      out(string.format('NOT blocked by %s: after %d s DCS still says the carrier has a free spot (%s)', KIND_NAME[P.kind], WAIT_BLOCK, tostring(how)))
      carrierLine('every spot has ' .. KIND_NAME[P.kind])
      return nextKind(t)
    end
    return
  end
  if P.phase == 'open?' then
    local b, how = busy()
    P.same = (b == false) and (P.same + 1) or 0
    if P.same >= 2 then
      out(string.format('OPEN: DCS says the carrier has a free spot again (2 s running; ' .. tostring(how) .. '), %.0f s after the target\'s object was taken away', t - P.at))
      carrierLine('one spot open')
      say(string.format('CATCC test: ready. Dynamic spawn on %s now (DCS slot list): the only open spot is %s.', P.ship, P.target.name))
      return go('ready', t)
    end
    if t - P.at > WAIT_BLOCK then
      out(string.format('NOT OPEN: %d s after the target\'s object was taken away DCS still says the carrier has no free spot', WAIT_BLOCK))
      say('CATCC test: the open spot did not come free. Do NOT spawn: tell Claude.')
      return finish(t, 'the spot did not open')
    end
    return
  end
  if P.phase == 'ready' then
    if players(t) then
      P.spawnAt = P.spawnAt or t
      if t - P.spawnAt > 10 then return finish(t, '10 s after the spawn') end
    elseif t - P.at > 600 then
      return finish(t, 'nobody spawned in 10 minutes')
    end
    return
  end
  if P.phase == 'watch' then players(t) end
end

local cb = {}

function cb.onMissionLoadEnd()
  P = { phase = 'off', at = 0, lastPoll = 0, seen = {} }
  local server = DCS.isServer and DCS.isServer()
  local mp = DCS.isMultiplayer and DCS.isMultiplayer()
  -- (only in the test mission: any other mission is left alone, should this hook still be installed)
  local okn, name = pcall(function() return DCS.getMissionName() end)
  local okf, file = pcall(function() return DCS.getMissionFilename() end)
  local which = tostring(okn and name or '') .. ' ' .. tostring(okf and file or '')
  out('---- mission loaded: ' .. which .. '; server: ' .. tostring(server) .. ', multiplayer: ' .. tostring(mp))
  if not which:lower():find('dynamic spawn', 1, true) then
    out('not the test mission (its name has no "dynamic spawn"): nothing is done')
  elseif server and mp then
    go('start', os.clock())
  else
    out('not a multiplayer server: nothing is done')
  end
end

function cb.onSimulationFrame()
  local ok, err = pcall(tick)
  if not ok and not P.errSaid then
    P.errSaid = true
    out('error: ' .. tostring(err))
  end
end

function cb.onPlayerChangeSlot(playerID)
  local okn, n = pcall(net.get_player_info, playerID, 'name')
  local oks, s = pcall(net.get_player_info, playerID, 'slot')
  out(string.format('onPlayerChangeSlot: %s -> slot %s', tostring(okn and n), tostring(oks and s)))
end

function cb.onSimulationStop()
  out('---- simulation stopped (phase: ' .. tostring(P.phase) .. ')')
  P.phase = 'off'
end

DCS.setUserCallbacks(cb)
out('==== probe loaded (DCS started)')
