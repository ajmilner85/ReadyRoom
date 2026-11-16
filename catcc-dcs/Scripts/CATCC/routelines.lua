-- CATCC deck route lines (DCS mission scripting environment, Lua 5.1). TEST ONLY.
--
-- Installed by the CATCC hook when Saved Games\DCS\Config\CATCC-test.lua returns { routeLines = true }.
-- Needs the CATCC-RouteLines mod (catcc-dcs/deck-test/route-lines/install.ps1). Adds F10 > "CATCC route
-- lines" for every player: the Supercarrier's spawn-spot -> catapult routes (GT.TaxiForTORoutes) painted
-- on the deck, white as DCS ships them, red with the director test's bend (deck-test/director-reroute.lua),
-- blue with the spawn spots moved (deck-test/director-spawn.lua) and a yellow X on the stock spawn spot.
-- Each line is one static object linked to the carrier at its route's first point (the spawn spot; the
-- moved one for blue). The models have no collision geometry.
-- Linked statics: offsets.x = metres forward along the carrier's heading, offsets.y = metres to
-- starboard, offsets.angle = heading relative to the carrier (as in chocktest.lua).

-- This Lua state outlives a mission, so the hook installs this file again at every mission start.
CATCC_RL_GEN = (CATCC_RL_GEN or 0) + 1
local GEN = CATCC_RL_GEN
local function live() return GEN == CATCC_RL_GEN end
CATCC_RL = { menus = {}, placed = {}, seq = 0 }
local RL = CATCC_RL

-- ROUTES BEGIN (written by deck-test/route-lines/routes.mjs: route number, catapult, first point x / z,
local ROUTES = {
  { n = 1, cat = 1, x = 24.5, z = 9.5, mx = 20.9, mz = 5.6, name = '1 spawn spot(6pack 1) -> catapult 1' },
  { n = 2, cat = 2, x = 7.6, z = 10.5, mx = 4.9, mz = 6.6, name = '2 spawn spot(6pack 2) -> catapult 2' },
  { n = 3, cat = 3, x = -9.9, z = 10.8, mx = -14.6119, mz = 4.3349, name = '3 spawn spot(6pack 3) -> catapult 3' },
  { n = 4, cat = 4, x = -26, z = 12, mx = -32.8133, mz = 7.8072, name = '4 spawn spot(6pack 4) -> catapult 4' },
  { n = 5, cat = 1, x = -11, z = 34, mx = -11, mz = 26, name = '5 spawn spot(lift2 p1) -> catapult 1' },
  { n = 6, cat = 2, x = -23, z = 34, mx = -23, mz = 26, name = '6 spawn spot(lift2 p2) -> catapult 2' },
  { n = 7, cat = 3, x = -96, z = -34, mx = -96, mz = -26, name = '7 spawn spot(lift4 p1) -> catapult 3' },
  { n = 8, cat = 4, x = -108, z = -34, mx = -108, mz = -26, name = '8 spawn spot(lift4 p2) -> catapult 4' },
  { n = 9, cat = 1, x = -90, z = 34, mx = -90, mz = 26, name = '9 spawn spot(lift3 p1) -> catapult 1' },
  { n = 10, cat = 2, x = -102.5, z = 34, mx = -102.5, mz = 26, name = '10 spawn spot(lift3 p2) -> catapult 2' },
  { n = 11, cat = 1, x = 35, z = 34, mx = 35, mz = 28, name = '11 spawn spot(lift1 p1) -> catapult 1' },
  { n = 12, cat = 2, x = 23, z = 34, mx = 23, mz = 27.4, name = '12 spawn spot(lift1 p2) -> catapult 2' },
  { n = 13, cat = 2, x = 6, z = 32.5, mx = 6, mz = 24.5, name = '13 spawn spot(between lift1 and lift2) -> catapult 2' },
  { n = 14, cat = 1, x = -118, z = 28, mx = -114.4223, mz = 20.8446, name = '14 spawn spot(3 parking spot) -> catapult 1' },
  { n = 15, cat = 3, x = -129.2, z = 26.2, mx = -124.2643, mz = 19.9041, name = '15 spawn spot(2 parking spot) -> catapult 3' },
  { n = 16, cat = 4, x = -141.15, z = 24.2, mx = -138.66, mz = 22.4, name = '16 spawn spot(1 parking spot) -> catapult 4' },
}
-- ROUTES END

local atan2 = math.atan2 or math.atan
local TWO_PI = 2 * math.pi
local SAY_S = 15
local MINE_M = 4 -- routes starting this close to the jet count as "my spot"

local function say(gid, text)
  trigger.action.outTextForGroup(gid, 'CATCC route lines: ' .. text, SAY_S)
  if env and env.info then env.info('CATCC route lines: ' .. text) end
end

local function heading(v) return (atan2(v.z, v.x)) % TWO_PI end

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

local function toShip(ship, P)
  local c = ship:getPoint()
  local hc = heading(ship:getPosition().x)
  local dx, dz = P.x - c.x, P.z - c.z
  return dx * math.cos(hc) + dz * math.sin(hc), -dx * math.sin(hc) + dz * math.cos(hc)
end

local function removeAll()
  for _, n in ipairs(RL.placed) do
    local o = StaticObject.getByName(n)
    if o and o:isExist() then o:destroy() end
  end
  RL.placed = {}
end

-- what each look is called in messages
local LOOK_TEXT = { Stock = 'white = stock', Bent = 'red = test bend', Moved = 'blue = moved spawn, yellow X = stock spawn' }

-- one line: type CATCC_RouteNN_<look>, linked to the carrier at the route's first point (the model's
-- origin: the moved first point for Moved)
local function placeLine(ship, r, look)
  local c = ship:getPoint()
  local hc = heading(ship:getPosition().x)
  local ox, oz = r.x, r.z
  if look == 'Moved' then ox, oz = r.mx, r.mz end
  local P = { x = c.x + ox * math.cos(hc) - oz * math.sin(hc), z = c.z + ox * math.sin(hc) + oz * math.cos(hc) }
  RL.seq = RL.seq + 1
  local name = string.format('CATCC route line %02d %s %d', r.n, look, RL.seq)
  local o = coalition.addStaticObject(ship:getCountry(), {
    type = string.format('CATCC_Route%02d_%s', r.n, look), category = 'ADEquipment', name = name,
    x = P.x, y = P.z, heading = hc,
    linkUnit = ship:getID(), linkOffset = true,
    offsets = { x = ox, y = oz, angle = 0 },
    canCargo = false, dead = false,
  })
  if not o then return nil end
  RL.placed[#RL.placed + 1] = name
  return StaticObject.getByName(name) or o
end

local function show(unit, which, looks)
  local gid = unit:getGroup():getID()
  local ship = carrierUnder(unit:getPoint())
  if not ship then return say(gid, 'no carrier within 250 m') end
  local list = {}
  if which == 'mine' then
    local fwd, stb = toShip(ship, unit:getPoint())
    local nearest, nd = nil, 1e9
    for _, r in ipairs(ROUTES) do
      -- the stock spawn spot or the moved one (director-test.ps1 -Spawn Shift)
      local d = math.min(math.sqrt((r.x - fwd) ^ 2 + (r.z - stb) ^ 2), math.sqrt((r.mx - fwd) ^ 2 + (r.mz - stb) ^ 2))
      if d <= MINE_M then list[#list + 1] = r end
      if d < nd then nearest, nd = r, d end
    end
    if #list == 0 then
      return say(gid, string.format('no route starts at your spot (you are at %.1f fwd, %.1f stbd; nearest is route %d, %.1f m away)',
        fwd, stb, nearest and nearest.n or 0, nd))
    end
  else
    list = ROUTES
  end
  removeAll()
  local names, h, fail = {}, nil, 0
  for _, r in ipairs(list) do
    for _, look in ipairs(looks) do
      local o = placeLine(ship, r, look)
      if not o then fail = fail + 1
      elseif not h and o.isExist and o:isExist() then h = o:getPoint().y - ship:getPoint().y end
    end
    names[#names + 1] = (which == 'mine') and r.name or tostring(r.n)
  end
  local what = {}
  for _, look in ipairs(looks) do what[#what + 1] = LOOK_TEXT[look] end
  say(gid, string.format('%s: %s. %d line(s)%s; height above the ship origin %s m (deck is about 20.15)',
    table.concat(what, ', '),
    table.concat(names, '; '), #RL.placed, fail > 0 and string.format(', %d failed (is the CATCC-RouteLines mod installed?)', fail) or '',
    h and string.format('%.2f', h) or '?'))
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
  if RL.menus[gid] then return end
  RL.menus[gid] = true
  local un = unit:getName()
  local root = missionCommands.addSubMenuForGroup(gid, 'CATCC route lines')
  missionCommands.addCommandForGroup(gid, 'My spot: white (stock) + red (test bend)', root,
    withUnit(un, function(u) show(u, 'mine', { 'Stock', 'Bent' }) end))
  missionCommands.addCommandForGroup(gid, 'My spot: white (stock) + blue (moved spawn, X = old spot)', root,
    withUnit(un, function(u) show(u, 'mine', { 'Stock', 'Moved' }) end))
  missionCommands.addCommandForGroup(gid, 'All routes: white (stock)', root,
    withUnit(un, function(u) show(u, 'all', { 'Stock' }) end))
  missionCommands.addCommandForGroup(gid, 'All routes: red (test bend)', root,
    withUnit(un, function(u) show(u, 'all', { 'Bent' }) end))
  missionCommands.addCommandForGroup(gid, 'All routes: blue (moved spawn, X = old spot)', root,
    withUnit(un, function(u) show(u, 'all', { 'Moved' }) end))
  missionCommands.addCommandForGroup(gid, 'Remove lines', root, withUnit(un, function(u)
    removeAll()
    say(gid, 'lines removed')
  end))
end

local function scan()
  for _, side in ipairs({ coalition.side.BLUE, coalition.side.RED, coalition.side.NEUTRAL }) do
    for _, u in ipairs(coalition.getPlayers(side) or {}) do
      if u and u:isExist() then pcall(addMenu, u) end
    end
  end
end

scan()
timer.scheduleFunction(function(_, t) if not live() then return nil end pcall(scan) return t + 5 end, nil, timer.getTime() + 5)
