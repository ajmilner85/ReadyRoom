-- CATCC crew test: the folded flag tool (TEST ONLY): the in-game panel's "Flag" page. Loaded by crewtest_ui.lua.
-- The user, 2026-11-25: "add a small folded triangular american flag inside the canopy, forward of the canopy rail, on
-- top of the glareshield ... I only want to add it to select aircraft through my testing UI for now" (the reference: an
-- F-15E crew's photograph, the flag standing on its long edge, its point up, a face to the side).
--
--   Flag my jet / Flag selected   a flag on the player's jet, or on the aircraft the deck tool has selected (a click on
--                                 it); pressed again for the same aircraft, its flag taken away. Any number of aircraft
--                                 can have one. Each a static LINKED to the ship (CATCC_Flag, our mod's type:
--                                 crew-test/model/flag.py), made by the mission script (CATCC_CR.marker) as the chocks
--                                 are. A static linked to a ship stands on its deck: its height over the deck, its pitch
--                                 and its lean are model arguments (10, 11, 12), written every half second.
--   Take away all                 every flag taken away.
--   Fore / aft, Left / right,     where the flag sits on the glareshield and how it is turned: the same for every flag
--   Up / down, Turn, Pitch, Lean  (every Hornet's glareshield is the same), kept until DCS closes; "Report" logs them
--                                 (Logs\catcc-crewtest.log) to be made the defaults.
--
-- WHERE IT SITS: SPOT, a point of the F/A-18C's own frame (x forward of its origin, y up, z to starboard), read from
-- DCS's fa-18c.edm (its cockpit and windscreen meshes, the scratch reader of 2026-11-25): the glareshield's top beside
-- the HUD on the left, 0.929 m over the origin at x 4.40, z -0.20, sloping down forward by 12 degrees; the windscreen
-- 0.175 m over it there (the flag's point is 0.134 m up). The flag's long edge along the jet's nose. The aircraft's own
-- pose is asked of the mission (its position and axes in the ship's frame): the point carried with its pitch and roll,
-- so a jet sitting nose-up on its struts still has the flag on its glareshield. The cockpit seen from inside is another
-- model (the 3D cockpit): if the flag stands in it or floats, the moves put it right.
-- THE USER'S PLACE (in DCS, 2026-11-26, "Report": "The model's position is good where I reported it"): 4.270 forward,
-- 0.879 up, 0.322 to port; turned 188 degrees (its other face out), pitched 7 up, lying over on its side. The lean
-- reported was -64, but the model then turned 45 at most (the argument held at -1), so what was seen, and is kept, is
-- -45; the model now turns to 90 either way.
--
-- FOLLOWING ITS AIRCRAFT: every FOLLOW seconds each flagged aircraft is asked for again: gone (taken away, made anew for a
-- spawn) or in the air: its flag taken away; moved (towed, taxied) or turned: its flag made anew where it now is.
--
-- api (from the panel): dostring(code) in the mission's Lua state; split(s); objarg(id, n, v): native.objarg on the ship;
-- jetId(): the player's aircraft's object id and its type name; deck: the hook's Tow.Deck (list, lock, pose, ship,
-- label); log(text); now().
-- Returns the tool: toggle(what), clear(), move(key, d), report(), status(), tick() (a message to show, or nil), reset();
-- and placeFor(pose) (the static's place and arguments for an aircraft's pose).
local api = ...
local F = { list = {}, n = 0 }

-- the model (crew-test/model/flag.py: HEIGHT_ARG, PITCH_ARG, LEAN_ARG, BASE_HEIGHT, BASE_PITCH, BASE_LEAN, TURN_MAX; a test
-- keeps these the same). Its arguments at 0 are the user's pose on a Hornet on the flight deck (2.68 m up, pitch 7, lean
-- -45), so whatever draws it without them draws it there (its shadow may: the user, 2026-11-26, "The flag doesn't cast
-- any shadow on the jet"): height = BASE_HEIGHT x (1 + argument 10); pitch, lean = the base + TURN_MAX x argument
local M = { TYPE = 'CATCC_Flag', HEIGHT = 10, PITCH = 11, LEAN = 12, BASE_HEIGHT = 2.68, BASE_PITCH = 7.0, BASE_LEAN = -45.0, TURN_MAX = 90.0 }
F.M = M

-- the glareshield, by aircraft type (the aircraft's own frame: x forward, y up, z to starboard; degrees)
local SPOTS = {
  ['FA-18C_hornet'] = { x = 4.270, y = 0.879, z = -0.322, pitch = 7.0, lean = -45.0, turn = 188.0 },
}
F.SPOTS = SPOTS
-- the user's moves from there (metres and degrees), kept until DCS closes
local ADJ = { fwd = 0, up = 0, side = 0, turn = 0, pitch = 0, lean = 0 }
F.ADJ = ADJ
-- the decks' heights above the ship's origin: the flight deck, the hangar floor (as crewtest_chocks.lua has them)
local DECKS = { 20.149, 8.711 }
local KEEP = 0.5   -- seconds between writes of each flag's arguments
local FOLLOW = 1.0 -- seconds between asking where the flagged aircraft are
local MOVED, TURNED = 0.03, 0.5 -- metres, degrees: an aircraft moved more than this gets its flag made anew

local function mission(code)
  local ok, r = pcall(api.dostring, code)
  if not ok then return { 'ERR', tostring(r) } end
  if type(r) ~= 'string' then return { 'ERR', 'the menu script answered nothing' } end
  return api.split(r)
end

-- THE QUESTION: aircraft (units and statics, not our own CATCC_ statics) by object id (WANT), or the one nearest a
-- point of a ship (NEAR = { ship, x, z, r }): each "id,type,name,ship,air,px,py,pz,Xx,Xy,Xz,Yx,Yy,Yz,Zx,Zy,Zz" (its
-- position and axes in the ship's frame: x forward, y up, z to starboard), joined by ";", after "OK;"
local QUERY = [[
local SIDES = { coalition.side.BLUE, coalition.side.RED, coalition.side.NEUTRAL }
local ships = {}
for _, side in ipairs(SIDES) do
  for _, g in ipairs(coalition.getGroups(side, Group.Category.SHIP) or {}) do
    for _, u in ipairs(g:getUnits() or {}) do
      if u and u:isExist() then ships[#ships + 1] = { name = u:getName(), pos = u:getPosition() } end
    end
  end
end
local function dot(a, b) return a.x * b.x + a.y * b.y + a.z * b.z end
local function inShip(v, s) return dot(v, s.x), dot(v, s.y), dot(v, s.z) end
local out, best, bestD = {}, nil, nil
local function row(o, kind, s)
  local p = o:getPosition()
  local sp = s.pos
  local px, py, pz = inShip({ x = p.p.x - sp.p.x, y = p.p.y - sp.p.y, z = p.p.z - sp.p.z }, sp)
  local air = (kind == 'u' and o.inAir and o:inAir()) and 1 or 0
  local t = { tostring(o.id_), (o:getTypeName():gsub('[,;]', '_')), (o:getName():gsub('[,;]', '_')), (s.name:gsub('[,;]', '_')), tostring(air),
    string.format('%.4f', px), string.format('%.4f', py), string.format('%.4f', pz) }
  for _, v in ipairs({ p.x, p.y, p.z }) do
    local a, b, c = inShip(v, sp)
    t[#t + 1], t[#t + 2], t[#t + 3] = string.format('%.6f', a), string.format('%.6f', b), string.format('%.6f', c)
  end
  return table.concat(t, ','), px, pz
end
local function look(o, kind)
  local ok, typ = pcall(function() return o:isExist() and o:getTypeName() end)
  if not (ok and typ) or tostring(typ):find('^CATCC_') then return end
  local id = tonumber(o.id_)
  local p = o:getPosition()
  local ship, sd
  for _, s in ipairs(ships) do
    local dx, dz = p.p.x - s.pos.p.x, p.p.z - s.pos.p.z
    local d = dx * dx + dz * dz
    if not sd or d < sd then ship, sd = s, d end
  end
  if WANT[id] then
    if ship and sd < 400 * 400 then out[#out + 1] = (row(o, kind, ship)) else out[#out + 1] = tostring(id) .. ',GONE' end
    WANT[id] = nil
  end
  if NEAR and ship and ship.name == NEAR.ship then
    local r, px, pz = row(o, kind, ship)
    local d = (px - NEAR.x) ^ 2 + (pz - NEAR.z) ^ 2
    if d < NEAR.r * NEAR.r and (not bestD or d < bestD) then best, bestD = r, d end
  end
end
for _, side in ipairs(SIDES) do
  for _, cat in ipairs({ Group.Category.AIRPLANE, Group.Category.HELICOPTER }) do
    for _, g in ipairs(coalition.getGroups(side, cat) or {}) do
      for _, u in ipairs(g:getUnits() or {}) do pcall(look, u, 'u') end
    end
  end
  for _, s in ipairs(coalition.getStaticObjects(side) or {}) do pcall(look, s, 's') end
end
if best then out[#out + 1] = best end
return 'OK;' .. table.concat(out, ';')
]]

-- the mission asked: a list of poses (by object id), or nil and why
local function ask(ids, near)
  local want = {}
  for _, id in ipairs(ids or {}) do want[#want + 1] = string.format('[%d] = true', id) end
  local head = string.format('local WANT = { %s }\nlocal NEAR = %s\n', table.concat(want, ', '),
    near and string.format('{ ship = %q, x = %.4f, z = %.4f, r = %.2f }', near.ship, near.x, near.z, near.r) or 'nil')
  local ok, r = pcall(api.dostring, head .. QUERY)
  if not (ok and type(r) == 'string' and r:sub(1, 3) == 'OK;') then return nil, tostring(r) end
  local got = {}
  for one in r:sub(4):gmatch('[^;]+') do
    local f = {}
    for v in (one .. ','):gmatch('([^,]*),') do f[#f + 1] = v end
    local id = tonumber(f[1])
    if id and f[2] == 'GONE' then
      got[id] = { gone = true }
    elseif id and #f >= 17 then
      local n = {}
      for k = 6, 17 do n[#n + 1] = tonumber(f[k]) end
      got[id] = { id = id, type = f[2], name = f[3], ship = f[4], air = f[5] == '1', p = { n[1], n[2], n[3] }, X = { n[4], n[5], n[6] }, Y = { n[7], n[8], n[9] }, Z = { n[10], n[11], n[12] } }
      got.last = got[id]
    end
  end
  return got
end

-- where the flag's static stands for an aircraft's pose (ask's): { x, z, ang (radians clockwise from the bow), h (over
-- its deck), pitch, lean (degrees) }, or nil and why
function F.placeFor(o)
  local S = SPOTS[o.type]
  if not S then return nil, 'only the F/A-18C\'s glareshield is known (this is ' .. tostring(o.type) .. ')' end
  local sx, sy, sz = S.x + ADJ.fwd, S.y + ADJ.up, S.z + ADJ.side
  local P = {}
  for k = 1, 3 do P[k] = o.p[k] + o.X[k] * sx + o.Y[k] * sy + o.Z[k] * sz end
  local deck = DECKS[#DECKS]
  for _, d in ipairs(DECKS) do
    if P[2] - d > 0.3 then
      deck = d
      break
    end
  end
  local ang = (math.atan2 or math.atan)(o.X[3], o.X[1]) + math.rad(S.turn + ADJ.turn)
  local pitch = math.deg(math.asin(math.max(-1, math.min(1, o.X[2])))) + S.pitch + ADJ.pitch
  local lean = -math.deg(math.asin(math.max(-1, math.min(1, o.Z[2])))) + S.lean + ADJ.lean
  return { x = P[1], z = P[3], ang = ang, h = P[2] - deck, pitch = pitch, lean = lean, deck = deck }
end

local function clamp1(v) return math.max(-1, math.min(1, v)) end

-- a flag's arguments written (its first answer logged)
local function write(e)
  local pl = e.place
  local vals = { [M.HEIGHT] = clamp1(pl.h / M.BASE_HEIGHT - 1), [M.PITCH] = clamp1((pl.pitch - M.BASE_PITCH) / M.TURN_MAX),
    [M.LEAN] = clamp1((pl.lean - M.BASE_LEAN) / M.TURN_MAX) }
  local bad
  for n, v in pairs(vals) do
    local ok, res, why = pcall(api.objarg, e.flagId, n, v)
    if not (ok and res ~= nil and res ~= false) then bad = tostring(ok and why or res) end
  end
  if not e.said then
    e.said = true
    api.log(string.format('flag: on %s (object %d): static object %s; height %.3f m, pitch %.1f, lean %.1f: %s', e.name, e.id, tostring(e.flagId),
      pl.h, pl.pitch, pl.lean, bad and ('NOT WRITTEN: ' .. bad) or 'written'))
  end
  e.at = api.now()
  return bad
end

local function makeFlag(e, o)
  local pl, why = F.placeFor(o)
  if not pl then return nil, why end
  local r = mission(string.format('return (CATCC_CR and CATCC_CR.marker) and CATCC_CR.marker(%q, %q, %.4f, %.4f, %.5f, nil, %q) or "ERR|the menu script cannot place statics: run crew-test\\\\install.ps1 with DCS closed"',
    e.key, M.TYPE, pl.x, pl.z, pl.ang, o.ship))
  if not (r[1] == 'OK' and tonumber(r[2]) and tonumber(r[2]) ~= 0) then return nil, tostring(r[2]) end
  e.flagId, e.place, e.ship, e.said, e.at = tonumber(r[2]), pl, o.ship, nil, -1e9
  e.pose = { x = o.p[1], y = o.p[2], z = o.p[3], hx = o.X[1], hz = o.X[3] }
  write(e)
  return true
end

local function takeAway(e)
  mission(string.format('return CATCC_CR and CATCC_CR.marker and CATCC_CR.marker(%q, "", 0, 0, 0, nil, %q)', e.key, e.ship or ''))
  F.list[e.id] = nil
end

local function count()
  local n = 0
  for _ in pairs(F.list) do n = n + 1 end
  return n
end

-- a flag on (or off) an aircraft: what = 'jet' (the player's) or 'lock' (the deck tool's selected aircraft)
function F.toggle(what)
  local got, why
  if what == 'lock' then
    local D = api.deck
    local e = D and D.list and D.shown and D.lock and D.list[D.lock]
    if not e then return nil, 'flag: no aircraft selected: "Deck spots" > "Park Hornets", then click one.' end
    local x, z = D.pose(e)
    got, why = ask({}, { ship = D.ship, x = x, z = z, r = 4 })
  else
    local ok, id = pcall(api.jetId)
    if not (ok and type(id) == 'number') then return nil, 'flag: you are not in an aircraft.' end
    got, why = ask({ id })
  end
  if not got then return nil, 'flag: the mission could not be asked: ' .. tostring(why) end
  local o = got.last
  if not o then return nil, what == 'lock' and 'flag: no aircraft stands where the selected one is.' or 'flag: your jet is not near a ship.' end
  if F.list[o.id] then
    takeAway(F.list[o.id])
    api.log(string.format('flag: taken off %s (object %d)', o.name, o.id))
    return string.format('flag: taken off %s. %d flag(s).', o.name, count())
  end
  if o.air then return nil, 'flag: ' .. o.name .. ' is in the air.' end
  F.n = F.n + 1
  local e = { id = o.id, name = o.name, key = string.format('catcc-flag-%d', o.id) }
  local okm, whym = makeFlag(e, o)
  if not okm then return nil, 'flag: not made on ' .. o.name .. ': ' .. tostring(whym) end
  F.list[o.id] = e
  return string.format('flag: on %s. %d flag(s).', o.name, count())
end

function F.clear()
  local n = 0
  for _, e in pairs(F.list) do
    takeAway(e)
    n = n + 1
  end
  F.list = {}
  if n == 0 then return nil, 'flag: none to take away.' end
  api.log('flag: all taken away')
  return string.format('flag: %d taken away.', n)
end

-- the place changed (key: fwd, up, side metres; turn, pitch, lean degrees): every flag put there
function F.move(key, d)
  ADJ[key] = ADJ[key] + d
  local ids = {}
  for id in pairs(F.list) do ids[#ids + 1] = id end
  if #ids > 0 then
    if key == 'fwd' or key == 'side' or key == 'turn' then
      -- (a static cannot be moved: made anew)
      local got = ask(ids)
      for id, e in pairs(F.list) do
        local o = got and got[id]
        if o and not o.gone then makeFlag(e, o) end
      end
    else
      local got = ask(ids)
      for id, e in pairs(F.list) do
        local o = got and got[id]
        if o and not o.gone then
          e.place = F.placeFor(o) or e.place
          write(e)
        end
      end
    end
  end
  api.log('flag: moved: ' .. F.where())
  return 'flag: ' .. F.where() .. '.'
end

-- the place as it now is: the spot and the moves
function F.where()
  local S = SPOTS['FA-18C_hornet']
  return string.format('%.3f fwd, %.3f up, %.3f stbd; turn %.1f, pitch %.1f, lean %.1f deg (moved %+.3f fwd, %+.3f up, %+.3f stbd, turn %+.1f, pitch %+.1f, lean %+.1f)',
    S.x + ADJ.fwd, S.y + ADJ.up, S.z + ADJ.side, S.turn + ADJ.turn, S.pitch + ADJ.pitch, S.lean + ADJ.lean, ADJ.fwd, ADJ.up, ADJ.side, ADJ.turn, ADJ.pitch, ADJ.lean)
end

function F.report()
  local parts = {}
  for _, e in pairs(F.list) do
    local pl = e.place
    parts[#parts + 1] = string.format('%s (object %d): at %.3f fwd %.3f stbd of the ship, %.3f m over its deck, heading %.1f, pitch %.1f, lean %.1f', e.name, e.id,
      pl.x, pl.z, pl.h, math.deg(pl.ang) % 360, pl.pitch, pl.lean)
  end
  api.log('flag: report: the F/A-18C\'s glareshield point ' .. F.where() .. (#parts > 0 and ('; ' .. table.concat(parts, '; ')) or ''))
  return 'flag: ' .. F.where() .. '. (In the log.)'
end

function F.status()
  local names = {}
  for _, e in pairs(F.list) do names[#names + 1] = e.name end
  table.sort(names)
  return (#names > 0 and ('Flags: ' .. table.concat(names, ', ')) or 'No flags.') .. '\n' .. F.where()
end

-- every frame: the arguments kept; every FOLLOW seconds the flagged aircraft asked for (gone, in the air: taken away;
-- moved: made anew). A message for the panel's last line, or nil
function F.tick()
  local now = api.now()
  if not next(F.list) then return end
  for _, e in pairs(F.list) do
    if now - (e.at or -1e9) >= KEEP then write(e) end
  end
  if now - (F.askedAt or -1e9) < FOLLOW then return end
  F.askedAt = now
  local ids = {}
  for id in pairs(F.list) do ids[#ids + 1] = id end
  local got = ask(ids)
  if not got then return end
  local msg
  for id, e in pairs(F.list) do
    local o = got[id]
    if not o or o.gone or o.air then
      takeAway(e)
      api.log(string.format('flag: %s (object %d) %s: its flag taken away', e.name, id, (o and o.air) and 'is in the air' or 'is gone'))
      msg = 'flag: ' .. e.name .. ((o and o.air) and ' took off' or ' is gone') .. ': its flag taken away.'
    else
      local q = e.pose
      local moved = math.sqrt((o.p[1] - q.x) ^ 2 + (o.p[2] - q.y) ^ 2 + (o.p[3] - q.z) ^ 2)
      local turned = math.abs(math.deg((math.atan2 or math.atan)(o.X[3], o.X[1]) - (math.atan2 or math.atan)(q.hz, q.hx)))
      turned = math.min(turned, 360 - turned)
      if moved > MOVED or turned > TURNED then makeFlag(e, o) end
    end
  end
  return msg
end

-- a mission starts or ends: its statics are gone with it (the moves are kept)
function F.reset()
  F.list, F.askedAt = {}, nil
end

return F
