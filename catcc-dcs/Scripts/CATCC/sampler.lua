-- CATCC sampler. Runs INSIDE the mission scripting environment (installed by catcc.lua via
-- net.dostring_in), where Unit/Group/coalition/coord/atmosphere exist but sockets don't.
-- Defines CATCC_sample(), which returns one JSON object describing the current picture.
-- Lua 5.1. No dependencies. Every call is wrapped in pcall, so it can never break the mission.

local CARRIERS = {
  CVN_71 = true, CVN_72 = true, CVN_73 = true, CVN_74 = true, CVN_75 = true,
  Stennis = true, Forrestal = true, LHA_Tarawa = true,
}

local floor, sqrt, atan2, deg = math.floor, math.sqrt, math.atan2, math.deg

local function esc(s)
  s = tostring(s == nil and '' or s)
  return (s:gsub('[%c"\\]', function(ch)
    if ch == '"' then return '\\"' end
    if ch == '\\' then return '\\\\' end
    return string.format('\\u%04x', ch:byte())
  end))
end

local function num(v, dp)
  if type(v) ~= 'number' or v ~= v or v == math.huge or v == -math.huge then return 'null' end
  return string.format('%.' .. dp .. 'f', v)
end

local function str(v)
  if v == nil then return 'null' end
  return '"' .. esc(v) .. '"'
end

local function wrap360(a)
  a = a % 360
  if a < 0 then a = a + 360 end
  return a
end

-- Angle between grid north (DCS +x) and true north at a point, radians.
local function northCorrection(p, lat, lon)
  local n = coord.LLtoLO(lat + 1, lon)
  return atan2(n.z - p.z, n.x - p.x)
end

-- Wind as "from" direction (deg true) and speed (m/s) at a point.
local function windAt(p, altM, nc)
  local w = atmosphere.getWind({ x = p.x, y = altM, z = p.z })
  if not w then return 'null', 'null' end
  local spd = sqrt(w.x * w.x + w.z * w.z)
  local to = deg(atan2(w.z, w.x) - nc)
  return num(wrap360(to + 180), 0), num(spd, 1)
end

local CATS -- built lazily: Group.Category may not exist when this file is first parsed

local function sampleUnit(u, side, catCode, gname, out, ships)
  local p = u:getPoint()
  local lat, lon = coord.LOtoLL(p)
  local nc = northCorrection(p, lat, lon)
  local pos = u:getPosition()
  local hdg = wrap360(deg(atan2(pos.x.z, pos.x.x) - nc))
  local v = u:getVelocity() or { x = 0, y = 0, z = 0 }
  local gs = sqrt(v.x * v.x + v.z * v.z)
  local crs = gs > 0.5 and wrap360(deg(atan2(v.z, v.x) - nc)) or nil
  local typeName = u:getTypeName()
  local fuel = nil
  if catCode ~= 'S' then fuel = u:getFuel() end
  local inAir = nil
  if catCode ~= 'S' then inAir = u:inAir() end
  local player = u.getPlayerName and u:getPlayerName() or nil

  local parts = {
    '{"id":', num(tonumber(u:getID()), 0),
    ',"n":', str(u:getName()),
    ',"t":', str(typeName),
    ',"g":', str(gname),
    ',"s":', tostring(side),
    ',"c":"', catCode, '"',
    ',"p":', str(player),
    ',"cs":', str(u:getCallsign()),
    ',"lat":', num(lat, 6),
    ',"lon":', num(lon, 6),
    ',"alt":', num(p.y, 1),
    ',"hdg":', num(hdg, 1),
    ',"gs":', num(gs, 2),
    ',"crs":', crs and num(crs, 1) or 'null',
    ',"vs":', num(v.y, 2),
  }
  if fuel ~= nil then parts[#parts + 1] = ',"f":' .. num(fuel, 4) end
  if catCode == 'S' then
    -- the unit database's display name ("CG Ticonderoga"): type names are terse and inconsistent
    local okD, desc = pcall(u.getDesc, u)
    if okD and type(desc) == 'table' and type(desc.displayName) == 'string' then parts[#parts + 1] = ',"dn":' .. str(desc.displayName) end
  end
  if inAir ~= nil then parts[#parts + 1] = ',"air":' .. (inAir and 'true' or 'false') end

  if catCode == 'S' and CARRIERS[typeName] then
    local d0, s0 = windAt(p, p.y + 20, nc)
    local d2, s2 = windAt(p, 610, nc)
    local d10, s10 = windAt(p, 3048, nc)
    local tK, pPa = atmosphere.getTemperatureAndPressure({ x = p.x, y = 0, z = p.z })
    parts[#parts + 1] = ',"wx":{"d0":' .. d0 .. ',"s0":' .. s0 .. ',"d2":' .. d2 .. ',"s2":' .. s2 ..
      ',"d10":' .. d10 .. ',"s10":' .. s10 .. ',"tK":' .. num(tK, 1) .. ',"qnh":' .. num(pPa, 0) .. '}'
  end
  parts[#parts + 1] = '}'
  out[#out + 1] = table.concat(parts)
end

local function body()
  if not CATS then
    CATS = {
      { Group.Category.AIRPLANE, 'A' },
      { Group.Category.HELICOPTER, 'H' },
      { Group.Category.SHIP, 'S' },
    }
  end
  local units = {}
  local errors = 0
  for side = 0, 2 do
    for _, cat in ipairs(CATS) do
      local groups = coalition.getGroups(side, cat[1]) or {}
      for _, g in ipairs(groups) do
        if g and g:isExist() then
          local gname = g:getName()
          for _, u in ipairs(g:getUnits() or {}) do
            if u and u:isExist() and u:isActive() then
              local ok = pcall(sampleUnit, u, side, cat[2], gname, units)
              if not ok then errors = errors + 1 end
            end
          end
        end
      end
    end
  end
  local date = env and env.mission and env.mission.date
  local dateStr = date and string.format('%04d-%02d-%02d', date.Year or 0, date.Month or 0, date.Day or 0) or nil
  local theatre = env and env.mission and env.mission.theatre
  return '{"mt":' .. num(timer.getTime(), 2) ..
    ',"abs":' .. num(timer.getAbsTime(), 2) ..
    ',"date":' .. str(dateStr) ..
    ',"theatre":' .. str(theatre) ..
    ',"unitErrors":' .. tostring(errors) ..
    ',"units":[' .. table.concat(units, ',') .. ']}'
end

CATCC_sample = function()
  local ok, res = pcall(body)
  if ok then return res end
  return '{"err":' .. str(res) .. '}'
end

-- Slow-changing mission environment: weather and every ship group's planned route (PIM).
-- Returns one JSON object. Called every ~30 s by catcc.lua.
local function envBody()
  local m = env and env.mission or {}
  local w = m.weather or {}
  local cl = w.clouds or {}
  local vis = w.visibility or {}
  local fog = w.fog or {}
  local parts = {
    '{"start":', num(m.start_time, 0),
    ',"date":', str(m.date and string.format('%04d-%02d-%02d', m.date.Year or 0, m.date.Month or 0, m.date.Day or 0) or nil),
    ',"theatre":', str(m.theatre),
    ',"wx":{"cb":', num(cl.base, 0), ',"ct":', num(cl.thickness, 0), ',"cd":', num(cl.density, 0),
    ',"cp":', str(cl.preset), ',"pr":', num(cl.iprecptns, 0),
    ',"vis":', num(vis.distance, 0),
    ',"fog":', (w.enable_fog and ('{"v":' .. num(fog.visibility, 0) .. ',"t":' .. num(fog.thickness, 0) .. '}') or 'null'),
    ',"dust":', (w.enable_dust and num(w.dust_density, 0) or 'null'),
    '},"routes":[',
  }
  local routes = {}
  for sideName, side in pairs(m.coalition or {}) do
    for _, country in ipairs(side.country or {}) do
      for _, g in ipairs((country.ship and country.ship.group) or {}) do
        if g.name and Group.getByName(g.name) then
          local pts = {}
          for _, p in ipairs((g.route and g.route.points) or {}) do
            local lat, lon = coord.LOtoLL({ x = p.x, y = 0, z = p.y })
            pts[#pts + 1] = '{"lat":' .. num(lat, 5) .. ',"lon":' .. num(lon, 5) .. ',"spd":' .. num(p.speed, 1) .. ',"eta":' .. num(p.ETA, 0) .. '}'
          end
          routes[#routes + 1] = '{"g":' .. str(g.name) .. ',"side":' .. str(sideName) .. ',"pts":[' .. table.concat(pts, ',') .. ']}'
        end
      end
    end
  end
  parts[#parts + 1] = table.concat(routes, ',')
  -- coalition bullseyes
  local bulls = {}
  local sides = (coalition.side and coalition.getMainRefPoint) and { { 'blue', coalition.side.BLUE }, { 'red', coalition.side.RED } } or {}
  for _, sd in ipairs(sides) do
    local okB, p = pcall(coalition.getMainRefPoint, sd[2])
    if okB and p then
      local lat, lon = coord.LOtoLL(p)
      bulls[#bulls + 1] = '{"side":' .. str(sd[1]) .. ',"lat":' .. num(lat, 5) .. ',"lon":' .. num(lon, 5) .. '}'
    end
  end
  parts[#parts + 1] = '],"bulls":['
  parts[#parts + 1] = table.concat(bulls, ',')
  parts[#parts + 1] = ']}'
  return table.concat(parts)
end

-- ---------------------------------------------------------------- ship orders
-- Called by catcc.lua (already validated there). Each returns "OK" or "ERR:<reason>".
-- DCS AI ships take routes, not rudder or engine orders: the route's first point is where the
-- lead ship is now, so the group starts on it at once.

local KT = 1852 / 3600

local function shipGroup(name)
  local g = Group.getByName(name)
  if not g or not g:isExist() then return nil, nil, 'no group ' .. name end
  if g:getCategory() ~= Group.Category.SHIP then return nil, nil, name .. ' is not a ship group' end
  local u = g:getUnit(1)
  if not u or not u:isExist() then return nil, nil, name .. ' has no units' end
  return g, u
end

local function routePoint(x, z, mps)
  return {
    x = x, y = z, alt = 0, alt_type = 'BARO', type = 'Turning Point', action = 'Turning Point',
    speed = mps, speed_locked = true, ETA = 0, ETA_locked = false,
    task = { id = 'ComboTask', params = { tasks = {} } },
  }
end

-- pts: { {lat, lon, kt}, ... }
local function setRoute(g, u, pts)
  local here = u:getPoint()
  local route = { routePoint(here.x, here.z, pts[1][3] * KT) }
  for _, p in ipairs(pts) do
    local lo = coord.LLtoLO(p[1], p[2])
    route[#route + 1] = routePoint(lo.x, lo.z, p[3] * KT)
  end
  g:getController():setTask({ id = 'Mission', params = { route = { points = route } } })
end

local function guarded(f)
  return function(...)
    local ok, res = pcall(f, ...)
    if not ok then return 'ERR:' .. tostring(res) end
    return res
  end
end

-- Steer a true course at a speed: a waypoint 60 NM ahead (the room re-sends it before it is reached).
-- DCS ships don't go astern: a speed at or below zero stops the ship on its present heading.
CATCC_cmd_helm = guarded(function(name, crs, kt)
  local g, u, err = shipGroup(name)
  if not g then return 'ERR:' .. err end
  local p = u:getPoint()
  local lat, lon = coord.LOtoLL(p)
  local d = 60 / 60 -- 60 NM in degrees of latitude
  local r = math.rad(crs)
  local lat2 = lat + d * math.cos(r)
  local lon2 = lon + d * math.sin(r) / math.cos(math.rad(lat))
  setRoute(g, u, { { lat2, lon2, kt > 0 and kt or 0 } })
  if kt < 0 then return 'ERR:DCS ships cannot go astern; ordered stop' end
  return 'OK'
end)

CATCC_cmd_route = guarded(function(name, pts)
  local g, u, err = shipGroup(name)
  if not g then return 'ERR:' .. err end
  setRoute(g, u, pts)
  return 'OK'
end)

CATCC_env = function()
  local ok, res = pcall(envBody)
  if ok then return res end
  return '{"err":' .. str(res) .. '}'
end
