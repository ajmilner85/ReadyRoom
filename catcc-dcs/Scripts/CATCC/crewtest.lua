-- CATCC crew test menu (DCS mission scripting environment, Lua 5.1). TEST ONLY.
--
-- Installed into the mission by the crew test hook (Scripts/CATCC/crewtest_hook.lua) when
-- Saved Games\DCS\Config\CATCC-test.lua has crewTest = true. Adds F10 > "CATCC crew test" for every
-- player. A menu item only queues a command; the hook picks it up (CATCC_CR.poll), asks this script
-- where the player's jet and the carrier are right now (CATCC_CR.ctx) and does the work through the
-- native module (deck-test/crew-test/native/catcc_crew.cpp), then shows the result on screen.

-- This Lua state outlives a mission, so the hook installs this file again at every mission start.
CATCC_CR_GEN = (CATCC_CR_GEN or 0) + 1
local GEN = CATCC_CR_GEN
local function live() return GEN == CATCC_CR_GEN end
CATCC_CR = { menus = {}, queue = {}, lastUnit = nil }
local CR = CATCC_CR

local SIDES = { coalition.side.BLUE, coalition.side.RED, coalition.side.NEUTRAL }

-- the carrier the jet sits on: the nearest ship within 250 m horizontally
local function carrierUnder(p)
  local best, bestD = nil, 250
  for _, side in ipairs(SIDES) do
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

-- the next queued command ("list", "target", "walk", "sig|sign_taxifwd_l", ...), or ""
function CR.poll()
  return table.remove(CR.queue, 1) or ''
end

local function dot(a, b) return a.x * b.x + a.y * b.y + a.z * b.z end
local function clean(s) return (tostring(s):gsub('[|\r\n]', '/')) end

-- Where things are this instant, for the hook:
--   "OK|<jet unit>|<ship unit>|s1..s12|jx|jy|jz|fx|fz"
--   s1..s12: the ship's world axes x (forward), y (up), z (starboard) and its position;
--   jx, jy, jz: the jet in ship coordinates (metres forward, up, to starboard of the ship's origin);
--   fx, fz: the jet's nose direction in ship coordinates.
-- or "ERR|<why>"
function CR.ctx()
  local u = CR.lastUnit and Unit.getByName(CR.lastUnit)
  if not (u and u:isExist()) then
    u = nil
    for _, side in ipairs(SIDES) do
      for _, pu in ipairs(coalition.getPlayers(side) or {}) do
        if not u and pu and pu:isExist() then u = pu end
      end
    end
  end
  if not u then return 'ERR|no player aircraft yet' end
  local jp = u:getPosition()
  local ship = carrierUnder(jp.p)
  if not ship then return 'ERR|no carrier within 250 m of ' .. clean(u:getName()) end
  local sp = ship:getPosition()
  local d = { x = jp.p.x - sp.p.x, y = jp.p.y - sp.p.y, z = jp.p.z - sp.p.z }
  local n = {
    sp.x.x, sp.x.y, sp.x.z, sp.y.x, sp.y.y, sp.y.z, sp.z.x, sp.z.y, sp.z.z, sp.p.x, sp.p.y, sp.p.z,
    dot(d, sp.x), dot(d, sp.y), dot(d, sp.z), dot(jp.x, sp.x), dot(jp.x, sp.z),
  }
  local out = { 'OK', clean(u:getName()), clean(ship:getName()) }
  for i = 1, #n do out[#out + 1] = string.format('%.6f', n[i]) end
  return table.concat(out, '|')
end

-- the player's jet and the carrier under it; or nil, nil, why
local function playerShip()
  local u = CR.lastUnit and Unit.getByName(CR.lastUnit)
  if not (u and u:isExist()) then
    u = nil
    for _, side in ipairs(SIDES) do
      for _, pu in ipairs(coalition.getPlayers(side) or {}) do
        if not u and pu and pu:isExist() then u = pu end
      end
    end
  end
  if not u then return nil, nil, 'no player aircraft yet' end
  local ship = carrierUnder(u:getPosition().p)
  if not ship then return nil, nil, 'no carrier within 250 m of ' .. clean(u:getName()) end
  return u, ship
end

-- A static LINKED to the ship at fwd / stbd metres of its origin, turned ang from its bow: exactly as the chock
-- test and the route lines make theirs (chocktest.lua, routelines.lua), which DCS made. It stands on the flight
-- deck there and rides with the ship.
local TWO_PI_CR = 2 * math.pi
local function linkedStatic(ship, name, typ, fwd, stbd, ang, category)
  local c = ship:getPoint()
  local sx = ship:getPosition().x
  local hc = ((math.atan2 or math.atan)(sx.z, sx.x)) % TWO_PI_CR
  return coalition.addStaticObject(ship:getCountry(), {
    type = typ, category = category or 'ADEquipment', name = name,
    x = c.x + fwd * math.cos(hc) - stbd * math.sin(hc), y = c.z + fwd * math.sin(hc) + stbd * math.cos(hc), heading = (hc + ang) % TWO_PI_CR,
    linkUnit = ship:getID(), linkOffset = true,
    offsets = { x = fwd, y = stbd, angle = ang % TWO_PI_CR },
    canCargo = false, dead = false,
  })
end

-- Static objects of ours (the tow tractor, the tow bar), made once a mission.
--   spec: "name=type;name=type;..."
--   fwd, stbd: given, they are made LINKED to the ship at that place of its deck (as the chock test's and the
--     axle finder's): a linked static is the ship's child, drawn with the ship, and the hook's native module then
--     puts it anywhere ON THE SHIP (any height) in the ship's own frame: no shimmer. If DCS makes nothing linked,
--     or without a place: not linked: it lies on the sea bed under the ship until the native module puts it
--     somewhere in the WORLD every frame (single-precision numbers: it shimmers against a ship under way).
-- Returns "OK|<object id>|<object id>|...|<note>" (an id 0: that one could not be made: a type of our own
-- mod's that is missing, say) or "ERR|<why>". The object id is the scripting object's id_ (the world's own
-- id of the object).
function CR.statics(spec, fwd, stbd)
  local u, ship, err = playerShip()
  if not ship then return 'ERR|' .. err end
  local sp = ship:getPosition().p
  local out, notes = { 'OK' }, {}
  for name, typ in tostring(spec):gmatch('([^=;]+)=([^;]+)') do
    local so = StaticObject and StaticObject.getByName(name) or nil
    if not (so and so:isExist()) then
      so = nil
      if tonumber(fwd) and tonumber(stbd) then
        local ok, res = pcall(linkedStatic, ship, name, typ, tonumber(fwd), tonumber(stbd), 0)
        so = (ok and res) or nil
        if not so then notes[#notes + 1] = typ .. ': not made linked (' .. (ok and 'DCS made nothing' or clean(res)) .. '): made unlinked' end
      end
      if not so then
        local ok, res = pcall(coalition.addStaticObject, u:getCountry(), { name = name, type = typ, category = 'ADEquipment', x = sp.x, y = sp.z, heading = 0, dead = false })
        so = (ok and res) or nil
        if not ok then
          notes[#notes + 1] = typ .. ': ' .. clean(res)
        elseif not so then
          notes[#notes + 1] = typ .. ': DCS made nothing (an unknown type: see dcs.log)'
        end
      end
    end
    out[#out + 1] = (so and tonumber(so.id_)) and string.format('%d', so.id_) or '0'
  end
  out[#out + 1] = table.concat(notes, '; ')
  return table.concat(out, '|')
end

-- The axle finder's marker: the one standing under `key` is taken away and (typ given) one of type typ is made
-- at fwd / stbd of the ship's origin, turned ang from its bow (a static cannot be moved: it is made anew, under
-- a new name each time).
-- Returns "OK|<object id>|<its name>" ("OK|0|put away" with no type) or "ERR|<why>"
CR.markers, CR.markerSeq = {}, 0
function CR.marker(key, typ, fwd, stbd, ang, category)
  local u, ship, err = playerShip()
  if not ship then return 'ERR|' .. err end
  local old = CR.markers[key]
  if old then
    local o = StaticObject.getByName(old)
    if o and o:isExist() then pcall(o.destroy, o) end
    CR.markers[key] = nil
  end
  if not typ or typ == '' then return 'OK|0|put away' end
  CR.markerSeq = CR.markerSeq + 1
  local name = string.format('%s %d', tostring(key), CR.markerSeq)
  local ok, res = pcall(linkedStatic, ship, name, typ, tonumber(fwd) or 0, tonumber(stbd) or 0, tonumber(ang) or 0, category)
  if not ok then return 'ERR|' .. clean(res) end
  if not res then return 'ERR|DCS made nothing for the type ' .. clean(typ) .. ' (dcs.log says why)' end
  CR.markers[key] = name
  return string.format('OK|%d|%s', tonumber(res.id_) or 0, name)
end

-- The deck spotting tool's aircraft: static aircraft of type typ linked to the ship (CR.marker, category "Planes").
--   spec: "key,fwd,stbd,ang;key,fwd,stbd,ang;..." (ang: radians clockwise from the bow); an entry of a key alone
--     takes that one away. Whatever stood under a key is taken away first.
--   clear: no aircraft is parked within this many metres of a LIVE aircraft on the ship (the player's own, any
--     other unit's): static aircraft collide.
-- Returns "OK|<id>|<id>|...|<note>": for every entry its object id, 0 (taken away, or DCS made nothing: the note
-- says), -1 (left empty: a live aircraft stands there); or "ERR|<why>".
function CR.deck(spec, typ, clear)
  local u, ship, err = playerShip()
  if not ship then return 'ERR|' .. err end
  clear = tonumber(clear) or 0
  local sp = ship:getPosition()
  local live = {}
  local function note(unit)
    if not (unit and unit:isExist()) then return end
    local p = unit:getPosition().p
    local d = { x = p.x - sp.p.x, y = p.y - sp.p.y, z = p.z - sp.p.z }
    live[#live + 1] = { dot(d, sp.x), dot(d, sp.z) }
  end
  for _, side in ipairs(SIDES) do
    for _, cat in pairs({ Group.Category.AIRPLANE, Group.Category.HELICOPTER }) do
      for _, g in ipairs(coalition.getGroups(side, cat) or {}) do
        for _, un in ipairs(g:getUnits() or {}) do pcall(note, un) end
      end
    end
    for _, pu in ipairs(coalition.getPlayers(side) or {}) do pcall(note, pu) end
  end
  local out, notes = { 'OK' }, {}
  for key, rest in tostring(spec):gmatch('([^,;]+)([^;]*)') do
    local fwd, stbd, ang = rest:match('^,([^,]+),([^,]+),([^,]+)')
    fwd, stbd, ang = tonumber(fwd), tonumber(stbd), tonumber(ang)
    local id = '0'
    if fwd and stbd and ang then
      local blocked = false
      for _, l in ipairs(live) do
        if math.sqrt((l[1] - fwd) ^ 2 + (l[2] - stbd) ^ 2) < clear then blocked = true end
      end
      if blocked then
        CR.marker(key, '', 0, 0, 0)
        id = '-1'
      else
        local r = CR.marker(key, typ, fwd, stbd, ang, 'Planes')
        local got = r:match('^OK|(%d+)|')
        if got and got ~= '0' then id = got elseif #notes < 3 then notes[#notes + 1] = clean(r:gsub('^ERR|', '')) end
      end
    else
      CR.marker(key, '', 0, 0, 0)
    end
    out[#out + 1] = id
  end
  out[#out + 1] = table.concat(notes, '; ')
  return table.concat(out, '|')
end

-- What DCS makes of our static types, each way round: every one made for an instant (linked: 60 m aft of the
-- ship's origin, as the chock test's probe; not linked: on the sea bed under the ship) and taken away again.
-- For the log: which of "linked or not" and "Blender-made model or one from our own writer" DCS refuses.
-- Returns "OK|<type> <linked / not linked>: <made / NOT made>; ..." or "ERR|<why>"
function CR.probe()
  local u, ship, err = playerShip()
  if not ship then return 'ERR|' .. err end
  local sp = ship:getPosition().p
  local out, n = {}, 0
  local function try(typ, link)
    n = n + 1
    local name = 'CATCC probe ' .. n
    local ok, res
    if link then
      ok, res = pcall(linkedStatic, ship, name, typ, -60, 0, 0)
    else
      ok, res = pcall(coalition.addStaticObject, ship:getCountry(), { name = name, type = typ, category = 'ADEquipment', x = sp.x, y = sp.z, heading = 0, dead = false })
    end
    out[#out + 1] = string.format('%s %s: %s', typ, link and 'linked' or 'not linked', (not ok) and ('error ' .. clean(res)) or (res and 'made' or 'NOT made'))
    if ok and res then pcall(res.destroy, res) end
  end
  try('CATCC_AxleMarker_H27', false)
  try('CATCC_AxleProbe', true)
  try('CATCC_AxleProbe', false)
  try('CATCC_Towbar', true)
  try('CATCC_Towbar', false)
  try('AS32-31A', false)
  return 'OK|' .. table.concat(out, '; ')
end

-- three steps each way, for the axle finder: 10 cm, 1 cm, 1 mm
local function steps(cmd, more, less)
  return {
    { more .. ' 10 cm', cmd .. '|0.1' }, { less .. ' 10 cm', cmd .. '|-0.1' },
    { more .. ' 1 cm', cmd .. '|0.01' }, { less .. ' 1 cm', cmd .. '|-0.01' },
    { more .. ' 1 mm', cmd .. '|0.001' }, { less .. ' 1 mm', cmd .. '|-0.001' },
  }
end

-- label, command (the hook's commands table). "sig|<signal>" gives one of the directors' signals as
-- DCS's own directors play them (the hook's SIGNALS: blend spaces whose torso angle follows the pilot;
-- held until he is given something else, except attention and pass control); "raw|<animation>|2" plays
-- a plain animation held (the engine's loop flag), "raw|<animation>" once. "Target" is the person on
-- the player's ship the commands go to: it starts as the nearest person and "Target: change" steps
-- through nearest person > nearest yellow shirt > nearest person of ours (catcc-..., green shirt) >
-- nearest catapult crew member > the plane captain (catcc-m0, the brown shirt), skipping kinds nobody on
-- the ship matches. Left and right are the PILOT'S (DCS names its turn signals for the director's own
-- side). An F10 menu holds 10 items.
local function catItems(n)
  return {
    { 'Close it (crew clears and stays off)', 'catorder|close|' .. n },
    { 'Open it (crew returns)', 'catorder|open|' .. n },
    { 'Free it once', 'catorder|free|' .. n },
    { 'Operation allowed: off', 'catorder|allowoff|' .. n },
    { 'Operation allowed: on', 'catorder|allowon|' .. n },
    { 'Send its crew away by our own walk orders', 'crewaway|' .. n },
    { 'Send its crew back to where they stood', 'crewback|' .. n },
    -- the crew told to let go of its aircraft and the catapult closed; the jet itself moved 20 m straight back off
    -- the shuttle (the aircraft's own position setter): experimental
    { 'Abort the hook-up (crew off, catapult closed, jet 20 m back)', 'catorder|abort|' .. n },
  }
end

local ITEMS = {
  { 'List people on my ship', 'list' },
  { 'Target: change (nearest > yellow > green shirt > cat crew > our model)', 'target' },
  { 'Target: signal', {
    { 'Attention (once)', 'sig|attention' },
    { 'Come ahead', 'sig|ahead' },
    { 'Turn left', 'sig|left' },
    { 'Turn right', 'sig|right' },
    { 'Stop', 'sig|stop' },
    { 'Pass control to his left (once)', 'sig|pass|90' },
    { 'Pass control to his right (once)', 'sig|pass|-90' },
    { 'Emergency stop', 'raw|sign_emergstoploop|2' },
    -- an animation clip our own mod adds (Saved Games\Mods\tech\CATCC-Crew): playable if the mod route works
    { 'Our own clip (catcc_test_clip, once)', 'raw|catcc_test_clip' },
    { 'Back to idle', 'raw|idle' },
  } },
  { 'Target: walk', {
    { 'To 16 m ahead of my nose, facing me', 'walk' },
    { 'To the far side of my jet (through it, or round it?)', 'walkthru' },
    { 'Stop walking', 'stop' },
    -- whether a walker goes round things: the crew environment's two switches and the character code's own two
    { 'Collision avoidance', {
      { 'Report the switches', 'avoid|report' },
      { 'Path finding: ON', 'avoid|path' },
      { 'Avoidance velocity: ON', 'avoid|vel' },
      { 'All off (as DCS had them)', 'avoid|none' },
      { 'Walk the target to the far side of my jet', 'walkthru' },
    } },
  } },
  { 'Target: night mode on / off (light wands, night signals)', 'night' },
  { 'Our crew', {
    { 'Signal test: every signal, day and night (75 s)', 'sigtest' },
    { 'Demo: marshal me 12 m ahead', 'demo' },
    -- along the taxi route PriFly's network gives from the spawn spot the jet stands on (crewtest_routes.lua)
    { 'Marshal me to catapult 1', 'marshal|1' },
    { 'Marshal me to catapult 2', 'marshal|2' },
    { 'Marshal me to catapult 3', 'marshal|3' },
    { 'Marshal me to catapult 4', 'marshal|4' },
    -- after a landing (or from anywhere a parking route passes): to the first parking spot of a deck area
    { 'Marshal me to a parking spot', {
      { 'Patio', 'park|Patio' },
      { 'El 3', 'park|El 3' },
      { 'El 2', 'park|El 2' },
      { 'Corral', 'park|Corral' },
      { 'El 1', 'park|El 1' },
      { 'Point', 'park|Point' },
      { 'Six-pack', 'park|Sixpack' },
      { 'Bow, starboard', 'park|Bow stbd' },
      { 'Bow, port', 'park|Bow port' },
      { 'Crotch', 'park|Crotch' },
    } },
    -- the cockpit view turns to whoever is signalling while the jet is marshalled (on by itself)
    { 'Camera follows the director: on / off', 'camfollow' },
    -- onto the deck spot nearest to the jet, facing as a jet spawned there (DCS's own teleport; experimental)
    { 'Put me square on the nearest spot (teleport)', 'teleport' },
  } },
  -- one of ours as the jet's plane captain, from walking out to handing the jet to the flight directors
  { 'Plane captain', {
    { 'Come to my jet', 'captain|come' },
    -- the catapult this jet launches from (PriFly's launch plan will say): with one set, the directors walk
    -- out when the engine start signals begin and take the jet on release; without, the release is a salute
    { 'My catapult: 1', 'captain|cat|1' },
    { 'My catapult: 2', 'captain|cat|2' },
    { 'My catapult: 3', 'captain|cat|3' },
    { 'My catapult: 4', 'captain|cat|4' },
    { 'Engine start signals', 'captain|start' },
    { 'Release me', 'captain|release' },
    { 'Send him home', 'captain|home' },
  } },
  -- DCS's own catapult crews: the orders their behaviour tree waits on, given through Flight.dll's exported
  -- functions (catItems above), and the crew walked elsewhere by our own walk orders
  { 'Catapult crews', {
    { 'Report: crews, held orders, switches', 'cats' },
    { 'Catapult 1', catItems(1) },
    { 'Catapult 2', catItems(2) },
    { 'Catapult 3', catItems(3) },
    { 'Catapult 4', catItems(4) },
    -- the catapult control bubbles: DCS's own command. With catapults 1 and 2 both closed, or a route of ours
    -- crossing it, the hook lowers the bow bubble by itself; these are for trying each by hand. Down is kept
    -- down until up (DCS itself keeps raising the waist's while launching and lowers it for a landing).
    { 'Bubbles', {
      { 'Report both', 'bubble|report' },
      { 'Bow bubble: down', 'bubble|bow|down' },
      { 'Bow bubble: up', 'bubble|bow|up' },
      { 'Waist bubble: down', 'bubble|waist|down' },
      { 'Waist bubble: up', 'bubble|waist|up' },
    } },
    -- the four elevators: DCS's own command, each by hand. Down is kept down until up (DCS's own elevator
    -- control raises an elevator it has no use for) and the hangar door starts to open at once; up leaves the
    -- door open, until "Shut the hangar doors".
    { 'Elevators', {
      { 'Report all', 'elevator|report' },
      { 'Elevator 1: down', 'elevator|1|down' },
      { 'Elevator 1: up', 'elevator|1|up' },
      { 'Elevator 2: down', 'elevator|2|down' },
      { 'Elevator 2: up', 'elevator|2|up' },
      { 'Elevator 3: down', 'elevator|3|down' },
      { 'Elevator 3: up', 'elevator|3|up' },
      { 'Elevator 4: down', 'elevator|4|down' },
      { 'Elevator 4: up', 'elevator|4|up' },
      { 'Shut the hangar doors', 'elevator|shut' },
    } },
  } },
  -- the tow test: a tractor with a driver and a tow bar pulls the jet from the lowered elevator into the hangar
  -- (the hook's Tow part). The seat items move the driver on the tractor 10 cm at a time (the offsets are logged).
  -- The axle finder: a bright marker axle stood where the hook takes the jet's nose wheel axle to be, moved from
  -- here until it is dead centre on the real one (fore / aft by 10 cm, 1 cm, 1 mm; its height by 10 cm, 1 cm:
  -- there is a model for every centimetre). The tow uses what the finder ends with; every move is logged.
  { 'Tow', {
    { 'Tow me into the hangar (tractor, bar, driver)', 'tow|hangar' },
    { 'Hold / go on', 'tow|pause' },
    { 'Unhook (the bar goes back on the tractor)', 'tow|unhook' },
    { 'Messages on screen: hide / show (for filming)', 'messages' },
    { 'Report', 'tow|report' },
    { 'Driver seat', {
      { 'Forward 10 cm', 'tow|seat|fwd|0.1' },
      { 'Back 10 cm', 'tow|seat|fwd|-0.1' },
      { 'Left 10 cm', 'tow|seat|left|0.1' },
      { 'Right 10 cm', 'tow|seat|left|-0.1' },
      { 'Up 10 cm', 'tow|seat|up|0.1' },
      { 'Down 10 cm', 'tow|seat|up|-0.1' },
    } },
    { 'Axle finder', {
      { 'Show / hide the marker axle', 'axle|show' },
      { 'Report where it is', 'axle|report' },
      { 'Fore / aft', steps('axle|fwd', 'Forward', 'Aft') },
      { 'Up / down', {
        { 'Up 10 cm', 'axle|up|0.1' }, { 'Down 10 cm', 'axle|up|-0.1' },
        { 'Up 1 cm', 'axle|up|0.01' }, { 'Down 1 cm', 'axle|up|-0.01' },
      } },
    } },
  } },
  { 'Stop the demo / signal test / marshalling', 'demostop' },
}

-- The deck spotting tool, a menu of its own (F10 > CATCC deck spots): the crew test's own top level is full.
-- A static F/A-18C on every deck spot; lock on the one the camera looks at; move it along its own nose and wings and
-- turn it, in large and small steps; every change is saved (the hook's commands.spot).
local function spotSteps(cmd, more, less, sizes)
  local out = {}
  for _, sz in ipairs(sizes) do
    out[#out + 1] = { more .. ' ' .. sz[1], cmd .. '|' .. sz[2] }
    out[#out + 1] = { less .. ' ' .. sz[1], cmd .. '|-' .. sz[2] }
  end
  return out
end
local METRES = { { '1 m', '1' }, { '10 cm', '0.1' }, { '1 cm', '0.01' } }
local DECK_ITEMS = {
  { 'Park a Hornet on every deck spot', 'spot|spawn' },
  { 'Take them all away', 'spot|clear' },
  { 'Lock on the one the camera looks at', 'spot|lock' },
  { 'Lock on the next / the one before', { { 'The next', 'spot|next|1' }, { 'The one before', 'spot|next|-1' } } },
  { 'Move it forward / aft (along its nose)', spotSteps('spot|move|fwd', 'Forward', 'Aft', METRES) },
  { 'Move it right / left (along its wings)', spotSteps('spot|move|right', 'Right', 'Left', METRES) },
  { 'Turn it', spotSteps('spot|turn', 'Right', 'Left', { { '5 degrees', '5' }, { '1 degree', '1' }, { '0.1 degree', '0.1' } }) },
  { 'Add / remove', {
    { 'Add an aircraft where the camera looks', 'spot|add' },
    { 'Remove the locked aircraft (no spot there)', 'spot|remove' },
    { 'Put the locked one back on its built-in spot', 'spot|undo' },
    { 'Start over from the built-in spots', 'spot|reset' },
  } },
  { 'Wings: folded / spread (all)', 'spot|fold' },
  { 'Report the locked one; save all', 'spot|report' },
}

local function addItems(gid, un, parent, items)
  for _, it in ipairs(items) do
    if type(it[2]) == 'table' then
      addItems(gid, un, missionCommands.addSubMenuForGroup(gid, it[1], parent), it[2])
    else
      missionCommands.addCommandForGroup(gid, it[1], parent, function()
        if not live() then return end
        CR.lastUnit = un
        if #CR.queue < 20 then CR.queue[#CR.queue + 1] = it[2] end
      end)
    end
  end
end

local function addMenu(unit)
  local g = unit:getGroup()
  if not g then return end
  local gid = g:getID()
  if CR.menus[gid] then return end
  CR.menus[gid] = true
  addItems(gid, unit:getName(), missionCommands.addSubMenuForGroup(gid, 'CATCC crew test'), ITEMS)
  addItems(gid, unit:getName(), missionCommands.addSubMenuForGroup(gid, 'CATCC deck spots'), DECK_ITEMS)
end

local function scan()
  for _, side in ipairs(SIDES) do
    for _, u in ipairs(coalition.getPlayers(side) or {}) do
      if u and u:isExist() then pcall(addMenu, u) end
    end
  end
end

scan()
timer.scheduleFunction(function(_, t) if not live() then return nil end pcall(scan) return t + 5 end, nil, timer.getTime() + 5)
