-- CATCC chock test (DCS mission scripting environment, Lua 5.1). TEST ONLY.
--
-- Installed by the CATCC hook when Saved Games\DCS\Config\CATCC-test.lua returns { chockTest = true }.
-- Adds F10 > "CATCC chock test" for every player: puts stock static objects ("blockers") in front of
-- (optionally also behind) the jet's main wheels, linked to the carrier so they move with the deck,
-- to find out whether a static object physically holds the jet, and whether touching it damages it.
--
-- On screen: each blocker's measured size and height above the deck, then while blockers are out,
-- how far the jet has moved (carrier frame) and its life, whenever either changes.
--
-- Geometry: Hornet main gear at x -2.4378, z +-1.55 m from the aircraft origin, wheel diameter 0.68 m
-- (CoreMods/aircraft/FA-18C/FA-18C_hornet.lua). Linked statics: offsets.x = metres forward along the
-- carrier's heading, offsets.y = metres to starboard, offsets.angle = heading relative to the
-- carrier (radians); checked against the Supercarrier population template mission.

CATCC_CT = { players = {}, menus = {} }
local CT = CATCC_CT

local atan2 = math.atan2 or math.atan
local TWO_PI = 2 * math.pi

local GEAR = { along = -2.4378, across = 1.55, r = 0.34 } -- Hornet main gear (the test is Hornet only)
-- orient: 'along' keeps the object's length along the wheel's travel; default lies a long object across.
-- gap / behind: what a type starts with when picked (Closer / Farther / Toggle change it from there).
local TYPES = {
  -- our own (Mods/tech/CATCC-Chocks): a yellow block 0.36 long, 0.30 wide, 0.18 high, sloped both faces
  { type = 'CATCC_Chock',        category = 'ADEquipment', label = 'CATCC chock', orient = 'along', gap = 0.10, behind = true },
  -- stock statics with a collision shell (too big for chocks; kept for comparison)
  { type = 'trunks_small_cargo', category = 'Cargos', label = 'logs (small)' },
  { type = 'ammo_cargo',         category = 'Cargos', label = 'ammo box' },
  { type = 'f_bar_cargo',        category = 'Cargos', label = 'F-bar' },
  { type = 'barrels_cargo',      category = 'Cargos', label = 'barrels' },
  { type = 'm117_cargo',         category = 'Cargos', label = 'M117 pallet' },
  { type = 'AS32-31A',           category = 'ADEquipment', label = 'deck tractor (large)' },
}
local GAP0, GAP_STEP, GAP_MIN, GAP_MAX = 0.30, 0.05, 0.0, 1.0
local SAY_S = 8

local function say(gid, text) trigger.action.outTextForGroup(gid, 'CATCC test: ' .. text, SAY_S) end

local function heading(v) return (atan2(v.z, v.x)) % TWO_PI end

-- the carrier the jet sits on: the nearest ship within 250 m horizontally
local function carrierUnder(p)
  local best, bestD = nil, 250
  for _, side in ipairs({ coalition.side.BLUE, coalition.side.RED, coalition.side.NEUTRAL }) do
    for _, g in ipairs(coalition.getGroups(side, Group.Category.SHIP) or {}) do
      for _, u in ipairs(g:getUnits() or {}) do
        if u and u:isExist() then
          local q = u:getPoint()
          local d = math.sqrt((q.x - p.x) ^ 2 + (q.z - p.z) ^ 2)
          if d < bestD then best, bestD = u, d end
        end
      end
    end
  end
  return best
end

-- world point -> carrier frame (forward, starboard)
local function toShip(ship, P)
  local c = ship:getPoint()
  local hc = heading(ship:getPosition().x)
  local dx, dz = P.x - c.x, P.z - c.z
  return dx * math.cos(hc) + dz * math.sin(hc), -dx * math.sin(hc) + dz * math.cos(hc), hc
end

local function playerState(unit)
  local name = unit:getName()
  local s = CT.players[name]
  if not s then
    s = { gap = GAP0, behind = false, blockers = {}, typeIdx = nil, seq = 0 }
    CT.players[name] = s
  end
  return s
end

local function removeBlockers(s)
  for _, n in ipairs(s.blockers) do
    local o = StaticObject.getByName(n)
    if o and o:isExist() then o:destroy() end
  end
  s.blockers = {}
  s.ref = nil
end

-- the object's box (local frame: x forward, y up, z right), from a quick spawn far out of the way if
-- the type can't be looked up directly; cached per type
local boxes = {}
local function spawnStatic(country, t, name, P, hdg, ship, hc)
  local fwd, stb = toShip(ship, P)
  local obj = {
    type = t.type, category = t.category, name = name,
    x = P.x, y = P.z, heading = hdg,
    linkUnit = ship:getID(), linkOffset = true,
    offsets = { x = fwd, y = stb, angle = (hdg - hc) % TWO_PI },
    canCargo = false, dead = false,
  }
  return coalition.addStaticObject(country, obj)
end

local function boxOf(t, country, ship, hc, unitPos)
  if boxes[t.type] then return boxes[t.type] end
  local box
  if StaticObject.getDescByName then
    local ok, d = pcall(StaticObject.getDescByName, t.type)
    if ok and type(d) == 'table' and d.box then box = d.box end
  end
  if not box then
    -- spawn 60 m aft of the carrier's origin, read it, remove it: no simulation step in between
    local c = ship:getPoint()
    local P = { x = c.x - 60 * math.cos(hc), y = c.y, z = c.z - 60 * math.sin(hc) }
    local o = spawnStatic(country, t, 'CATCC test probe ' .. t.type, P, hc, ship, hc)
    if o then
      local ok, d = pcall(o.getDesc, o)
      if ok and type(d) == 'table' and d.box then box = d.box end
      o:destroy()
    end
  end
  boxes[t.type] = box
  return box
end

local function place(unit, idx)
  local gid = unit:getGroup():getID()
  local s = playerState(unit)
  local t = TYPES[idx]
  if not t then return end
  if unit:inAir() then return say(gid, 'on deck only') end
  local pos = unit:getPosition()
  local ship = carrierUnder(pos.p)
  if not ship then return say(gid, 'no carrier under you') end
  removeBlockers(s)
  if s.typeIdx ~= idx then
    -- a newly picked type starts from its own gap and front/behind setting
    s.gap = t.gap or GAP0
    s.behind = t.behind or false
  end
  s.typeIdx = idx
  local hc = heading(ship:getPosition().x)
  local country = ship:getCountry()
  local box = boxOf(t, country, ship, hc, pos)
  if not box then return say(gid, t.label .. ': could not spawn it (type ' .. t.type .. ')') end
  local lenX, lenZ = box.max.x - box.min.x, box.max.z - box.min.z
  -- lie across the jet's path when the object is longer than it is wide (unless the type says otherwise)
  local across
  if t.orient == 'along' then across = false elseif t.orient == 'across' then across = true else across = lenX > lenZ end
  local hj = heading(pos.x)
  local hdg = across and (hj + math.pi / 2) % TWO_PI or hj
  -- the jet's horizontal forward and right
  local fx, fz = math.cos(hj), math.sin(hj)
  local rx, rz = -math.sin(hj), math.cos(hj)
  local spots = {}
  for _, side in ipairs({ -1, 1 }) do
    local wheelAcross = side * GEAR.across
    -- in front: the face toward the tyre sits gap ahead of it
    local frontFace = GEAR.along + GEAR.r + s.gap
    local along = across and (frontFace + box.max.z) or (frontFace - box.min.x)
    local acrossC = across and (wheelAcross - (box.min.x + box.max.x) / 2) or (wheelAcross - (box.min.z + box.max.z) / 2)
    spots[#spots + 1] = { along = along, across = acrossC, tag = (side < 0 and 'L' or 'R') .. ' front' }
    if s.behind then
      local backFace = GEAR.along - GEAR.r - s.gap
      local alongB = across and (backFace + box.min.z) or (backFace - box.max.x)
      spots[#spots + 1] = { along = alongB, across = acrossC, tag = (side < 0 and 'L' or 'R') .. ' behind' }
    end
  end
  local p = pos.p
  for _, sp in ipairs(spots) do
    s.seq = s.seq + 1
    local P = { x = p.x + fx * sp.along + rx * sp.across, y = p.y, z = p.z + fz * sp.along + rz * sp.across }
    local name = string.format('CATCC test %s %d %s', unit:getName(), s.seq, sp.tag)
    local o = spawnStatic(country, t, name, P, hdg, ship, hc)
    if o then s.blockers[#s.blockers + 1] = name end
  end
  local fwd, stb = toShip(ship, p)
  s.ref = { ship = ship:getName(), fwd = fwd, stb = stb, life = unit:getLife(), moved = 0, at = timer.getTime() }
  s.lastMoved, s.lastLife = 0, unit:getLife()
  -- report what went out: size, and height above the deck (a static that ignores the deck ends up in the sea)
  local h = '?'
  local first = s.blockers[1] and StaticObject.getByName(s.blockers[1])
  if first and first:isExist() then h = string.format('%.2f', first:getPoint().y - ship:getPoint().y) end
  say(gid, string.format('%s x%d placed, gap %.2f m, size %.2f long x %.2f wide x %.2f high, %s; ' ..
    'height above ship origin %s m (deck is about 20.15). Life %.1f/%.1f',
    t.label, #s.blockers, s.gap, lenX, lenZ, box.max.y - box.min.y, across and 'lying across' or 'end on',
    h, unit:getLife(), unit:getLife0()))
end

local function monitor(unit)
  if not unit or not unit:isExist() then return end
  local s = CT.players[unit:getName()]
  if not s or not s.ref or #s.blockers == 0 then return end
  local gid = unit:getGroup():getID()
  local ship = Unit.getByName(s.ref.ship)
  if not ship then return end
  local fwd, stb = toShip(ship, unit:getPoint())
  local df, ds = fwd - s.ref.fwd, stb - s.ref.stb
  local moved = math.sqrt(df * df + ds * ds)
  local life = unit:getLife()
  if math.abs(moved - s.lastMoved) >= 0.05 or math.abs(life - s.lastLife) >= 0.01 then
    s.lastMoved, s.lastLife = moved, life
    local alive = 0
    for _, n in ipairs(s.blockers) do
      local o = StaticObject.getByName(n)
      if o and o:isExist() then alive = alive + 1 end
    end
    say(gid, string.format('moved %.2f m (%.2f fwd, %.2f stbd) since placed; life %.1f/%.1f; blockers standing %d/%d',
      moved, df, ds, life, unit:getLife0(), alive, #s.blockers))
  end
end

local function tick(_, t)
  for name in pairs(CT.players) do
    local u = Unit.getByName(name)
    if u then pcall(monitor, u) end
  end
  return t + 0.25
end

local function withUnit(unitName, fn)
  return function()
    local u = Unit.getByName(unitName)
    if not u or not u:isExist() then return end
    local ok, err = pcall(fn, u)
    if not ok then say(u:getGroup():getID(), 'error: ' .. tostring(err)) end
  end
end

local function addMenu(unit)
  local g = unit:getGroup()
  if not g then return end
  local gid = g:getID()
  if CT.menus[gid] then return end
  CT.menus[gid] = true
  local un = unit:getName()
  local root = missionCommands.addSubMenuForGroup(gid, 'CATCC chock test')
  for i, t in ipairs(TYPES) do
    missionCommands.addCommandForGroup(gid, 'Place: ' .. t.label, root, withUnit(un, function(u) place(u, i) end))
  end
  missionCommands.addCommandForGroup(gid, 'Closer (gap -5 cm)', root, withUnit(un, function(u)
    local s = playerState(u)
    s.gap = math.max(GAP_MIN, s.gap - GAP_STEP)
    if s.typeIdx then place(u, s.typeIdx) else say(g:getID(), string.format('gap %.2f m', s.gap)) end
  end))
  missionCommands.addCommandForGroup(gid, 'Farther (gap +5 cm)', root, withUnit(un, function(u)
    local s = playerState(u)
    s.gap = math.min(GAP_MAX, s.gap + GAP_STEP)
    if s.typeIdx then place(u, s.typeIdx) else say(g:getID(), string.format('gap %.2f m', s.gap)) end
  end))
  missionCommands.addCommandForGroup(gid, 'Toggle: also behind the wheels', root, withUnit(un, function(u)
    local s = playerState(u)
    s.behind = not s.behind
    if s.typeIdx then place(u, s.typeIdx) else say(g:getID(), 'behind the wheels: ' .. (s.behind and 'on' or 'off')) end
  end))
  missionCommands.addCommandForGroup(gid, 'Remove blockers', root, withUnit(un, function(u)
    local s = playerState(u)
    removeBlockers(s)
    s.typeIdx = nil
    say(g:getID(), 'blockers removed')
  end))
end

local function scan()
  for _, side in ipairs({ coalition.side.BLUE, coalition.side.RED, coalition.side.NEUTRAL }) do
    for _, u in ipairs(coalition.getPlayers(side) or {}) do
      if u and u:isExist() then pcall(addMenu, u) end
    end
  end
end

local handler = {}
function handler:onEvent(e)
  if e and e.id == world.event.S_EVENT_BIRTH and e.initiator and e.initiator.getPlayerName and e.initiator:getPlayerName() then
    pcall(addMenu, e.initiator)
  end
end
world.addEventHandler(handler)
scan()
timer.scheduleFunction(function(_, t) pcall(scan) return t + 10 end, nil, timer.getTime() + 10)
timer.scheduleFunction(tick, nil, timer.getTime() + 1)
