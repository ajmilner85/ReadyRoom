-- THE SLOT PICKER (the user, 2026-11-20: "I think I prefer to use the wait until spotted method in conjunction with a
-- new graphical slot selection interface. It doesn't make sense to load into a jet that's on the move ... The interface
-- would show a depiction of the carrier flight deck (same graphic as our CATCC-PriFly page) with a live map of all
-- aircraft. Fully spotted aircraft can then be selected for spawn ... only the aircraft assigned to the player can be
-- selected ... if a player spawns into a spotted jet and then has a technical issue that requires them to re-slot, or
-- even leave the server. That slot should be held for them with a static until they return or someone with authority
-- (PriFly) releases it to another player").
--
-- Loaded by the crew test hook (crewtest_hook.lua) in the hooks' own Lua state ("userhooks"), on the main thread.
-- DCS's slot screen lives in DCS's GUI Lua state: reached through net.dostring_in('gui'), which Config/autoexec.cfg
-- must allow (the crew test's installer adds that: deck-test/crew-test/autoexec.ps1).
--
-- THE MISSION'S SLOTS ON THE CARRIERS (S.loadSlots): every Client (or Player) aircraft of the mission whose first
-- waypoint is on a ship's parking spot: its slot id (its unit id, as DCS's slot list has it), side, the DCS parking
-- number (the deck spot of the spotting plan with that number: crewtest_routes.lua's `spot`), its carrier.
-- THE DECK (S.setMap): what the deck spotting demo reports once a second (crewtest_demo.lua M.deckMap): each of its
-- aircraft, its deck spot, where it is and its state.
--
-- THE SERVER (or the host): a slot whose deck spot has an aircraft of the demo that is not yet standing on it is
-- refused (onPlayerTryChangeSlot: the player is told why in the chat); so is one held for another player, and, with
-- `assignedOnly` (Config/CATCC-slots.lua), one not assigned to him. When a player takes a slot (S.track, once a
-- second: everyone's slot), the demo's static on its spot is taken away (demo2|man) and the slot is HELD for him (by
-- his UCID); when he leaves it (another slot, spectators, or the server), the static is made again (demo2|unman) and
-- the slot stays held for him until he takes it again or the host releases it (slots|release|<slot id>, the
-- picker's "Release reservation"; the player's own slot: its "Release slot").
-- THE PICKER (a window: crewtest_slots.dlg): PriFly's deck drawing (catcc_deck.png: scripts/catcc/deck-picture.tsx)
-- with every aircraft of the demo on the flight deck drawn as PriFly draws it (a folded-wing Hornet: green when its
-- slot can be taken, orange when chosen, grey when not; its board number over it), and nothing else: a slot is only
-- ever an aircraft CATCC has spotted; the CATCC app's fonts and colours (crewtest_slots.dlg); a click
-- selects, "Spawn" takes the slot (net.set_slot) and opens DCS's briefing. "Release slot" (amber, under Spawn): the
-- player's own slot, as DCS's own Release Slot; "Release reservation" (red, far left): a player's claim on a spotted
-- aircraft he is not in; both asked first. In multiplayer, ON THE HOST, it comes up in place of DCS's own slot screen (the show
-- functions of DCS's slot screen, which DCS calls at the mission's start and from its menu, are wrapped in the GUI
-- state at run time, DCS's files not changed, and held back only by a lease this hook renews: S.guiTick); "DCS slot
-- list" or Ctrl+Shift+F8 brings DCS's own screen back. On a client of
-- another server DCS's own screen is left alone: telling a client that the server has CATCC, and giving it the
-- server's deck, is not built yet (slots|show shows the picker anywhere, for a look).
-- NOT YET SEEN IN DCS.
local api = ...

local S = { green = {}, map = {}, list = {}, ship = nil, mapAt = -1e9, slots = {}, bySlot = {}, bySpot = {}, carriers = {}, carrierIx = 1,
  hold = {}, inSlot = {}, cfg = {}, spotPos = {}, trackAt = 0, refreshAt = 0, vanilla = false, sel = nil }
-- (on: the picker wanted on the screen; shown: what the window was last made, from S.tick only; queue: what its
-- buttons asked for, done by S.tick)
local P = { markers = {}, on = false, shown = false, queue = {} }
local PX, X0, Z0 = 4, -172, -47 -- the deck picture: pixels a metre; where its top left corner is (PriFly's DECK_VIEWBOX)
-- (y: from under the window's title bar: DCS places children there; above the deck, the carriers' tabs)
local TABS = { x = 6, y = 2, h = 26 }
-- the aircraft's colours (PriFly's, BossView): gray spotted; mine grey outlined in magenta: the player's to take (the user,
-- 2026-11-21: "The players assigned slot should be outlined in Magenta"); ready green: its pilot has a green jet, ready to
-- taxi ("Aircraft should not appear green until the player signals they have a 'green jet'"); sel orange: chosen
local SPAWN_PRE = 3 -- seconds between the static taken away and the slot taken (the picker's Spawn)
local JET_CLS = { 'gray', 'mine', 'ready', 'sel' }
-- THE AIRCRAFT TURNED BY DCS'S GUI (2026-11-23: a Static's picture turns about its pivot point: Static:setAngle, as
-- DCS's own binocular view turns its heading scale): one picture per colour and one shadow, turned to the aircraft's
-- heading to the degree. sign: the direction setAngle turns (1: as the demo's heading, clockwise on the screen; -1 if
-- DCS turns the other way); offset: degrees added. DCS TURNS COUNTER-CLOCKWISE (the user's runs of 2026-11-23: with
-- sign 1 and offset 180 every aircraft showed 180 minus its heading: the elevators' and the six-pack's, across the deck,
-- right; the bow's and the fantail's mirrored): sign -1, offset 0. dx, dy: the shadow's offset in pixels (the pictures'
-- drop shadow: 0.45 m down and right). (Until 2026-11-23: 72 pictures per colour, every 5 degrees, chosen by heading.)
local JET_TURN = { sign = -1, offset = 0, dx = 2, dy = 2 }
local BOARD_TPL = { gray = 'tplBoardGray', mine = 'tplBoardMine', ready = 'tplBoardReady', sel = 'tplBoardSel' }
-- (the aircraft and their board numbers are set off from the deck by a drop shadow: the user's choice of shadow or
-- outline, 2026-11-21: "I prefer the shadow look": the pictures (scripts/catcc/deck-picture.tsx) and the numbers'
-- skins (crewtest_slots.dlg: shadowColor, shadowOffset))
local DECK = { x = 6, y = 34, w = 1392, h = 384 }
local WIN = { x = 60, y = 120, w = 1404, h = 508 } -- the window (crewtest_slots.dlg's bounds), where it first stands (VIEW.window: top centre)

-- THE VIEW BEHIND THE PICKER (the user, 2026-11-23: "Is it possible to get the game to show the F9 (external ship
-- view) on mission start instead of the F10 map? Can the camera be positioned and angled such that the carrier is
-- framed in the bottom half of the view, while our interface is shown in the top half?"): while the picker is up and
-- the player is in no aircraft, the camera is put beside the carrier the picker shows, off its starboard side and
-- above, the ship broadside with its bow to the right (as the picker's deck picture has it), in the part of the screen
-- below the picker's window; put there again every frame, so it rides with the ship. S.view, below, says how.
--   on        false: none of this (the window stays where WIN has it; DCS's own view behind the picker)
--   window    the picker's window first stands at the screen's top centre, winTop pixels down
--   elev      degrees: how far above the horizon the camera stands as seen from the ship's middle
--   side      1: off the starboard side (the bow to the right); -1: off the port side (the bow to the left)
--   fill      the ship's length (aft to bow, along its centreline) as a part of the screen's width
--   fillV     the ship (its hull's box) takes at most this part of the free height below the window: the camera
--             stands further off where the screen is low and wide
--   minFree   with less than this part of the screen's height free below the window (the window dragged down), the
--             ship is centred in the whole screen
--   fov       degrees: the field of view taken when DCS gives none (DCS.getCurrentFOV); DCS's outside views start at
--             78 (Config/View/View.lua ExternalViewAngleDefault); fovAxis: 'h' it is the screen's width that angle
--             spans (as the in-game panel takes it), 'v' its height
--   setFov    a number: the field of view is set to it (DCS.setCurrentFOV) when the view is taken; nil: left alone
--   aft, bow, beam, deck   the ship's hull in its own frame, metres from its origin: its ends along the centreline
--             (PriFly's deck outline: -164.3 to 168.1), half its width, its flight deck's height
--   cmds      DCS's view commands, tried in this order until the camera stays where it is put: 13 iCommandViewNavy
--             (F9, the ship view), 16 iCommandViewFree (F11, the free camera); their numbers: the place of each
--             name in bin\Input.dll's own list (7 cockpit, 8 aircraft, 13 ship, 15 map, 16 free)
--   settle    frames after a view command before the camera is checked; tol, tolDeg: it "stays" when, read before it
--             is put again, it is within tol metres of and tolDeg degrees off where it was put the frame before
--   after     a view command sent when the view is given up while the player is still in no aircraft (15: back to
--             the map); nil: the camera is left where it is, the player's to move
local VIEW = { on = true, window = true, winTop = 24, elev = 33, side = 1, fill = 0.86, fillV = 0.85, minFree = 0.25,
  fov = 78, fovAxis = 'h', setFov = nil, aft = -164, bow = 168, beam = 40, deck = 20,
  cmds = { 16, 13 }, leave = 400, settle = 30, tol = 5, tolDeg = 2, after = nil }

local function log(text) api.log('slots: ' .. text) end
local function try(fn, ...)
  local ok, a, b, c = pcall(fn, ...)
  if ok then return a, b, c end
  return nil
end
local function mp() return try(function() return DCS.isMultiplayer() end) == true end
local function server() return try(function() return DCS.isServer() end) == true end
local function myId() return try(function() return net.get_my_player_id() end) end
local function pinfo(id, k) return try(function() return net.get_player_info(id, k) end) end

-- (the aircraft carriers' unit types of DCS: each such ship of the mission is one of the picker's tabs)
local CARRIER_TYPES = { CVN_70 = true, CVN_71 = true, CVN_72 = true, CVN_73 = true, CVN_74 = true, CVN_75 = true, Stennis = true, Forrestal = true,
  KUZNECOW = true, CV_1143_5 = true, LHA_Tarawa = true }

local STATE = { parked = 'standing on its spot', manned = 'manned', tow = 'in tow', up = 'on its way up on an elevator', deck = 'on the flight deck, not yet on its spot', hangar = 'in the hangar' }

-- ---------------------------------------------------------------- what the mission has
function S.loadCfg()
  S.cfg = {}
  local f = loadfile(api.writedir .. 'Config/CATCC-slots.lua')
  local t = f and try(f)
  if type(t) == 'table' then S.cfg = t end
end

function S.loadSpots()
  S.spotPos = {}
  local r = try(api.routes)
  for _, e in ipairs(type(r) == 'table' and r or {}) do
    if e.spot and e.x then S.spotPos[tonumber(e.spot)] = e end
  end
end

function S.loadSlots()
  S.slots, S.bySlot, S.bySpot, S.carriers, S.templates = {}, {}, {}, {}, {}
  local m = try(function() return DCS.getCurrentMission() end)
  local mis = type(m) == 'table' and (m.mission or m) or nil
  if not (mis and mis.coalition) then return end
  local names, carrierSeen, order, isCarrier, hasSlots = {}, {}, {}, {}, {}
  for _, coal in pairs(mis.coalition) do
    for _, cty in ipairs(coal.country or {}) do
      for _, g in ipairs((cty.ship or {}).group or {}) do
        for _, u in ipairs(g.units or {}) do
          names[tonumber(u.unitId) or -1] = u.name
          if u.name and not carrierSeen[u.name] then
            carrierSeen[u.name] = true
            order[#order + 1] = u.name
          end
          if CARRIER_TYPES[tostring(u.type)] then isCarrier[tostring(u.name)] = true end
        end
      end
    end
  end
  for sideName, coal in pairs(mis.coalition) do
    local side = (sideName == 'red' and 1) or (sideName == 'blue' and 2) or 0
    for _, cty in ipairs(coal.country or {}) do
      for _, cat in ipairs({ 'plane', 'helicopter' }) do
        for _, g in ipairs((cty[cat] or {}).group or {}) do
          local p1 = g.route and g.route.points and g.route.points[1]
          local link = p1 and tonumber(p1.linkUnit)
          for _, u in ipairs(g.units or {}) do
            -- ITS DECK SPOT: the number in its group's or its own name ("Spot 32", "Spot 32-1") where it has one, else
            -- its parking number. (The user's run of 2026-11-23: the mission saved again in the mission editor had
            -- parking number 1 on five of its slots (the editor rewrites numbers it does not know for the ship), so
            -- five aircraft had no slot and could not be chosen. DCS does not go by the parking number either: the
            -- picker aims the spawn.)
            local spot = tonumber(tostring(g.name):match('^Spot (%d+)')) or tonumber(tostring(u.name):match('^Spot (%d+)')) or tonumber(u.parking_id) or tonumber(u.parking)
            if g.dynSpawnTemplate and (u.skill == 'Client' or u.skill == 'Player') then
              -- (a dynamic spawn template (the mission editor's "dynamic spawn template"): a pattern for DCS's dynamic
              -- spawn, not a slot of the picker; DCS still lists it as a slot: taking it is refused (S.tryChange))
              S.templates[tostring(u.unitId)] = tostring(u.name)
            elseif (u.skill == 'Client' or u.skill == 'Player') and link and names[link] and type(p1.type) == 'string' and not p1.type:find('^TakeOffParking') then
              -- (a slot that starts on a catapult ("Takeoff from runway": the Alert jets; the user's run of
              -- 2026-11-23: his catapult slot, a copy of a deck spot's that kept its parking number, was refused as
              -- "no aircraft spotted there"): not a deck spot's: DCS's own, taken through DCS's slot list, untouched)
              S.catSlots = (S.catSlots or 0) + 1
            elseif (u.skill == 'Client' or u.skill == 'Player') and link and names[link] and spot then
              local sl = { id = tostring(u.unitId), side = side, spot = spot, name = tostring(u.name), type = tostring(u.type), group = tostring(g.name), carrier = names[link],
                board = u.onboard_num or tostring(u.livery_id or ''):match('(%d+)%s*$'), livery = u.livery_id }
              S.slots[#S.slots + 1] = sl
              S.bySlot[sl.id] = sl
              S.bySpot[names[link] .. '/' .. spot] = sl
              hasSlots[sl.carrier] = true
            end
          end
        end
      end
    end
  end
  -- the picker's tabs: every aircraft carrier of the mission, slots or not (the user, 2026-11-21: "UI for switching
  -- between carriers"; Spot Deck works on any), and any other ship with slots, in the mission's order; shown first:
  -- the first with slots
  local first
  for _, name in ipairs(order) do
    if isCarrier[name] or hasSlots[name] then
      S.carriers[#S.carriers + 1] = name
      if hasSlots[name] and not first then first = #S.carriers end
    end
  end
  S.carrierIx = first or 1
  local nt = 0
  for _ in pairs(S.templates) do nt = nt + 1 end
  log(string.format('%d slots on %d carrier(s): %s%s', #S.slots, #S.carriers, table.concat(S.carriers, ', '),
    nt > 0 and string.format('; %d dynamic spawn template(s), not slots', nt) or ''))
end

-- THE SLOTS' PAINT, for the demo (the user's run of 2026-11-20: his slot on parking spot 1, painted 744; the demo had
-- spotted its own 744 elsewhere and a 623 on spot 1: he chose 744 and it had no slot): "<spot>=<livery>;..." of the
-- slots on a carrier: the demo paints the aircraft it spots on each such spot so (crewtest_demo.lua M.paint)
function S.paint(ship)
  local out = {}
  for _, sl in ipairs(S.slots) do
    if sl.livery and (not ship or sl.carrier == ship) then out[#out + 1] = sl.spot .. '=' .. tostring(sl.livery) end
  end
  return table.concat(out, ';')
end

-- ---------------------------------------------------------------- the deck, from the demo
function S.setMap(text)
  local map, list, ship = {}, {}, nil
  for part in tostring(text):gmatch('[^;]+') do
    local sh = part:match('^ship=(.*)$')
    if sh then
      ship = sh
    else
      local f = {}
      for v in (part .. '|'):gmatch('(.-)|') do f[#f + 1] = v end
      local a = { key = f[1], board = f[2], spot = tonumber(f[3]), spotId = f[4], x = tonumber(f[5]) or 0, z = tonumber(f[6]) or 0, hdg = tonumber(f[7]) or 0, level = f[8], state = f[9] }
      list[#list + 1] = a
      if a.spot then map[a.spot] = a end
    end
  end
  local now = api.now()
  -- (each aircraft's movement between this report and the one before, drawn smoothly: S.pose)
  S.poses = S.poses or {}
  local poses = {}
  for _, a in ipairs(list) do
    local old = S.poses[a.key]
    local fx, fz, fh = a.x, a.z, a.hdg
    if old then fx, fz, fh = S.pose(old, now) end
    -- (a jump, not a move: a new aircraft up an elevator, or a report after a long gap: put there at once)
    if not old or math.abs(a.x - fx) + math.abs(a.z - fz) > 40 then fx, fz, fh = a.x, a.z, a.hdg end
    local dt = old and (now - old.t0) or 1
    poses[a.key] = { fx = fx, fz = fz, fh = fh, tx = a.x, tz = a.z, th = a.hdg, t0 = now, dt = math.min(2, math.max(0.25, dt)) }
  end
  S.poses = poses
  S.map, S.list, S.ship, S.mapAt = map, list, ship, now
end

-- SMOOTHLY (the user, 2026-11-20: "Moving aircraft seem to update in two stages, first position, then rotation. Is it
-- possible to update both at the same time and also apply smoothing between the current and previous position"): an
-- aircraft is drawn moving from where it was drawn when a report came to where that report has it, over the time
-- between the last two reports (about 1 s: one report behind), place and heading together, the heading the short way
-- round; S.tick draws the moving ones every frame.
function S.pose(p, t)
  local f = math.min(1, math.max(0, (t - p.t0) / p.dt))
  local dh = ((p.th - p.fh + 180) % 360) - 180
  return p.fx + (p.tx - p.fx) * f, p.fz + (p.tz - p.fz) * f, (p.fh + dh * f) % 360, f < 1
end

function S.demoOn(age) return api.now() - S.mapAt < (age or 5) end

-- may this player (ucid, name) take this slot: true, or false and why
function S.status(sl, ucid, pname)
  local h = S.hold[sl.id]
  if h and h.ucid ~= ucid then return false, 'reserved for ' .. tostring(h.name) end
  local want = S.cfg.assign and S.cfg.assign[sl.name]
  if S.cfg.assignedOnly and want ~= pname then return false, want and ('assigned to ' .. tostring(want)) or 'assigned to nobody' end
  -- (ONLY AN AIRCRAFT CATCC HAS SPOTTED is a slot (the user, 2026-11-21: "When an aircraft is spotted on the deck by
  -- CATCC, then and only then should it be selectable as a spawn location"): no aircraft of the demo on the slot's
  -- spot (the demo not running, or nothing put there): refused, from DCS's own slot list too)
  -- (the deck's report up to 30 s old while the picker's own Spawn is under way: taking a slot can hold the hook up for seconds while DCS loads the
  -- aircraft (5.9 s in the run of 2026-11-22: that Spawn was refused "no aircraft spotted there"))
  local a = S.demoOn((S.spawnPre or S.spawnWait) and 30 or 5) and S.ship == sl.carrier and S.map[sl.spot] or nil
  if not a then return false, 'no aircraft spotted there' end
  if a.state ~= 'parked' and not (a.state == 'manned' and h and h.ucid == ucid) then
    return false, 'not spotted yet: its aircraft is ' .. (STATE[a.state] or tostring(a.state))
  end
  return true
end

-- ---------------------------------------------------------------- the server
function S.tryChange(playerID, side, slotID)
  local tpl = S.templates and S.templates[tostring(slotID)]
  if tpl then
    -- (a slot only ever an aircraft CATCC has spotted: a dynamic spawn template is none)
    log(string.format('%s refused %s (%s): a dynamic spawn template, not a slot', tostring(pinfo(playerID, 'name')), tpl, tostring(slotID)))
    try(function() net.send_chat_to('CATCC: ' .. tpl .. ': a dynamic spawn template, not a slot', playerID) end)
    return false
  end
  local sl = S.bySlot[tostring(slotID)]
  if not sl then return nil end
  local ok, why = S.status(sl, pinfo(playerID, 'ucid'), pinfo(playerID, 'name'))
  if ok then return nil end
  log(string.format('%s refused %s (%s): %s', tostring(pinfo(playerID, 'name')), sl.name, sl.id, why))
  try(function() net.send_chat_to('CATCC: ' .. sl.name .. ': ' .. why, playerID) end)
  return false
end

function S.took(sl, id)
  local ucid, name = pinfo(id, 'ucid') or ('player ' .. tostring(id)), pinfo(id, 'name') or '?'
  S.hold[sl.id] = { ucid = ucid, name = name }
  log(string.format('%s took %s (%s, spot %d): held for him', name, sl.name, sl.id, sl.spot))
  -- (the host's own slot with DCS's FLY held: its static goes at his FLY, S.flyTick)
  if S.fly and S.fly.id == tostring(sl.id) and id == myId() then return log(sl.name .. ': its static stays until his FLY') end
  S.man(sl)
end

function S.left(slotId, id)
  local sl = S.bySlot[slotId]
  if not sl then return end
  local h = S.hold[slotId]
  log(string.format('%s left %s (%s): its static is made again; held for %s until he takes it again or it is released', tostring(pinfo(id, 'name') or (h and h.name)), sl.name, sl.id, tostring(h and h.name)))
  S.unman(sl.spot)
end

-- everyone's slot, once a second: who took and who left which (the host's own slot too: DCS calls no hook for that)
function S.track()
  local list = try(function() return net.get_player_list() end)
  if type(list) ~= 'table' then return end
  local seen = {}
  for _, id in ipairs(list) do
    seen[id] = true
    local _, slot = try(function() return net.get_slot(id) end)
    slot = slot and tostring(slot) or ''
    if slot == '' then slot = nil end
    local was = S.inSlot[id]
    if was ~= slot then
      if was then S.left(was, id) end
      S.inSlot[id] = slot
      if slot and S.bySlot[slot] then S.took(S.bySlot[slot], id) end
    end
  end
  for id, slot in pairs(S.inSlot) do
    if not seen[id] then
      S.left(slot, id)
      S.inSlot[id] = nil
    end
  end
end

function S.release(slotId)
  local h = S.hold[tostring(slotId)]
  if not h then return api.say('Slot ' .. tostring(slotId) .. ' is not held.') end
  S.hold[tostring(slotId)] = nil
  log(string.format('the hold of %s on %s is released', tostring(h.name), tostring(slotId)))
  api.say(string.format('Released: %s is free for anyone (it was reserved for %s).', S.bySlot[tostring(slotId)] and S.bySlot[tostring(slotId)].name or tostring(slotId), tostring(h.name)))
end

-- ---------------------------------------------------------------- DCS's own slot screen
function S.takeover() return mp() and server() and #S.slots > 0 and not S.vanilla end

-- THROUGH THE GUI STATE ITSELF (2026-11-20, the third try in DCS: the hook's isolated environment sees none of DCS's GUI
-- modules, whichever way it looks; but net.dostring_in('gui') runs, and DCS's in-mission GUI (GameGUI.lua) is loaded
-- there once a mission begins). There, once a multiplayer mission is on: DCS's slot screen's show functions are wrapped
-- (CATCC_SLOTWRAP: until `till` they draw nothing and count the asking in `want`); twice a second this hook renews
-- `till` (a lease: 3 s on, or none), reads `want` and whether DCS's screen is up, puts DCS's screen away and shows the
-- picker. (A lease, not a switch: the GUI state outlives the mission, and a switch left on, by a mission's end or a
-- hook that stopped, would hold back DCS's screen at the next mission's start, a server without CATCC's too.)
local GUI_WRAP = [==[
local L = package.loaded
local MSR = L['MultiplayerSelectRole']
if not MSR then return 'not loaded yet' end
local W = CATCC_SLOTWRAP
if W and W.ref == MSR then return 'wrapped already' end
W = W or { till = 0, want = 0, orig = {} }
W.ref = MSR
W.now = function() return (DCS and DCS.getRealTime and DCS.getRealTime()) or os.clock() end
CATCC_SLOTWRAP = W
local out = {}
local function wrap(mod, f, always)
  local m = L[mod]
  if type(m) ~= 'table' or type(m[f]) ~= 'function' then
    out[#out + 1] = mod .. '.' .. f .. ': ' .. (type(m) == 'table' and type(m[f]) or 'no module')
    return
  end
  local o = m[f]
  W.orig[mod .. '.' .. f] = o
  m[f] = function(...)
    local b = ...
    if W.till > W.now() and (always or b ~= false) then
      W.want = W.want + 1
      return
    end
    return o(...)
  end
  out[#out + 1] = mod .. '.' .. f .. ': wrapped'
end
wrap('MultiplayerSelectRole', 'showInSelectRoleMode', true)
wrap('MultiplayerSelectRole', 'show', true)
wrap('MultiplayerSelectCoalitionDialog', 'show', false)
wrap('MultiplayerSelectRoleDialog', 'show', false)
return table.concat(out, '; ')
]==]
-- (LEASE: put in front by S.guiTick: seconds, 0 for none)
local GUI_POLL = [==[
local W = CATCC_SLOTWRAP
if W then W.till = LEASE > 0 and W.now() + LEASE or 0 end
local m = package.loaded['MultiplayerSelectRole']
local vis = false
if m and m.isVisible then
  local ok, v = pcall(m.isVisible)
  vis = ok and v and true or false
end
return tostring(W and W.want or -1) .. '|' .. tostring(vis)
]==]
local GUI_HIDE = [==[
local m = package.loaded['MultiplayerSelectRole']
if m and m.hide then pcall(m.hide) end
return 'ok'
]==]
-- (the picker's Close: what DCS's own close of its slot screen does (its btnClose: onEsc(): a spectator goes on
-- spectating, a player in a slot back to his aircraft); not where DCS's close is not allowed either)
local GUI_CLOSE = [==[
local m = package.loaded['MultiplayerSelectRole']
if not (m and m.onEsc) then return 'no slot screen' end
if m.checkSpectatorExternalViews and m.checkSpectatorExternalViews() ~= true then return 'not allowed' end
local ok, e = pcall(m.onEsc)
return ok and 'closed' or ('onEsc: ' .. tostring(e))
]==]
-- (after the picker's Spawn, the slot taken: what DCS's own BRIEFING button does (MultiplayerSelectRoleDialog's
-- onChange_btnBriefing): its select-role mode left, the cockpit preloaded, the briefing shown; its FLY puts the player
-- in the jet (net.spawn_player))
local GUI_BRIEFING = [==[
local m = package.loaded['MultiplayerSelectRole']
local b = package.loaded['BriefingDialog']
if m and m.onEsc then pcall(m.onEsc, true) end
local t = DCS and DCS.getPlayerUnitType and DCS.getPlayerUnitType()
if t and DCS.preloadCockpit then pcall(DCS.preloadCockpit, t) end
if not (b and b.show) then return 'no briefing' end
local ok, e = pcall(b.show, 'Menu')
return ok and ('briefing shown (' .. tostring(t) .. ')') or ('briefing: ' .. tostring(e))
]==]
local GUI_VANILLA = [==[
local W = CATCC_SLOTWRAP
if not W then return 'no wrap' end
W.till = 0
local o = W.orig['MultiplayerSelectRole.showInSelectRoleMode'] or W.orig['MultiplayerSelectRole.show']
if o then
  local ok, e = pcall(o)
  return ok and 'shown' or tostring(e)
end
return 'no show'
]==]

-- (net.dostring_in into the GUI state: what it gave, or nil and why: its error, or its second value. The fourth try
-- in DCS, 2026-11-20: it gave nothing and raised nothing: Config/autoexec.cfg's net.allow_dostring_in lists "server"
-- only, and the hooks of Saved Games run in a state of their own ("userhooks": API/Sim_ControlAPI.md))
local function gui(code)
  local ok, r, r2 = pcall(function() return net.dostring_in('gui', code) end)
  if ok and r ~= nil then return r end
  if ok then return nil, 'it gave nothing' .. (r2 ~= nil and (' (' .. tostring(r2) .. ')') or '') end
  return nil, r
end

function S.guiTick(t)
  if not S.guiDone and t >= (S.guiTry or 0) then
    S.guiTry = t + 2
    local r, err = gui(GUI_WRAP)
    local text = tostring(r or ('net.dostring_in failed: ' .. tostring(err)))
    if text ~= S.guiSaid then
      S.guiSaid = text
      log('DCS\'s slot screen, in the GUI state: ' .. text)
    end
    if text:find('wrapped', 1, true) then
      S.guiDone = true
      -- (the picker up over DCS's screen already, from before the wrap: that screen put away under it)
      if P.on then gui(GUI_HIDE) end
    end
  end
  -- (DCS's FLY held until the static is gone: S.flyTick)
  if S.guiDone and mp() and server() then S.flyWrapTry(t) end
  if not S.guiDone or t < (S.pollAt or 0) then return end
  S.pollAt = t + 0.5
  local take = S.takeover()
  local r = gui('local LEASE = ' .. (take and 3 or 0) .. '\n' .. GUI_POLL)
  local want, vis = tostring(r or ''):match('^(-?%d+)|(%a+)$')
  want = tonumber(want)
  if not want then return end
  local asked = S.guiWant and want > S.guiWant
  S.guiWant = want
  -- ("DCS slot list" and Ctrl+Shift+F8 are for that once (the user, 2026-11-20: "I would like the ESC menu 'Choose
  -- Slot' option to bring them back to the new UI"): DCS's own screen closed again, by a slot taken or by spectating,
  -- and the picker takes its place again, the next time DCS asks for it: its Esc menu's "Choose Slot")
  local wasVis = S.guiVis
  S.guiVis = vis == 'true'
  if S.vanilla and wasVis and not S.guiVis then
    S.vanilla = false
    log('DCS\'s own slot screen closed: the picker takes its place again')
  end
  -- (not while the picker's Spawn hands over to DCS's briefing: S.tick)
  if S.spawnPre or S.spawnWait or t < (S.quietUntil or 0) then return end
  if take and not P.on and (asked or vis == 'true') and not (S.mySlot() and not asked) then
    log(string.format('DCS asked for its slot screen (%s): the picker instead', asked and 'asked again' or 'it is up'))
    S.showPicker()
  end
end

-- (2026-11-20, the first try in DCS: wrapping showInSelectRoleMode alone did nothing: it is not in DCS's Lua files,
-- and the user saw DCS's "join coalition" and slot dialogs. Now what DRAWS those screens is wrapped as well: the
-- select-role screen's show() and the coalition and role dialogs' show(true); each wrap is logged, with what was
-- found, and the first time DCS's screen comes up on this server.)
S.orig = {}
-- A MODULE OF DCS'S OWN GUI (2026-11-20, the second try: every one of them nil to `require`: DCS loads each hook "into an
-- isolated environment" of the GUI Lua state, with a require of its own): found where the state keeps what it has
-- loaded: the hook's own package.loaded, the state's global table (getfenv(0)), the registry's _LOADED.
local function findModule(name)
  local where = {
    { 'require', function() return require(name) end },
    { 'package.loaded', function() return package.loaded[name] end },
    { 'the global table', function() return getfenv(0).package.loaded[name] end },
    { 'the global table', function() return getfenv(0)[name] end },
    { 'the registry', function() return debug.getregistry()._LOADED[name] end },
  }
  for _, w in ipairs(where) do
    local m = try(w[2])
    if type(m) == 'table' then return m, w[1] end
  end
  return nil, 'not found'
end

local function wrapShow(modName, field, onTrue)
  local mod, found = findModule(modName)
  if type(mod) == 'table' and not S.foundIn then S.foundIn = found end
  local kind = type(mod) == 'table' and type(mod[field]) or type(mod)
  if type(mod) ~= 'table' or type(mod[field]) ~= 'function' then
    return modName .. '.' .. field .. ': ' .. kind
  end
  local key = modName .. '.' .. field
  if S.orig[key] then return key .. ': wrapped already' end
  local orig = mod[field]
  S.orig[key] = { mod = mod, fn = orig }
  mod[field] = function(...)
    if S.takeover() and onTrue(...) then
      if not S.saidTake then
        S.saidTake = true
        log('DCS asked for its slot screen (' .. key .. '): the picker instead')
      end
      return S.showPicker()
    end
    return orig(...)
  end
  return key .. ': wrapped'
end

function S.wrap()
  S.MSR = findModule('MultiplayerSelectRole')
  local said = {
    wrapShow('MultiplayerSelectRole', 'showInSelectRoleMode', function() return true end),
    wrapShow('MultiplayerSelectRole', 'show', function() return true end),
    wrapShow('MultiplayerSelectCoalitionDialog', 'show', function(b) return b ~= false end),
    wrapShow('MultiplayerSelectRoleDialog', 'show', function(b) return b ~= false end),
  }
  local text = table.concat(said, '; ')
  if text ~= S.wrapSaid then
    S.wrapSaid = text
    log('DCS\'s slot screen: ' .. text .. ' (found through ' .. tostring(S.foundIn) .. ')')
    -- (and whether the GUI state itself can be reached the other way: net.dostring_in('gui'), which the user's
    -- Config/autoexec.cfg must allow)
    local okg, r = pcall(function() return net.dostring_in('gui', 'return type(package.loaded["MultiplayerSelectRole"])') end)
    log('net.dostring_in("gui"): ' .. (okg and ('the module there is a ' .. tostring(r)) or ('not allowed: ' .. tostring(r))))
  end
end

-- DCS's own screen, as if nothing were wrapped (the picker's "DCS slot list")
function S.vanillaScreen()
  S.vanilla = true
  S.hidePicker()
  if S.guiDone then
    log('DCS slot list: ' .. tostring(gui(GUI_VANILLA)))
    return
  end
  local o = S.orig['MultiplayerSelectRole.showInSelectRoleMode'] or S.orig['MultiplayerSelectRole.show']
  if o then
    try(o.fn)
  elseif S.MSR and S.MSR.show then
    try(S.MSR.show)
  end
end

-- ---------------------------------------------------------------- the picker
-- SHOWN AND PUT AWAY THE PANEL'S WAY (crewtest_ui.lua, at its top: what DCS did with each way it was tried). The
-- window is made visible once, for good, when it is built: put away = a see-through skin, 10 x 10 where it stood,
-- nothing in it visible, no cursor; shown = its own skin and size again. Nothing is done to the window inside a
-- button's own call: a button only notes what it asks for (P.queue), and S.tick does it, builds the window, shows it
-- and puts it away. (The first version made the window invisible when it was built and visible to show it: the
-- user's run, 2026-11-20: the log said "the picker is shown" and nothing came up on the screen: a window of DCS's
-- toolkit made invisible is not seen again, as the panel found.)
local T

local function setShown(wd, v)
  v = v and true or false
  if wd.catccShown ~= v then
    wd.catccShown = v
    wd:setVisible(v)
  end
end

-- the window shown or put away: from S.tick (and the mission's end) only
local function apply(v)
  local w = P.win
  if v then
    -- (DCS's own slot screen put away under it, where it can be: S.guiTick)
    if S.MSR and S.MSR.hide then try(S.MSR.hide) end
    if S.guiDone then gui(GUI_HIDE) end
    w:setSkin(P.winSkin)
    w:setBounds(P.x, P.y, P.w, P.h)
    for _, c in ipairs(P.fixed) do setShown(c, true) end
    pcall(function() w:setHasCursor(true) end)
    if not P.locked then
      P.locked = true
      try(function() DCS.lockAllMouseInput() end)
    end
    P.shown = true
    S.refreshAt = 0
    S.refresh()
    log('the picker is shown')
  else
    if P.shown then
      local okb, bx, by = pcall(function() return w:getBounds() end)
      if okb and bx and by then P.x, P.y = bx, by end
    end
    w:setSkin(P.hiddenSkin)
    w:setBounds(P.x, P.y, 10, 10)
    for _, c in ipairs(P.fixed) do setShown(c, false) end
    for _, c in ipairs(P.rest()) do setShown(c, false) end
    pcall(function() w:setHasCursor(false) end)
    if P.locked then
      P.locked = false
      try(function() DCS.unlockMouseInput() end)
    end
    local was = P.shown
    P.shown = false
    if was then log('the picker is put away') end
  end
end

local function build()
  if P.win then return true end
  if P.broken then return false end
  local ok, t = pcall(function()
    return { DialogLoader = require('DialogLoader'), Button = require('Button'), Static = require('Static'), SkinUtils = require('SkinUtils'), Skin = require('Skin') }
  end)
  if not ok then
    P.broken = true
    log('no window toolkit here: ' .. tostring(t))
    return false
  end
  T = t
  local dir = api.writedir .. 'Scripts\\CATCC\\'
  local okw, w = pcall(T.DialogLoader.spawnDialogFromFile, dir .. 'crewtest_slots.dlg')
  if not okw or not w then
    P.broken = true
    log('the window could not be made: ' .. tostring(w))
    return false
  end
  P.win = w
  P.winSkin = w:getSkin()
  P.hiddenSkin = T.Skin.windowSkinChatMin()
  P.x, P.y, P.w, P.h = WIN.x, WIN.y, WIN.w, WIN.h
  -- (at the screen's top centre, the carrier in the view below it: VIEW, S.view)
  if VIEW.on and VIEW.window then
    local sw = S.view.screen()
    if sw then
      P.x, P.y = math.max(0, math.floor((sw - WIN.w) / 2)), VIEW.winTop
      log(string.format('the window at the screen\'s top centre: %d, %d (the screen %d wide)', P.x, P.y, sw))
    end
  end
  -- (the skins: the dialog's templates, in the CATCC app's fonts and colours: crewtest_slots.dlg)
  P.skin = {}
  for _, n in ipairs({ 'tplButton', 'tplPrimary', 'tplAmber', 'tplRed', 'tplHit', 'tplLabel', 'tplAsk', 'tplShip', 'tplPrimaryOff',
    'tplBoardGray', 'tplBoardMine', 'tplBoardReady', 'tplBoardSel' }) do
    local c = w[n]
    if c then
      P.skin[n] = c:getSkin()
      c:setVisible(false)
    end
  end
  P.dir = dir
  P.pics = {}
  -- (every aircraft picture drawn once, 1 x 1 under the deck picture, so DCS has loaded each before it is needed: a turn
  -- shows its next picture at once, not a moment after the move (the user, 2026-11-20: "first position, then rotation"))
  P.preload = {}
  local files = {}
  for _, cls in ipairs(JET_CLS) do files[#files + 1] = string.format('catcc_jet_%s.png', cls) end
  files[#files + 1] = 'catcc_jet_shadow.png'
  do
    for _, file in ipairs(files) do
      local okq = pcall(function()
        P.pics[file] = P.pics[file] or T.SkinUtils.setStaticPicture(dir .. 'jets\\' .. file)
        local q = T.Static.new()
        q:setSkin(P.pics[file])
        q:setBounds(DECK.x + 2, DECK.y + 2, 1, 1)
        w:insertWidget(q)
        P.preload[#P.preload + 1] = q
      end)
      if not okq then break end
    end
  end
  P.deck = T.Static.new()
  local okp, err = pcall(function() P.deck:setSkin(T.SkinUtils.setStaticPicture(dir .. 'catcc_deck.png')) end)
  if not okp then log('the deck picture could not be set: ' .. tostring(err)) end
  P.deck:setBounds(DECK.x, DECK.y, DECK.w, DECK.h)
  w:insertWidget(P.deck)
  -- (a button only notes what it asks for: S.tick does it)
  local function button(text, x, y, wd, fn, skin)
    local b = T.Button.new(text)
    b:setSkin(P.skin[skin or 'tplButton'])
    b:setBounds(x, y, wd, 26)
    b:addMouseUpCallback(function()
      P.queue[#P.queue + 1] = { text = text, fn = function() fn(b) end }
    end)
    w:insertWidget(b)
    return b
  end
  local function label(text, x, y, wd, h, skin)
    local s = T.Static.new(text)
    s:setSkin(P.skin[skin or 'tplLabel'])
    s:setBounds(x, y, wd, h)
    pcall(function() s:setWrapping(true) end)
    w:insertWidget(s)
    return s
  end
  P.button, P.label = button, label
  -- THE BOTTOM: what is chosen (left); the carrier (middle); the player's own (right): Spawn, and under it Release slot
  -- (DCS's own Release Slot: to the spectators; amber). Release reservation (a player's claim on a spotted aircraft;
  -- red) at the far left, away from them (the user, 2026-11-20: "They need to be visually distinct and physically
  -- separate so players don't get them confused. Both should have confirmations as well."); its question and Yes / No
  -- beside it.
  P.status = label('', 6, 421, 720, 34)
  -- (the tab row, right: the demo's counts)
  P.demo = label('', 780, TABS.y, 618, TABS.h)
  -- Spot Deck (the user, 2026-11-21: for now the deck spotting demo, on the carrier shown; later its real work): the
  -- host's (the demo runs where it is started)
  P.spot = button('Spot Deck', 732, 424, 102, function() S.spotDeck() end)
  -- Spot All (the user, 2026-11-22: "an alternative deck spot button that spots all statics in their positions":
  -- no time to wait for the towing to try the elevator spots): every aircraft on its deck spot at once
  P.spotAll = button('Spot All', 840, 424, 92, function() S.spotDeck(true) end)
  P.unhold = button('Release reservation', 6, 456, 210, function() S.askUnhold() end, 'tplRed')
  P.ask = label('', 226, 456, 470, 26, 'tplAsk')
  P.yes = button('Yes', 702, 456, 70, function() S.answer(true) end)
  P.no = button('No', 778, 456, 70, function() S.answer(false) end)
  -- (the carriers' tabs above the deck: made by S.refresh, one for each carrier of the mission)
  P.tabs = {}
  P.other = button('DCS slot list', 874, 456, 166, function() S.vanillaScreen() end)
  P.spec = button('Close', 1046, 456, 172, function() S.closePicker() end)
  P.spawn = button('Spawn', 1226, 424, 172, function() S.spawnSel() end, 'tplPrimary')
  P.unseat = button('Release slot', 1226, 456, 172, function() S.askUnseat() end, 'tplAmber')
  -- (shown with the window: the rest, S.refresh decides)
  P.fixed = { P.deck, P.status, P.spawn, P.spec }
  for _, q in ipairs(P.preload) do P.fixed[#P.fixed + 1] = q end
  P.rest = function()
    local out = { P.unhold, P.unseat, P.ask, P.yes, P.no, P.other, P.spot, P.spotAll, P.demo }
    for _, b in ipairs(P.tabs) do out[#out + 1] = b end
    for _, m in ipairs(P.markers) do
      if m.shadow then out[#out + 1] = m.shadow end
      out[#out + 1] = m.icon
      out[#out + 1] = m.lab
      out[#out + 1] = m.hit
    end
    return out
  end
  -- DCS's own slot screen back, whatever is on the screen (the run of 2026-11-20: DCS's screen held back and the picker
  -- not seen: no slot screen at all): Ctrl+Shift+F8 (on this window, as the panel's keys are on its: they work while it
  -- is put away). Noted here, done by S.tick.
  pcall(function() w:addHotKeyCallback('Ctrl+Shift+F8', function() P.wantVanilla = true end) end)
  -- made visible once, for good; it starts put away
  w:setVisible(true)
  apply(false)
  log('the picker\'s window made (shown by S.tick when wanted; never made invisible)')
  return true
end

local function setText(wd, text)
  if wd.catccText ~= text then
    wd.catccText = text
    wd:setText(text)
  end
end

-- what is drawn on the deck: the demo's aircraft on the flight deck, and every slot's spot (of the carrier shown)
function S.items()
  local carrier = S.carriers[S.carrierIx] or S.ship
  local out = {}
  local mine = pinfo(myId() or -1, 'ucid')
  local myName = pinfo(myId() or -1, 'name')
  if S.demoOn() and S.ship == carrier then
    for _, a in ipairs(S.list) do
      if a.level == 'deck' or a.state == 'manned' then
        local sl = a.spot and S.bySpot[tostring(carrier) .. '/' .. a.spot] or nil
        out[#out + 1] = { x = a.x, z = a.z, a = a, slot = sl, text = tostring(a.board) }
      end
    end
  end
  -- (a slot's spot with no aircraft of the demo on it is not drawn: only what CATCC has spotted can be taken (the user,
  -- 2026-11-21: DCS's spawn points showed through, "the 012 slot here should never appear"))
  for _, it in ipairs(out) do
    if it.slot then
      it.ok, it.why = S.status(it.slot, mine, myName)
    else
      it.ok, it.why = false, 'no slot of the mission on its spot'
    end
  end
  return out
end

-- (a widget's skin, set only when it changes)
local function setSkinOnce(wd, key, skin)
  if wd.catccSkin ~= key then
    wd.catccSkin = key
    wd:setSkin(skin)
  end
end

-- the picture of a folded-wing Hornet (PriFly's, scripts/catcc/deck-picture.tsx) in a colour, nose to the bow; turned to
-- the aircraft's heading by placeMark (the demo's heading is clockwise: from the bow to starboard)
local JET = 84 -- its square, pixels (21 m: room for its shadow)
local function jetPic(cls)
  -- (one picture per colour, nose to the bow; the picker turns it: placeMark)
  local file = cls == 'shadow' and 'catcc_jet_shadow.png' or string.format('catcc_jet_%s.png', cls)
  if not P.pics[file] then P.pics[file] = T.SkinUtils.setStaticPicture(P.dir .. 'jets\\' .. file) end
  return file, P.pics[file]
end

-- who is in a slot now (the server's view: S.track), or nil
function S.occupant(slotId)
  for id, s in pairs(S.inSlot) do
    if s == slotId then return id end
  end
  return nil
end

-- (a mark put where its aircraft is drawn now: its picture (colour, heading), its number and its click target in one
-- go; an aircraft of the demo where S.pose has it at this moment. Returns whether it is still on the move.)
local function placeMark(m, t)
  local it = m.item
  local x, z, hdg, moving = it.x, it.z, it.a and it.a.hdg, false
  local p = it.a and S.poses and S.poses[it.a.key]
  if p then x, z, hdg, moving = S.pose(p, t) end
  local cx = math.floor(DECK.x + (x - X0) * PX + 0.5)
  local cy = math.floor(DECK.y + (z - Z0) * PX + 0.5)
  local at = cx * 10000 + cy
  if it.a then
    local file, skin = jetPic(m.cls)
    setSkinOnce(m.icon, file, skin)
    do
      -- (turned about its middle to the aircraft's heading, the shadow with it, to the nearest degree)
      local deg = math.floor((hdg or 0) + 0.5) % 360
      if m.deg ~= deg then
        m.deg = deg
        pcall(function()
          m.icon:setAngle((JET_TURN.sign * deg + JET_TURN.offset) % 360)
          m.shadow:setAngle((JET_TURN.sign * deg + JET_TURN.offset) % 360)
        end)
      end
    end
    if m.at ~= at then
      if m.shadow then m.shadow:setBounds(cx - JET / 2 + JET_TURN.dx, cy - JET / 2 + JET_TURN.dy, JET, JET) end
      m.icon:setBounds(cx - JET / 2, cy - JET / 2, JET, JET)
      m.lab:setBounds(cx - 45, cy - math.floor(9.5 * PX) - 11, 90, 22)
      m.hit:setBounds(cx - 30, cy - 30, 60, 60)
    end
  elseif m.at ~= at then
    m.lab:setBounds(cx - 45, cy - 11, 90, 22)
    m.hit:setBounds(cx - 30, cy - 15, 60, 30)
  end
  m.at = at
  return moving
end

-- (every frame while the picker is up: the aircraft on the move drawn where they are at this moment)
function S.moveMarks(t)
  if not (P.win and P.shown) then return end
  for _, m in ipairs(P.markers) do
    if m.item and m.item.a and m.catccMoving and m.icon.catccShown then m.catccMoving = placeMark(m, t) end
  end
end

-- THE CARRIERS' TABS (the user, 2026-11-21: "The slot selection interface needs UI for switching between carriers"):
-- one for each aircraft carrier of the mission, in a row above the deck, always shown (one carrier: one tab); the one
-- shown in the app's orange, the others plain; a click shows that carrier's deck (and is the carrier Spot Deck spots).
function S.tabs()
  local x = TABS.x
  if S.carrierIx > #S.carriers then S.carrierIx = 1 end
  for i, name in ipairs(S.carriers) do
    local b = P.tabs[i]
    if not b then
      b = P.button(name, 0, TABS.y, 100, function() S.carrierIx, S.sel = i, nil end)
      P.tabs[i] = b
    end
    setText(b, name)
    local wd = math.min(320, math.max(140, #name * 9 + 28))
    if b.catccX ~= x or b.catccW ~= wd then
      b.catccX, b.catccW = x, wd
      b:setBounds(x, TABS.y, wd, TABS.h)
    end
    local on = i == S.carrierIx
    setSkinOnce(b, on and 'on' or 'off', P.skin[on and 'tplPrimary' or 'tplButton'])
    setShown(b, true)
    x = x + wd + 6
  end
  for i = #S.carriers + 1, #P.tabs do setShown(P.tabs[i], false) end
end

-- THE DECK: each aircraft of the demo on the flight deck as PriFly draws it (a folded-wing Hornet in the colours of
-- JET_CLS above, with a drop shadow), its board number 9.5 m on its port side as PriFly's (.deck .id), and the click target
-- the aircraft itself (PriFly's: a 7.5 m circle). Nothing else is drawn (S.items).
function S.refresh()
  if not (P.win and P.shown) then return end
  local items = S.items()
  local selFound = false
  for i, it in ipairs(items) do
    local m = P.markers[i]
    if not m then
      m = { icon = T.Static.new(), lab = P.label('', 0, 0, 90, 22, 'tplBoardGray') }
      do
        -- (its shadow: a picture of its own under it, turned with it (S.placeMark); both turn about their middle)
        m.shadow = T.Static.new()
        local _, sk = jetPic('shadow')
        m.shadow:setSkin(sk)
        P.win:insertWidget(m.shadow)
        pcall(function()
          m.shadow:setPivotPoint(JET / 2, JET / 2)
          m.icon:setPivotPoint(JET / 2, JET / 2)
        end)
      end
      P.win:insertWidget(m.icon)
      -- (the click target over the picture and the number)
      m.hit = P.button('', 0, 0, 60, function() S.sel = m.item end, 'tplHit')
      P.markers[i] = m
    end
    m.item = it
    local sel = S.sel and ((S.sel.slot and S.sel.slot == it.slot) or (S.sel.a and it.a and S.sel.a.key == it.a.key))
    if sel then S.sel, selFound = it, true end
    m.cls = sel and 'sel' or (it.slot and S.green[it.slot.id] and 'ready') or (it.ok and 'mine') or 'gray'
    setText(m.lab, it.text)
    setShown(m.icon, true)
    if m.shadow then setShown(m.shadow, true) end
    m.catccMoving = placeMark(m, S.lastT or 0)
    setSkinOnce(m.lab, m.cls, P.skin[BOARD_TPL[m.cls]])
    setShown(m.lab, true)
    setShown(m.hit, true)
  end
  -- (the chosen aircraft gone from the deck (taken down, the demo stopped): nothing chosen)
  if S.sel and not selFound then S.sel = nil end
  for i = #items + 1, #P.markers do
    local m = P.markers[i]
    setShown(m.icon, false)
    if m.shadow then setShown(m.shadow, false) end
    setShown(m.lab, false)
    setShown(m.hit, false)
  end
  local below = 0
  for _, a in ipairs(S.list) do
    if a.level ~= 'deck' and a.state ~= 'manned' then below = below + 1 end
  end
  S.tabs()
  local it = S.sel
  local text
  local occ = it and it.slot and S.occupant(it.slot.id)
  local h = it and it.slot and S.hold[it.slot.id]
  if it then
    -- (the spot by its name on the spotting plan, as PriFly labels it: "Point 3", not the mission's "Spot 13-1"; a
    -- spot the plan does not know: the slot's own name)
    local sp = it.slot and S.spotPos[tonumber(it.slot.spot)]
    local who = it.slot and tostring(sp and sp.name or it.slot.name) or ('aircraft ' .. it.text)
    text = it.ok and who or (who .. ': ' .. tostring(it.why) .. '.')
    if occ then text = text .. ' In it: ' .. tostring(pinfo(occ, 'name')) .. '.' end
    if h then text = text .. ' Reserved for ' .. tostring(h.name) .. '.' end
  else
    text = 'Click an aircraft. Magenta: yours to take; green: ready to taxi; grey: not yours, or not spotted yet.'
  end
  setText(P.demo, S.demoOn() and string.format('Deck spotting demo: %d on the deck, %d below', #S.list - below, below) or '')
  setShown(P.demo, S.demoOn())
  if not mp() then text = text .. ' (Single player: there is no slot to take.)' end
  local asking = P.asking ~= nil
  setText(P.status, text)
  -- the reservation of a player not in the aircraft (in it: Release slot first); the server's (PriFly's, later) to release
  setShown(P.unhold, not asking and server() and h ~= nil and not occ)
  -- the player's own slot (DCS's own Release Slot)
  setShown(P.unseat, not asking and mp() and S.mySlot() ~= nil)
  setText(P.ask, asking and P.asking.text or '')
  setShown(P.ask, asking)
  setShown(P.yes, asking)
  setShown(P.no, asking)
  setShown(P.other, mp())
  setShown(P.spot, (server() or not mp()) and not S.demoOn() and (S.carriers[S.carrierIx] or S.ship) ~= nil)
  setShown(P.spotAll, (server() or not mp()) and not S.demoOn() and (S.carriers[S.carrierIx] or S.ship) ~= nil)
  -- Spawn: faded and not pressable unless the aircraft chosen is one this player may take (the user, 2026-11-21)
  local canSpawn = (it and it.slot and it.ok and mp()) and true or false
  setSkinOnce(P.spawn, canSpawn and 'on' or 'off', P.skin[canSpawn and 'tplPrimary' or 'tplPrimaryOff'])
  if P.spawn.catccEnabled ~= canSpawn then
    P.spawn.catccEnabled = canSpawn
    pcall(function() P.spawn:setEnabled(canSpawn) end)
  end
end

-- THE TWO RELEASES, each asked first (Yes / No beside Release reservation):
-- Release slot: the player's own slot, as DCS's own Release Slot button does (MultiplayerSelectRole.releaseSlot: to the
-- spectators of his coalition); the aircraft's static comes back and it stays reserved for him (S.left).
function S.askUnseat()
  local mine = S.mySlot()
  if not mine then return end
  local sl = S.bySlot[mine]
  P.asking = { text = string.format('Release your slot%s? You go to the spectators; it stays reserved for you.', sl and (' (' .. sl.name .. ')') or ''), fn = S.unseat }
end

function S.unseat()
  local r
  if S.guiDone then
    r = gui('local m = package.loaded["MultiplayerSelectRole"] if m and m.releaseSlot then m.releaseSlot() return "released" end return "no releaseSlot"')
  end
  if r ~= 'released' then
    -- (DCS's own way out of reach: what it does, without its coalition password)
    local id = myId()
    local side = id and try(function() return net.get_player_info(id, 'side') end) or 0
    try(function() net.set_slot(side, '') end)
    r = 'set_slot(' .. tostring(side) .. ', "")'
  end
  log('Release slot: ' .. tostring(r))
end

-- Release reservation: a player's claim on a spotted aircraft (S.hold), when he is not in it: anyone may take it then.
function S.askUnhold()
  local it = S.sel
  local h = it and it.slot and S.hold[it.slot.id]
  if not h then return end
  local id = it.slot.id
  P.asking = { text = string.format('Release the reservation of %s on %s? Anyone may then take it.', tostring(h.name), it.slot.name), fn = function() S.release(id) end }
end

function S.answer(yes)
  local a = P.asking
  P.asking = nil
  if yes and a then a.fn() end
end

-- The picker wanted on the screen (anywhere: asked for, not in DCS's screen's place) or not: S.tick builds the window,
-- shows it and puts it away.
function S.showPicker(anywhere)
  if anywhere then S.vanilla, S.closedAt = false, nil end
  if P.on then return end
  P.on, P.anywhere, P.slotAtShow = true, anywhere, S.mySlot()
end

function S.hidePicker()
  if not P.on then return end
  -- (put away while the player has no slot: not shown over DCS's screen again until his slot changes: S.tick)
  S.closedAt = S.mySlot() or ''
  P.on = false
end

-- (from S.tick: what the buttons asked for, then the window built, shown or put away as wanted)
function S.applyPicker()
  if #P.queue > 0 then
    local q = P.queue
    P.queue = {}
    for _, e in ipairs(q) do
      local ok, err = pcall(e.fn)
      if not ok then log('button "' .. tostring(e.text) .. '": ' .. tostring(err)) end
    end
    S.refreshAt = 0
  end
  if P.wantVanilla then
    P.wantVanilla = nil
    log('Ctrl+Shift+F8: DCS\'s own slot screen')
    S.vanillaScreen()
  end
  if P.on and not build() then
    -- (no window: DCS's own screen, as before)
    P.on = false
    if not P.anywhere then
      S.vanilla = true
      S.vanillaScreen()
    end
    return
  end
  if P.win and P.on ~= P.shown then apply(P.on) end
end

-- The picker's Close: where the GUI state is reached, what DCS's own close of its slot screen does (a spectator goes on
-- spectating, a player in a slot back to his aircraft), and refused where DCS's own close is (no spectators allowed).
function S.closePicker()
  if S.guiDone then
    local r = tostring(gui(GUI_CLOSE))
    log('Close: ' .. r)
    if r == 'not allowed' then return api.say('This server allows no spectators: choose an aircraft.') end
  end
  S.hidePicker()
end

-- The picker's Spot Deck: the deck spotting demo on the carrier the picker shows (by name: the camera is not at it
-- from the slot screen); the picker stays up and draws the aircraft as they come.
function S.spotDeck(all)
  local carrier = S.carriers[S.carrierIx] or S.ship
  if not carrier then return api.say('No carrier with slots in this mission.') end
  log((all and 'Spot All: every aircraft on its deck spot at once on ' or 'Spot Deck: the deck spotting demo on ') .. tostring(carrier))
  api.run('demo2|all|' .. (all and 1 or 0))
  api.run('demo2|start|' .. tostring(carrier))
end

-- The picker's Spawn: the slot taken (net.set_slot, as DCS's own slot list does at a click); once it is the player's
-- (S.tick), DCS's briefing, as DCS's own BRIEFING button opens it: its FLY puts him in the jet.
function S.spawnSel()
  local it = S.sel
  if not (it and it.slot) then return api.say('Choose an aircraft with a slot first.') end
  if not it.ok then return api.say(it.slot.name .. ': ' .. tostring(it.why)) end
  if not mp() then return api.say('Single player: there is no slot to take.') end
  -- THE STATIC GOES FIRST (the run of 2026-11-22, a slot on every spot: the slots of Point 4 and Stbd 2 came up on
  -- Patio 2, the slot of Bow stbd 6 on its own spot (now Point 1, Fantail 3 and Stbd bow 1); the static was only taken away once the slot WAS the player's
  -- (S.track, up to a second later) while DCS makes his aircraft the moment the slot is his: with the static still on
  -- the spot DCS gave him another). Now: the static is taken away, the aircraft reserved for him, and the slot taken
  -- SPAWN_PRE seconds later; not taken after all: the static is made again and a reservation made here given up.
  local held = S.hold[it.slot.id] ~= nil
  if not held then S.hold[it.slot.id] = { ucid = pinfo(myId() or -1, 'ucid') or ('player ' .. tostring(myId())), name = pinfo(myId() or -1, 'name') or '?' } end
  -- (DCS'S FLY HELD in the GUI state (S.flyTick): the slot now, the static until his FLY)
  if S.flyReady() then
    log(string.format('taking %s (%s, side %d): the slot now; its static stays until DCS\'s FLY', it.slot.name, it.slot.id, it.slot.side))
    S.flyArm(it.slot, S.lastT or 0, 'the picker\'s Spawn')
    S.spawnPre = { slot = it.slot, at = S.lastT or 0, held = held, fly = true }
    return S.hidePicker()
  end
  log(string.format('taking %s (%s, side %d): its static first, the slot in %d s', it.slot.name, it.slot.id, it.slot.side, SPAWN_PRE))
  S.man(it.slot)
  S.spawnPre = { slot = it.slot, at = (S.lastT or 0) + SPAWN_PRE, held = held }
  S.hidePicker()
end

-- ---------------------------------------------------------------- the spot aimed at
-- DCS PUTS A NEW AIRCRAFT ON THE DECK SPOT WITH THE LOWEST NUMBER IN PLAY (from 5 up, no aircraft on it), whatever the
-- slot's parking number: the ATC probe's runs of 2026-11-22 (catcc-dcs/deck-test/spawn-probe/README.md). So just
-- before the slot is taken every number before the slot's spot is put out of play (the probe's native module:
-- aim(ship's object id, spot, 'low', true): each such terminal's number becomes 4, which DCS does not give after
-- mission start; the nine spawn-only spots' numbers are written directly), and put back (restore) once an aircraft
-- stands on the spot, or after AIM.giveUp seconds. Only where DCS decides: the server (the host, in every run so far).
-- (mode 'up': every number before the spot + 100, and numbers 1 to 4 too (fromOne): 33 of 33 mission slots whose
-- spot was really clear came up on it, 2026-11-22; 'low' froze DCS once and missed twice)
-- (notBefore: s of mission time before a mission's first aimed spawn. 60 until 2026-11-24 (two freezes of 2026-11-22);
-- 0 since the first-spawn series (below) found no limit: 25, 20, 15, 10, 5 and 0 s all landed, the last at 2.6 s)
local AIM = { mode = 'up', write = true, fromOne = true, giveUp = 90, notBefore = 0, clearFor = 8, near = 6 }
-- (DCS's FLY held until the static is gone: S.flyTick, below, says what each is.) settle: the wait from the static
-- seen gone to the clear check (0: the user, 2026-11-23, "Fix it at 0s for now"); refresh: the ATC's
-- own pass over its spots (native updobs) the moment the static is seen gone: true, false, or 'alternate' (odd held
-- FLYs with it, even ones without). OFF: the alternating run of 2026-11-23 (eleven held FLYs, all on their spots, the
-- five without it too; DCS's own reading of the spot the same before and after it every time, and already clear 0.01 s
-- after the static went); gone: s for the static to be seen gone
-- before the FLY is refused; near: m from the spot's place within which a static is still "on" it; lease: s DCS's FLY
-- stays held without a look from here; ask: s between clear checks; arm: s for the picker's slot to become his;
-- trace: s after the FLY in which the aircraft is looked for ten times a second
local FLY = { settle = 0, refresh = false, gone = 3, near = 3, lease = 2, ask = 0.25, arm = 12, trace = 20 }
-- (the first-spawn test: S.firstStart says what it is)
-- (2026-11-24, the user's second series: 25, 20, 15 and 10 s all landed, no freeze; then 5 and 0 (no hold at all: the
-- FLY went at 2.6 s of mission time) landed too. Done: off; on again (or S.firstOn) to run a series)
local FIRST = { on = false, cases = { 25, 20, 15, 10, 5, 0 }, file = 'Logs/catcc-firstspawn.txt' }
-- (S.firstFile: another file, for the tests; S.firstOn: the series on, for the tests)
local function firstPath() return S.firstFile or (api.writedir .. FIRST.file) end
local function firstWrite(line)
  local f = io.open(firstPath(), 'a')
  if not f then return log('first-spawn test: ' .. FIRST.file .. ' could not be written') end
  f:write(os.date('%Y-%m-%d %H:%M:%S') .. ' ' .. line .. '\n')
  f:close()
  log('first-spawn test: ' .. line)
end
local aimMod, aimWhy
local function aimNative()
  if aimMod or aimWhy then return aimMod end
  local path = api.writedir .. 'Scripts\\CATCC\\bin\\catcc_atcprobe.dll'
  local ok, loader, err = pcall(function() return package.loadlib(path, 'luaopen_catcc_atcprobe') end)
  if ok and type(loader) == 'function' then
    local ok2, m = pcall(loader)
    if ok2 and type(m) == 'table' and m.aim and m.restore then aimMod = m else aimWhy = 'it did not start: ' .. tostring(m) end
  else
    aimWhy = tostring(ok and err or loader)
  end
  log('aim: the native module ' .. (aimMod and 'is loaded' or ('is not there: ' .. tostring(aimWhy))))
  return aimMod
end
-- (the ship's object id, which the module finds its air traffic control by: the mission's Unit.id_)
local function shipObj(name)
  S.shipObj = S.shipObj or {}
  if S.shipObj[name] then return S.shipObj[name] end
  local ok, r = pcall(function()
    return net.dostring_in('server', 'local u = Unit.getByName(' .. string.format('%q', tostring(name)) .. ') return u and tostring(u.id_) or ""')
  end)
  local id = ok and tonumber(r) or nil
  if id and id > 0 then S.shipObj[name] = id end
  return S.shipObj[name], ok and r or tostring(r)
end
-- DCS'S NUMBER OF A DECK SPOT: the spot's number + 4 where DCS's own first four spawn routes (the catapults',
-- given only at mission start: the user's "Alert 7" places, 2026-11-23) stand in front of the plan's 40 in the
-- routes file (deck-test/spots.gen.ts SPAWN_OFFSET), the spot's number itself with an older routes file: told by
-- how many terminals the ship has (4 more with the four in front). nil: not known (the ship's terminals not read).
local function dcsNumber(ship, spot)
  S.aimOff = S.aimOff or {}
  if S.aimOff[ship] == nil then
    local ok, all = pcall(aimMod.check, ship)
    -- (the jet terminals' numbers (type 72; the helicopter spots' come after them): the highest tells how many
    -- spawn routes the routes file has: 44 with the four given only at mission start in front, 40 without. DCS
    -- MAKES ONE TERMINAL OF TWO SPAWN POINTS ON THE SAME PLACE (the run of 2026-11-23, the four in front being
    -- copies of the first four six-pack spots: 48 terminals, not 52): which of the two numbers such a terminal
    -- keeps is read here, not assumed)
    local has, top, n = {}, 0, 0
    if ok and type(all) == 'table' then
      for num, e in pairs(all) do
        n = n + 1
        if type(num) == 'number' and type(e) == 'table' and (e.type == nil or tonumber(e.type) == 72) then
          has[num] = true
          if num > top and num <= 60 then top = num end
        end
      end
    end
    if n == 0 then return nil end
    local off = top > 40 and top - 40 or 0
    local missing = {}
    for k = 1, top do
      if not has[k] then missing[#missing + 1] = k end
    end
    S.aimOff[ship] = { off = off, has = has }
    log(string.format("aim: the ship has %d terminals, the jets' numbers run to %d: deck spot n is DCS's number n + %d; numbers with no terminal: %s", n, top, off,
      #missing > 0 and table.concat(missing, ', ') or 'none'))
  end
  local o = S.aimOff[ship]
  local num = spot + o.off
  if o.has[num] then return num end
  -- (its own number has no terminal: its terminal is the one shared with a mission-start spawn point on the same
  -- place and carries that point's number: the first four six-pack spots (deck spots 18 to 21) are points 1 to 4)
  if spot >= 18 and spot <= 21 and o.has[spot - 17] then return spot - 17 end
  return num
end
local function aimCall(a)
  local ok, o, err = pcall(aimMod.aim, a.ship, a.spot, AIM.mode, AIM.write, AIM.fromOne)
  if not ok then return nil, tostring(o) end
  return o, err
end
-- the ATC's terminals as they read now: each one's client, by its place in the ATC's list; with `what`, the log gets
-- every terminal: "<place>:<Term_Index>/<number>[*taken][=client]" (the 16 bytes at +0x88 of a terminal: Term_Index,
-- the number DCS chooses by, the type, the taken byte)
function S.aimTerms(what, quiet)
  if not (aimMod and aimMod.terminals) then return nil end
  local ok, r = pcall(aimMod.terminals)
  if not (ok and type(r) == 'table' and type(r.t) == 'table') then
    if what then log('aim: terminals (' .. what .. '): not read: ' .. tostring(r)) end
    return nil
  end
  local function word(x, at)
    local v = 0
    for k = 3, 0, -1 do v = v * 256 + (tonumber(x:sub(at + 2 * k, at + 2 * k + 1), 16) or 0) end
    return v >= 2147483648 and v - 4294967296 or v
  end
  local clients, out = {}, {}
  for i, e in ipairs(r.t) do
    local x = type(e.x) == 'string' and #e.x >= 32 and e.x or nil
    clients[i] = tonumber(e.client) or 0
    out[#out + 1] = string.format('%d:%s/%s%s%s', i, x and word(x, 1) or '?', x and word(x, 9) or '?', x and x:sub(25, 26) ~= '00' and '*' or '',
      clients[i] ~= 0 and ('=' .. clients[i]) or '')
  end
  if what then log('aim: terminals (' .. what .. '): ' .. table.concat(out, ' ')) end
  return clients
end

-- WHAT STANDS NEAREST A PLACE ON THE DECK THAT IS NOT THE DEMO'S (asked of the mission's state): every live aircraft
-- and helicopter of any side, and every static object not named catcc-..., within 15 m of the deck's height; not the
-- asking player's own aircraft (it goes when he takes the new slot). sp: the place in the ship's frame (x forward, z to
-- starboard). Its distance in metres and its name; nil: nothing within 60 m, or the mission could not be asked.
function S.liveNear(carrier, sp)
  if not (sp and carrier) then return nil end
  local me = pinfo(myId() or -1, 'name')
  local code = string.format([[
    local s = Unit.getByName(%q)
    if not s then return '' end
    local p, X, Z, me = s:getPosition(), %.3f, %.3f, %q
    local best, who
    local function look(o, name)
      local q = o:getPoint()
      local dx, dy, dz = q.x - p.p.x, q.y - p.p.y, q.z - p.p.z
      if math.abs(dy) > 40 then return end
      local fx = dx * p.x.x + dy * p.x.y + dz * p.x.z
      local fz = dx * p.z.x + dy * p.z.y + dz * p.z.z
      local d = math.sqrt((fx - X) ^ 2 + (fz - Z) ^ 2)
      if d < 60 and (not best or d < best) then best, who = d, name end
    end
    for _, side in pairs(coalition.side) do
      for _, cat in ipairs({ Group.Category.AIRPLANE, Group.Category.HELICOPTER }) do
        for _, g in ipairs(coalition.getGroups(side, cat) or {}) do
          for _, u in ipairs(g:getUnits() or {}) do
            if u:isExist() and u:getPlayerName() ~= me then look(u, tostring(u:getPlayerName() or u:getName())) end
          end
        end
      end
      for _, o in ipairs(coalition.getStaticObjects(side) or {}) do
        local n = tostring(o:getName())
        if o:isExist() and not n:find('^catcc%%-') then look(o, n) end
      end
    end
    return best and string.format('%%.2f|%%s', best, who) or ''
  ]], tostring(carrier), sp.x, sp.z, tostring(me or ''))
  local ok, r = pcall(function() return net.dostring_in('server', code) end)
  if not ok or type(r) ~= 'string' then return nil end
  local d, who = r:match('^([%d.]+)|(.*)$')
  return tonumber(d), who
end

-- (before the slot is taken) wait: not yet (asked again in a second); refuse: why the Spawn cannot be made. Nothing
-- to wait for or refuse where the spot is not aimed at (not the server, a spot below 5, no native module).
function S.aimReady(sl, t, pre)
  local spot = tonumber(sl.spot)
  if not server() or not spot or not aimNative() then return end
  local age = try(function() return DCS.getModelTime() end)
  -- (a held FLY (pre.goneAt) has had its wait (S.notBefore) with its static still standing: none here. Until
  -- 2026-11-24 this one ran too, after the static had gone: the first-spawn test's cases waited to 60 s with the spot
  -- empty)
  if not pre.goneAt and type(age) == 'number' and age < AIM.notBefore then
    if not pre.saidWait then
      pre.saidWait = true
      log(string.format('aim: %s: the mission is %.0f s old: the slot is taken at %d s', sl.name, age, AIM.notBefore))
      api.say(string.format('%s: the slot is taken in %.0f s.', sl.name, AIM.notBefore - age))
    end
    return true
  end
  if not aimMod.check then return end
  local ship, why = shipObj(sl.carrier)
  if not ship then return nil, 'the carrier could not be found (' .. tostring(why) .. ')' end
  -- (a spot DCS gives only at mission start cannot be aimed at: DCS would put the aircraft on another spot, whatever
  -- stands there: refused)
  local num = dcsNumber(ship, spot)
  if not num then return nil, 'the carrier\'s deck spots could not be read' end
  if num < 5 then return nil, 'DCS gives this spot only at mission start (number ' .. num .. '): it cannot be spawned into' end
  local ok, c, err = pcall(aimMod.check, ship, num)
  if not ok then c, err = nil, c end
  pre.checkFrom = pre.checkFrom or t
  if type(c) == 'table' and c.usable then
    log(string.format('aim: %s, spot %d: clear (asked %.2f s after its static went)', sl.name, spot, t - (pre.goneAt or (pre.checkFrom - SPAWN_PRE))))
    return
  end
  local reason = type(c) == 'table' and tostring(c.why) or ('it could not be checked: ' .. tostring(err))
  -- DCS'S "OBSTRUCTED" ALONE IS NOT TAKEN FOR IT (the user's runs of 2026-11-23: the starboard bow's spots, where the
  -- aircraft stand nose to tail 13 to 16 m apart, were all refused as obstructed with their own static gone, though
  -- aircraft came up on them the day before, when nothing was asked first): with the terminal free, held for nobody
  -- and no aircraft on it, the spot is clear if no other aircraft of the deck stands within AIM.near metres of it
  -- (the elevators' crossed aircraft, which DCS did turn a spawn away for, stood 1.9 to 2.7 m off)
  if type(c) == 'table' and c.free and (tonumber(c.client) or 0) == 0 and not c.object and S.demoOn(30) then
    local sp, near, who = S.spotPos[spot], nil, nil
    for _, a in ipairs(sp and S.list or {}) do
      if a.level == 'deck' and a.state ~= 'manned' and a.spot ~= spot then
        local d = math.sqrt((a.x - sp.x) ^ 2 + (a.z - sp.z) ^ 2)
        if not near or d < near then near, who = d, a.board end
      end
    end
    -- (and what is not the demo's: every live aircraft and every static object of the mission on the deck, asked of
    -- the mission: another player's jet, an AI aircraft, a static of the mission's own)
    local ld, lwho = S.liveNear(sl.carrier, sp)
    if ld and (not near or ld < near) then near, who = ld, lwho end
    if sp and (not near or near >= AIM.near) then
      log(string.format('aim: %s, spot %d: clear by the deck (DCS says %s; the nearest other aircraft, %s, stands %s m off)', sl.name, spot, reason, tostring(who),
        near and string.format('%.1f', near) or '?'))
      return
    end
    if near then reason = string.format('%s stands %.1f m from it', tostring(who), near) end
  end
  if t - pre.checkFrom < AIM.clearFor then return true end
  log(string.format('aim: %s, spot %d: NOT CLEAR after %d s: %s (free %s, client %s, object %s, obstructed %s, wide %s)', sl.name, spot, AIM.clearFor, reason,
    tostring(type(c) == 'table' and c.free), tostring(type(c) == 'table' and c.client), tostring(type(c) == 'table' and c.object), tostring(type(c) == 'table' and c.obstructed),
    tostring(type(c) == 'table' and c.obstructedWide)))
  return nil, 'its spot is not clear: ' .. reason
end

-- (just before the slot is taken) true: the spot is the one DCS gives next
function S.aim(sl, t)
  S.unaim('another spot is aimed at')
  local spot = tonumber(sl.spot)
  if not server() then return log('aim: ' .. sl.name .. ': not the server: DCS chooses the spot') end
  if not spot then return end
  if not aimNative() then return end
  local ship, why = shipObj(sl.carrier)
  if not ship then return log('aim: ' .. sl.name .. ': the object id of ' .. tostring(sl.carrier) .. ' could not be read: ' .. tostring(why)) end
  local num = dcsNumber(ship, spot)
  if not num or num < 5 then return log('aim: ' .. sl.name .. ': spot ' .. tostring(sl.spot) .. ' cannot be aimed at (DCS\'s number ' .. tostring(num) .. '): DCS chooses') end
  S.aimCount = (S.aimCount or 0) + 1
  -- (a.spot: DCS's number, what the module is asked by)
  local a = { ship = ship, spot = num, name = sl.name, untilT = t + AIM.giveUp, nextT = t + 1 }
  log(string.format('aim: %s, spot %d (DCS\'s number %d): Spawn %d of this mission: mode %s, mission time %s s', sl.name, spot, num, S.aimCount, AIM.mode,
    tostring(try(function() return math.floor(DCS.getModelTime()) end))))
  local o, err = aimCall(a)
  if not o then
    log(string.format('aim: %s, spot %d: FAILED: %s', sl.name, spot, tostring(err)))
    pcall(aimMod.restore, ship)
    return
  end
  S.aimed = a
  a.seen = S.aimTerms('as aimed', true) or {}
  log(string.format('aim: %s, spot %d: %d numbers put out of play by record, %d by a write, %d spawn-only spots still in the way, %d not as wanted%s; the spot reads taken=%s client=%s',
    sl.name, spot, o.lifted or -1, o.written or -1, o.blocked or -1, o.failed or -1, o.layoutBad and ' (the layout check failed: nothing written)' or '', tostring(o.taken), tostring(o.client)))
  return (o.blocked or 0) == 0 and (o.failed or 0) == 0
end
function S.unaim(why)
  local a = S.aimed
  if not a then return end
  S.aimed = nil
  if not aimMod then return end
  local ok, o, err = pcall(aimMod.restore, a.ship)
  log(string.format('aim: %s, spot %d: numbers put back (%s): %s', a.name, a.spot, tostring(why),
    ok and o and string.format('%d by record, %d by a write, %d left alone, %d not as at the start', o.records or -1, o.written or -1, o.left or -1, o.failed or -1) or ('FAILED: ' .. tostring(ok and err or o))))
end
-- (from S.tick, once a second while a spot is aimed at: an aircraft stands on it now, or it is given up)
local function aimTick(t)
  local a = S.aimed
  if not a or t < a.nextT then return end
  -- (after a held FLY, ten times a second for its first FLY.trace s: when the aircraft came, to a tenth)
  a.nextT = t + ((a.fly and t - (a.fly.goT or t) < FLY.trace) and 0.1 or 1)
  local o = aimCall(a)
  if o and tonumber(o.client) and tonumber(o.client) ~= 0 then
    S.aimTerms('the aircraft stands on the spot aimed at')
    S.flyResult(a.fly, 'landed', t)
    return S.unaim('an aircraft stands on the spot, client ' .. tostring(o.client))
  end
  -- (an aircraft that was not there when the spot was aimed at, on another terminal: DCS gave it that one)
  local now = S.aimTerms(nil, true)
  for i, c in pairs(now or {}) do
    if c ~= 0 and a.seen[i] ~= c then
      S.aimTerms('AN AIRCRAFT CAME UP ELSEWHERE: terminal ' .. i .. ', client ' .. c)
      S.flyResult(a.fly, 'elsewhere', t)
      return S.unaim('the aircraft came up on another spot')
    end
  end
  if t > a.untilT then
    S.flyResult(a.fly, 'none', t)
    return S.unaim('no aircraft came in ' .. AIM.giveUp .. ' s')
  end
end

-- ---------------------------------------------------------------- DCS's FLY held until the static is gone
-- THE SPOT EMPTY FOR AS SHORT A TIME AS CAN BE (the user, 2026-11-23: "In an ideal world, the substitution would be
-- immediate, so that other players on the deck do not see aircraft vanishing into thin air only to be replaced
-- seconds later"). Until now the static went at Spawn, the slot was taken 3 s later and DCS's briefing followed; DCS
-- makes the aircraft only at the briefing's FLY (net.spawn_player), so the spot stood empty for as long as the
-- briefing was up: 9 to 11 s in the runs of 2026-11-23, 90 s once. DCS gives the spot when the aircraft is made, not
-- when the slot is taken (that run's 90 s: no terminal held for anyone while the briefing was up).
-- NOW, on the host, once DCS's GUI state is reached (S.guiTick): the slot is taken with the static still standing.
-- DCS's FLY (BriefingDialog.Fly_onChange, and its button, which DCS binds to it once) and net.spawn_player (every other
-- way into the aircraft: the slot screen's close) are wrapped in the GUI state (CATCC_FLY): while this hook holds a
-- lease on the player's slot they only note that they were asked. Then here (S.flyTick, every frame): the static taken
-- away (demo2|man); seen gone from the mission (S.staticOn: with the demo on its own thread it goes a frame or two
-- later); the ATC's own pass over what stands on its spots (native updobs: woATC::updateTermObstructions, NOT YET RUN
-- IN DCS); the wait FLY.settle; the clear check and the aim (S.aimReady, S.aim); then DCS's own FLY.
-- THE WAIT (FLY.settle) IS 0 s: the run of 2026-11-23 stepped it down 1, 0.5, 0.25, 0 s and all ten spawns came up on
-- their spots, seven of them with no wait (catcc-handoff/DECISIONS.md). Each says in the chat how long its spot stood
-- empty and what of that was the wait, the check and DCS. Config/CATCC-slots.lua: `settle = <s>` another wait;
-- `settleRefresh = false` leaves updobs out. Either way DCS's own reading of the spot (native check: obstructed, usable)
-- is logged the moment the static is seen gone and again after updobs: what updobs changes, if anything.
-- Not held (as before: the static goes when the slot is taken): without the GUI state; a remote player's slot (his FLY
-- is on his own machine); a slot whose spot has no static of the demo's standing on it.
local GUI_FLYWRAP = [==[
local L = package.loaded
local F = CATCC_FLY
if not F then
  F = { till = 0, orig = {}, nets = {} }
  F.now = function() return (DCS and DCS.getRealTime and DCS.getRealTime()) or os.clock() end
  CATCC_FLY = F
end
local N = L['net'] or net
local function mySlot()
  local ok, _, slot = pcall(function() return N.get_slot(N.get_my_player_id()) end)
  return ok and slot ~= nil and tostring(slot) or ''
end
-- (asked for while the lease is on for the player's own slot: noted, not done)
function F.held(how)
  if F.pass or not F.slot or F.till <= F.now() or mySlot() ~= F.slot then return false end
  if not F.asked then F.asked = { how = how } end
  return true
end
for _, t in ipairs({ L['net'], net }) do
  if type(t) == 'table' and not F.nets[t] and type(t.spawn_player) == 'function' then
    local o = t.spawn_player
    F.nets[t] = o
    F.orig.spawn = F.orig.spawn or o
    t.spawn_player = function(...)
      if F.held('net') then return end
      return o(...)
    end
  end
end
local b = L['BriefingDialog']
if type(b) == 'table' and F.orig.flyRef ~= b and type(b.Fly_onChange) == 'function' then
  local o = b.Fly_onChange
  F.orig.fly, F.orig.flyRef = o, b
  F.flyWrap = function(...)
    if F.held('fly') then return end
    return o(...)
  end
  b.Fly_onChange = F.flyWrap
end
F.rebind = function()
  local d = F.orig.flyRef
  if d and F.flyWrap then pcall(function() if d.buttonFly and d.buttonFly.onChange == F.orig.fly then d.buttonFly.onChange = F.flyWrap end end) end
end
F.rebind()
return 'net.spawn_player: ' .. (F.orig.spawn and 'wrapped' or 'not there') .. '; BriefingDialog.Fly_onChange: '
  .. (b ~= nil and F.orig.flyRef == b and 'wrapped' or (type(b) == 'table' and 'not there' or 'not loaded yet'))
]==]
-- (SLOT, LEASE put in front: the lease renewed; "asked|fly" / "asked|net": DCS's FLY was asked for; "held": not yet)
local GUI_FLYPOLL = [==[
local F = CATCC_FLY
if not (F and F.held) then return 'none' end
F.slot, F.till = SLOT, LEASE > 0 and F.now() + LEASE or 0
if F.rebind then F.rebind() end
return F.asked and ('asked|' .. F.asked.how) or 'held'
]==]
-- (DCS's own FLY at last: the one that was asked for, let through)
local GUI_FLYGO = [==[
local F = CATCC_FLY
if not F then return 'no wrap' end
local how = F.asked and F.asked.how or 'net'
F.asked, F.slot, F.till, F.pass = nil, nil, 0, true
local fn = how == 'fly' and F.orig.fly or F.orig.spawn
local ok, e = false, 'nothing to call for ' .. how
if fn then ok, e = pcall(fn) end
F.pass = false
return ok and ('done (' .. how .. ')') or ('failed: ' .. tostring(e))
]==]
local GUI_FLYDROP = 'if CATCC_FLY then CATCC_FLY.slot, CATCC_FLY.till, CATCC_FLY.asked = nil, 0, nil end return "ok"'
local GUI_FLYUNASK = 'if CATCC_FLY then CATCC_FLY.asked = nil end return "ok"'

function S.flyReady() return S.flyWrap == true and mp() and server() end

-- (from S.guiTick, every 2 s until both are wrapped: DCS loads its briefing's module when it first needs it)
function S.flyWrapTry(t)
  if S.flyWrapAll or t < (S.flyWrapAt or 0) then return end
  S.flyWrapAt = t + 2
  local r, err = gui(GUI_FLYWRAP)
  local text = tostring(r or ('net.dostring_in failed: ' .. tostring(err)))
  if text ~= S.flySaid then
    S.flySaid = text
    log('FLY, in the GUI state: ' .. text)
  end
  local net1, fly1 = text:find('spawn_player: wrapped', 1, true) ~= nil, text:find('Fly_onChange: wrapped', 1, true) ~= nil
  S.flyWrap, S.flyWrapAll = net1 or fly1, net1 and fly1
end

-- the wait for this Spawn: seconds, and where it is set
local function settleNow()
  local fixed = tonumber(S.cfg.settle)
  if fixed then return math.max(0, fixed), 'Config/CATCC-slots.lua' end
  return FLY.settle, 'FLY.settle'
end
-- DCS's own reading of a spot now (native check), for the log: "obstructed X, usable Y (why)"
local function dcsReading(sl)
  if not (aimNative() and aimMod.check) then return 'not asked (no native module)' end
  local ship = shipObj(sl.carrier)
  local num = ship and dcsNumber(ship, tonumber(sl.spot))
  if not num then return 'not asked (the carrier or its spots not found)' end
  local ok, c, err = pcall(aimMod.check, ship, num)
  if not (ok and type(c) == 'table') then return 'not read (' .. tostring(ok and err or c) .. ')' end
  return string.format('obstructed %s, wide %s, object %s, usable %s%s', tostring(c.obstructed), tostring(c.obstructedWide), tostring(c.object), tostring(c.usable),
    (c.why and c.why ~= '') and (' (' .. c.why .. ')') or '')
end

-- WHAT STANDS ON A PLACE OF THE FLIGHT DECK (asked of the mission's state): the name of a static object within r m of
-- it (the demo's own too, not its lookalikes: "<key>-look <n>"), at the flight deck's height (an aircraft in the hangar below
-- is not on it); "" nothing; nil: the mission could not be asked
function S.staticOn(carrier, sp, r)
  if not (sp and carrier) then return nil end
  local code = string.format([[
    local s = Unit.getByName(%q)
    if not s then return 'ERR' end
    local p, X, Z, R = s:getPosition(), %.3f, %.3f, %.2f
    for _, side in pairs(coalition.side) do
      for _, o in ipairs(coalition.getStaticObjects(side) or {}) do
        -- (not the lookalike; nor the tie-down chains, crewtest_tiedowns.lua: the user, 2026-11-25, "I don't want chains to
        -- block spawning. I want players to spawn into aircraft that are chocked and chained")
        -- (nor a flag on a glareshield, crewtest_flag.lua: it stands 4.4 m forward of its aircraft, on the spot)
        if o:isExist() and not tostring(o:getName()):find('%%-look %%d+$') and not tostring(o:getName()):find('^catcc%%-tiedown%%-')
          and not tostring(o:getName()):find('^catcc%%-flag%%-') then
          local q = o:getPoint()
          local dx, dy, dz = q.x - p.p.x, q.y - p.p.y, q.z - p.p.z
          local up = dx * p.y.x + dy * p.y.y + dz * p.y.z
          local fx = dx * p.x.x + dy * p.x.y + dz * p.x.z
          local fz = dx * p.z.x + dy * p.z.y + dz * p.z.z
          if up > 15 and up < 30 and math.sqrt((fx - X) ^ 2 + (fz - Z) ^ 2) < R then return 'ON|' .. tostring(o:getName()) end
        end
      end
    end
    return 'NONE'
  ]], tostring(carrier), sp.x, sp.z, r)
  local ok, res = pcall(function() return net.dostring_in('server', code) end)
  if not ok or type(res) ~= 'string' then return nil end
  if res == 'NONE' then return '' end
  return res:match('^ON|(.*)$')
end

-- ---------------------------------------------------------------- the lookalike
-- A SLOT TAKEN: its static goes and its lookalike stands in its place (crewtest_demo.lua M.man, LOOK) until an
-- aircraft stands on the spot; then it is taken away (S.lookTick: demo2|unlook). Left: the static again, the lookalike
-- taken away with it (M.unman). S.looks[spot] = { carrier, since }: the spots watched.
function S.man(sl)
  S.looks = S.looks or {}
  S.looks[tonumber(sl.spot)] = { carrier = sl.carrier, name = sl.name, since = S.lastT or 0 }
  api.run('demo2|man|' .. sl.spot)
end
function S.unman(spot)
  if S.looks then S.looks[tonumber(spot)] = nil end
  api.run('demo2|unman|' .. spot)
end
-- WHAT AIRCRAFT STANDS ON A PLACE OF THE FLIGHT DECK: the name of a live aircraft (a player's too, the host's too)
-- within r m of it at the flight deck's height; "" none; nil: the mission could not be asked
function S.jetOn(carrier, sp, r)
  if not (sp and carrier) then return nil end
  local code = string.format([[
    local s = Unit.getByName(%q)
    if not s then return 'ERR' end
    local p, X, Z, R = s:getPosition(), %.3f, %.3f, %.2f
    for _, side in pairs(coalition.side) do
      for _, cat in ipairs({ Group.Category.AIRPLANE, Group.Category.HELICOPTER }) do
        for _, g in ipairs(coalition.getGroups(side, cat) or {}) do
          for _, u in ipairs(g:getUnits() or {}) do
            if u:isExist() then
              local q = u:getPoint()
              local dx, dy, dz = q.x - p.p.x, q.y - p.p.y, q.z - p.p.z
              local up = dx * p.y.x + dy * p.y.y + dz * p.y.z
              local fx = dx * p.x.x + dy * p.x.y + dz * p.x.z
              local fz = dx * p.z.x + dy * p.z.y + dz * p.z.z
              if up > 15 and up < 30 and math.sqrt((fx - X) ^ 2 + (fz - Z) ^ 2) < R then return 'ON|' .. tostring(u:getPlayerName() or u:getName()) end
            end
          end
        end
      end
    end
    return 'NONE'
  ]], tostring(carrier), sp.x, sp.z, r)
  local ok, res = pcall(function() return net.dostring_in('server', code) end)
  if not ok or type(res) ~= 'string' then return nil end
  if res == 'NONE' then return '' end
  return res:match('^ON|(.*)$')
end
-- (every frame, on the server: ten times a second while a lookalike stands) an aircraft on its spot: taken away
function S.lookTick(t)
  if not (S.looks and next(S.looks)) or t < (S.lookAt or 0) then return end
  S.lookAt = t + 0.1
  for spot, w in pairs(S.looks) do
    local on = S.jetOn(w.carrier, S.spotPos[spot], FLY.near)
    if on and on ~= '' then
      S.looks[spot] = nil
      api.run('demo2|unlook|' .. spot)
      log(string.format('lookalike: %s (spot %d): %s is on the spot: its lookalike taken away (it stood %.1f s)', tostring(w.name), spot, on, t - (w.since or t)))
    end
  end
end

-- the ATC's own pass over what stands on its spots: 'yes', or 'no (why)'
function S.flyRefresh(sl)
  if not aimNative() then return 'no (the native module is not there)' end
  if not aimMod.updobs then return 'no (an older native module, without updobs)' end
  local ship, why = shipObj(sl.carrier)
  if not ship then return 'no (the carrier: ' .. tostring(why) .. ')' end
  local ok, r, err = pcall(aimMod.updobs, ship)
  if ok and r then return 'yes' end
  return 'no (' .. tostring(ok and err or r) .. ')'
end

function S.flyPoll(f)
  return gui(string.format('local SLOT, LEASE = %q, %s\n', f.id, tostring(FLY.lease)) .. GUI_FLYPOLL)
end

-- the player's slot sl held until his FLY (from: who asked)
function S.flyArm(sl, t, from)
  S.fly = { id = tostring(sl.id), sl = sl, state = 'held', armT = t }
  log(string.format('FLY: %s (%s, spot %s): its static stays until DCS\'s FLY (%s)', sl.name, tostring(sl.id), tostring(sl.spot), from))
  S.flyPoll(S.fly)
end

-- not held any more: the static back if it went for a FLY that was not made
function S.flyDrop(why)
  local f = S.fly
  S.fly = nil
  if not f then return nil end
  if f.firstCase then
    firstWrite(string.format('case %d at=%ds stopped (%s before the aircraft was seen)', f.firstCase, FIRST.cases[f.firstCase] or -1, why))
    f.firstCase = nil
  end
  if f.manned and (f.state == 'removing' or f.state == 'settling' or f.state == 'checking') then S.unman(f.sl.spot) end
  gui(GUI_FLYDROP)
  log(string.format('FLY: %s: no longer held (%s; it was %s)', f.sl.name, why, f.state))
  return nil
end

-- a FLY that cannot be made now: the static back; held again, so that the next FLY tries again
function S.flyRefuse(f, why)
  if f.manned then S.unman(f.sl.spot) end
  f.manned, f.state, f.pre, f.nextT, f.saidWait = false, 'held', nil, nil, nil
  gui(GUI_FLYUNASK)
  log(f.sl.name .. ': FLY refused: ' .. why)
  api.say(f.sl.name .. ': ' .. why .. '. Its aircraft stays on the spot: FLY again to try again, or choose another.')
end

-- ---------------------------------------------------------------- the first-spawn test
-- HOW EARLY CAN A MISSION'S FIRST SPAWN BE? (the user, 2026-11-24: "Let's try lower first spawn timings to see where
-- the same limit is"). AIM.notBefore (60 s) stands on five first aimed spawns of 2026-11-22: two froze DCS, made 16 and
-- 23 s after the mission loaded; three, at 23 (taken at 29), 29 and 35 s, did not; no spawn after the first ever froze.
-- The test (FIRST.on): each mission start runs the next case of FIRST.cases: the mission's first held FLY waits until
-- that much mission time (the player presses FLY as soon as he can; a FLY after it goes at once), and its line is
-- written to FIRST.file (and the file closed) just before DCS's FLY: "case n started"; then "landed" / "elsewhere" /
-- "none" when the aircraft is seen, "stopped" if the mission ends between. A start that finds "started" as the last line
-- writes "case n froze": DCS hung on it (or was ended by hand in those seconds: the file cannot tell). After a freeze
-- the series stops: delete the file to start over. Later spawns of a mission wait for nothing (the freeze needs the
-- first). The series done, AIM.notBefore again.
-- (S.start, each mission: which case this start runs; S.first = { n, at } or nil)
function S.firstStart()
  S.first = nil
  if not (FIRST.on or S.firstOn) then return end
  local f = io.open(firstPath(), 'r')
  local status, last = {}, nil
  if f then
    for line in f:lines() do
      local n, what = line:match('case (%d+) %S+ (%a+)')
      if n then
        status[tonumber(n)], last = what, { n = tonumber(n), what = what }
      end
    end
    f:close()
  end
  if last and last.what == 'started' then
    firstWrite(string.format('case %d at=%ds froze', last.n, FIRST.cases[last.n] or -1))
    status[last.n] = 'froze'
  end
  for n = 1, #FIRST.cases do
    if status[n] == 'froze' then
      return log(string.format('first-spawn test: case %d froze: the series stops here (delete %s to start over); the first spawn waits %d s', n, FIRST.file, AIM.notBefore))
    end
    if status[n] == nil or status[n] == 'stopped' then
      S.first = { n = n, at = FIRST.cases[n] }
      return log(string.format('first-spawn test: THIS MISSION START RUNS CASE %d of %d: its first spawn goes at %d s of mission time', n, #FIRST.cases, S.first.at))
    end
  end
  log('first-spawn test: every case has been run; the first spawn waits ' .. AIM.notBefore .. ' s')
end
-- the mission time a held FLY waits for now
function S.notBefore()
  -- (the case asked for at the mission's first held FLY: by then DCS says whether this is a server)
  if not S.firstAsked then
    S.firstAsked = true
    local ok, err = pcall(S.firstStart)
    if not ok then log('first-spawn test: ' .. tostring(err)) end
  end
  if S.first then return S.first.at end
  if (FIRST.on or S.firstOn) and S.firstDone then return 0 end
  return AIM.notBefore
end

-- (from aimTick: what came of a held FLY) how: 'landed' on its spot, 'elsewhere', 'none' in time
function S.flyResult(f, how, t)
  if not f or f.state ~= 'spawning' then return end
  f.state = 'done'
  if f.firstCase then
    firstWrite(string.format('case %d at=%ds %s (DCS %.1f s)', f.firstCase, FIRST.cases[f.firstCase] or -1, how, t - (f.goT or t)))
    f.firstCase = nil
  end
  local used = f.settle or 0
  local empty = t - (f.goneT or f.manT or t)
  local parts = string.format('the wait %.2f s, the check and aim %.2f s, DCS %.1f s (its longest frame %.1f s)', used, (f.goT or t) - (f.at or f.goT or t),
    t - (f.goT or t), f.gap or 0)
  log(string.format('FLY: %s: %s; its spot stood empty %.2f s: %s; the ATC refreshed: %s', f.sl.name,
    how == 'landed' and 'ON ITS SPOT' or how == 'elsewhere' and 'CAME UP ON ANOTHER SPOT' or 'NO AIRCRAFT IN TIME', empty, parts, tostring(f.refresh)))
  -- (on the screen only when it did not come up on its spot: the gap is measured, the user, 2026-11-24: "remove any
  -- debugging messages that are for systems we've already settled")
  if how ~= 'landed' then api.say(string.format('%s %s. Its spot stood empty %.1f s (%s). updobs: %s.', f.sl.name,
    how == 'landed' and 'is on its spot' or how == 'elsewhere' and 'came up on ANOTHER spot' or 'did not appear in time', empty, parts,
    tostring(f.refresh):match('^yes') and 'on' or 'off')) end
end

-- every frame, on the host
function S.flyTick(t)
  local f = S.fly
  if f and f.state == 'spawning' then
    f.gap = math.max(f.gap or 0, t - (f.lastT or t))
    f.lastT = t
  end
  if not S.flyReady() then
    if f then S.flyDrop('the GUI state is not reached') end
    return
  end
  local mine = S.mySlot()
  if mine ~= S.flyLast then
    S.flyLast = mine
    if f and f.seen and mine ~= f.id then f = S.flyDrop('the player left the slot') end
    -- (a slot taken through DCS's own slot list, on a spot whose static stands: held too)
    if not f and mine and S.bySlot[mine] then
      local sl = S.bySlot[mine]
      local a = S.ship == sl.carrier and S.map[sl.spot]
      if a and a.state == 'parked' then
        S.flyArm(sl, t, 'a slot taken')
        f = S.fly
      end
    end
  end
  if not f then return end
  if mine == f.id then f.seen = true end
  if not f.seen then
    if t - f.armT > FLY.arm then S.flyDrop('the slot did not become his in ' .. FLY.arm .. ' s') end
    return
  end
  local sl = f.sl
  -- (the lease renewed while DCS's FLY is held: ten times a second, which is also how soon a FLY is seen)
  if f.state == 'held' or f.state == 'asked' or f.state == 'removing' or f.state == 'settling' or f.state == 'checking' then
    if t >= (f.pollT or 0) then
      f.pollT = t + 0.1
      local r = S.flyPoll(f)
      local how = tostring(r or ''):match('^asked|(%a+)$')
      if f.state == 'held' and how then
        f.how, f.askT, f.state = how, t, 'asked'
        log(string.format('FLY: %s: DCS\'s FLY asked for (%s)', sl.name, how == 'fly' and 'the briefing\'s FLY' or 'net.spawn_player'))
      end
    end
  end
  if f.state == 'asked' then
    -- (NOT IN A MISSION'S FIRST MINUTE (AIM.notBefore): with its static still on the spot, nothing is lost by waiting)
    local age = try(function() return DCS.getModelTime() end)
    local nb = S.notBefore()
    if aimNative() and type(age) == 'number' and age < nb then
      if not f.saidWait then
        f.saidWait = true
        log(string.format('FLY: %s: the mission is %.1f s old: held until %d s', sl.name, age, nb))
        api.say(string.format('%s: you go in %.0f s.%s', sl.name, nb - age,
          S.first and string.format(' (First-spawn test, case %d of %d: at %d s. THIS SPAWN MAY FREEZE DCS.)', S.first.n, #FIRST.cases, S.first.at) or ''))
      end
      return
    end
    local a = S.ship == sl.carrier and S.map[sl.spot]
    f.state, f.manT = 'removing', t
    if a and a.state == 'parked' then
      f.manned = true
      S.man(sl)
    end
    log(string.format('FLY: %s: its static %s', sl.name, f.manned and 'taken away' or 'not there (nothing to take away)'))
  end
  if f.state == 'removing' then
    local on = S.staticOn(sl.carrier, S.spotPos[tonumber(sl.spot)], FLY.near)
    if on and on ~= '' then
      if t - f.manT > FLY.gone then return S.flyRefuse(f, string.format('its static (%s) did not go in %d s', on, FLY.gone)) end
      return
    end
    f.goneT = t
    f.settle, f.which = settleNow()
    -- (what DCS itself says of the spot before and after its own pass: whether updobs changes it)
    local before = dcsReading(sl)
    S.flyN = (S.flyN or 0) + 1
    local want = FLY.refresh == true or (FLY.refresh == 'alternate' and S.flyN % 2 == 1)
    f.refresh = S.cfg.settleRefresh == false and 'no (switched off)' or want and S.flyRefresh(sl)
      or ('no (' .. (FLY.refresh == 'alternate' and 'the test: held FLY ' .. S.flyN .. ' of this mission, an even one' or 'switched off') .. ')')
    local after = f.refresh == 'yes' and dcsReading(sl) or 'no pass made'
    log(string.format('FLY: %s: DCS reads the spot as the static goes: %s; after updobs: %s', sl.name, before, after))
    f.at, f.state = t + f.settle, 'settling'
    log(string.format('FLY: %s: the spot %s %.2f s after its static was taken away; the ATC refreshed: %s; the wait %.2f s (%s)', sl.name,
      on == '' and 'clear' or 'not asked (the mission could not be asked: taken as clear)', t - f.manT, f.refresh, f.settle, f.which))
  end
  if f.state == 'settling' then
    if t < f.at then return end
    f.state, f.pre = 'checking', { checkFrom = t, goneAt = f.goneT }
  end
  if f.state == 'checking' then
    if t < (f.nextT or 0) then return end
    f.nextT = t + FLY.ask
    local okR, wait, refuse = pcall(S.aimReady, sl, t, f.pre)
    if not okR then
      log('aim: ' .. tostring(wait))
      wait, refuse = nil, nil
    end
    if wait then return end
    if refuse then return S.flyRefuse(f, refuse) end
    local okA, errA = pcall(S.aim, sl, t)
    if not okA then log('aim: ' .. tostring(errA)) end
    if S.aimed then S.aimed.fly = f end
    -- (the first-spawn test: this mission's first held FLY; its line written and closed before DCS's FLY)
    if S.first then
      f.firstCase = S.first.n
      local age = try(function() return DCS.getModelTime() end)
      local rt = try(function() return DCS.getRealTime() end)
      firstWrite(string.format('case %d at=%ds started (mission time %.1f s, %.1f s of real time since the mission started; %s, spot %s)', S.first.n, S.first.at,
        tonumber(age) or -1, (tonumber(rt) and S.startRT) and (rt - S.startRT) or -1, sl.name, tostring(sl.spot)))
      S.first, S.firstDone = nil, true
    end
    local r, err = gui(GUI_FLYGO)
    if not tostring(r):find('^done') then
      if f.firstCase then
        firstWrite(string.format('case %d at=%ds stopped (DCS\'s FLY could not be made)', f.firstCase, FIRST.cases[f.firstCase] or -1))
        f.firstCase = nil
      end
      S.unaim('DCS\'s FLY could not be made')
      return S.flyRefuse(f, 'DCS\'s FLY could not be made (' .. tostring(r or err) .. ')')
    end
    f.goT, f.state, f.gap, f.lastT = t, 'spawning', 0, t
    log(string.format('FLY: %s: DCS\'s FLY made (%s), %.2f s after the static was seen gone', sl.name, tostring(r), t - f.goneT))
    -- (no aim, nothing to tell where the aircraft came: done here)
    if not S.aimed then
      f.state = 'done'
      if f.firstCase then
        firstWrite(string.format('case %d at=%ds landed (not watched: no aim)', f.firstCase, FIRST.cases[f.firstCase] or -1))
        f.firstCase = nil
      end
    end
  end
end

-- (the picker's Spawn came to nothing: the static back, a reservation made for it given up)
local function spawnUndo(w)
  if S.fly and S.fly.id == tostring(w.id) then S.flyDrop('the slot was not taken') end
  S.unaim('the slot was not taken')
  if S.mySlot() == tostring(w.id) then return end
  S.unman(w.spot)
  if not w.held then S.hold[tostring(w.id)] = nil end
end

-- (from S.tick: the slot of the picker's Spawn is the player's now: DCS's briefing; not his in 10 s: the picker again)
local function spawnTick(t)
  local okTick, errTick = pcall(aimTick, t)
  if not okTick then log('aim: ' .. tostring(errTick)) end
  local pre = S.spawnPre
  if pre and t >= pre.at then
    local sl = pre.slot
    local w = { id = tostring(sl.id), name = sl.name, spot = sl.spot, held = pre.held, untilT = t + 10 }
    -- (NOT IN A MISSION'S FIRST MINUTE: DCS froze twice at an aimed spawn made 16 and 23 s after the mission loaded,
    -- never at one made from 29 s on (2026-11-22). NOT ONTO A SPOT DCS FINDS OCCUPIED: it would put the aircraft on
    -- another, whatever stands there: asked for up to AIM.clearFor s after the static went, then the Spawn is refused)
    -- (DCS's FLY held: the check and the aim at the FLY, S.flyTick)
    local okReady, wait, refuse = true, nil, nil
    if not pre.fly then okReady, wait, refuse = pcall(S.aimReady, sl, t, pre) end
    if not okReady then
      log('aim: ' .. tostring(wait))
      wait, refuse = nil, nil
    end
    if wait then
      pre.at = t + 1
      return
    end
    S.spawnPre = nil
    if refuse then
      spawnUndo(w)
      log(sl.name .. ': Spawn refused: ' .. refuse)
      api.say(sl.name .. ': ' .. refuse)
      return S.showPicker()
    end
    -- (its spot made the one DCS gives next; put back by aimTick once the aircraft stands there)
    if not pre.fly then
      local okAim, errAim = pcall(S.aim, sl, t)
      if not okAim then log('aim: ' .. tostring(errAim)) end
    end
    local ok, err = pcall(function() net.set_slot(sl.side, sl.id) end)
    if not ok then
      spawnUndo(w)
      api.say('The slot could not be taken: ' .. tostring(err))
      return S.showPicker()
    end
    S.spawnWait = w
  end
  local w = S.spawnWait
  if not w then return end
  if S.mySlot() == w.id then
    S.spawnWait = nil
    S.quietUntil = t + 3
    if S.guiDone then log(w.name .. ' taken: ' .. tostring(gui(GUI_BRIEFING))) end
  elseif t > w.untilT then
    S.spawnWait = nil
    spawnUndo(w)
    log(w.name .. ': the slot was not taken in 10 s')
    api.say(w.name .. ': the slot was not taken.')
    S.showPicker()
  end
end

-- ---------------------------------------------------------------- the view behind the picker
-- (VIEW, at the top: what is asked for and the numbers.) HOW, and what of it is known:
--   The camera read and put: Export.LoGetCameraPosition / Export.LoSetCameraPosition (Scripts\Export.lua: the camera's
--   axes x forward, y up, z to the right, and its point p, in the world; both are in the hooks' Export table by DCS's
--   own API\Sim_ControlAPI.md). READING works here (the deck tool's lock, the director camera: seen in DCS). PUTTING
--   is NOT YET SEEN IN DCS (the panel's "Saved view" uses it and was never pressed in a run).
--   Off the map: Export.LoSetCommand(13) (iCommandViewNavy: the F9 key's command). LoSetCommand works here (view
--   command 2007 turns the cockpit camera: seen in DCS); that a SPECTATOR's view answers 13, and which ship F9 goes
--   to, is NOT YET SEEN: so the camera is checked. Every frame it is read before it is put again: where it is
--   against where it was put the frame before. VIEW.settle frames after the command: within VIEW.tol metres and
--   VIEW.tolDeg degrees, the view holds; not, the next command of VIEW.cmds is sent (16: F11's free camera, which has
--   no object of its own to follow) and checked the same way; none holds: said once, and the camera left alone for
--   the rest of the mission. Every step is in the log ("slots: view: ..."), with what DCS answered.
--   What cannot be told from here: whether the screen DRAWS that camera (DCS's map can stay up while the camera
--   reads as put): the log then says "holds" and the screen shows the map.
--   The ship: the mission script's CATCC_CR.ctx by the ship's name (api.shipCtx: its axes and its place, this frame);
--   only its heading is used (the camera stands level, the horizon level, while the ship rolls).
--   The picture: S.view.frame, from the screen's size (dxgui.GetScreenSize), the field of view (DCS.getCurrentFOV,
--   read every frame: a zoom moves the camera, not the picture) and where the window's lower edge is now (dragged:
--   the ship follows).
S.view = {}
do
  local V = S.view
  local function vlog(text) log('view: ' .. text) end

  -- the screen's size, or nil
  function V.screen()
    if V.gui == nil then
      local ok, g = pcall(require, 'dxgui')
      V.gui = (ok and type(g) == 'table' and g.GetScreenSize) and g or false
    end
    if not V.gui then return nil end
    local ok, sw, sh = pcall(V.gui.GetScreenSize)
    if ok and tonumber(sw) and tonumber(sh) and sw > 0 and sh > 0 then return sw, sh end
    return nil
  end

  -- the field of view now (degrees), and whether DCS gave it
  function V.fov()
    local f = try(function() return DCS.getCurrentFOV() end)
    if type(f) == 'number' and f >= 10 and f <= 140 then return f, true end
    return VIEW.fov, false
  end

  -- a point of the ship's frame { forward, up, to starboard } on the screen of the camera q (V.frame's): x, y in
  -- pixels from the top left, and how far in front of the camera it is
  function V.project(q, pt)
    local d = { pt[1] - q.p[1], pt[2] - q.p[2], pt[3] - q.p[3] }
    local function dot(a) return d[1] * a[1] + d[2] * a[2] + d[3] * a[3] end
    local zc = dot(q.x)
    return q.sw / 2 + dot(q.z) / (zc * q.tanH) * q.sw / 2, q.sh / 2 - dot(q.y) / (zc * q.tanV) * q.sh / 2, zc
  end

  -- the hull's box: its eight corners (the waterline and the flight deck, both sides, both ends)
  function V.corners()
    local out = {}
    for _, f in ipairs({ VIEW.aft, VIEW.bow }) do
      for _, u in ipairs({ 0, VIEW.deck }) do
        for _, s in ipairs({ -VIEW.beam, VIEW.beam }) do out[#out + 1] = { f, u, s } end
      end
    end
    return out
  end

  -- THE CAMERA for a screen sw x sh whose top `bottom` pixels are the picker's (its window's lower edge), with the
  -- field of view fovDeg: in the ship's own frame (levelled): its point p and its axes x (where it looks), y (up),
  -- z (right), each { forward, up, to starboard }; and what it gives: depth (metres from the camera to the ship's
  -- middle along its line of sight's own axis), range, pitch (degrees it looks down), top (where the free part of the
  -- screen begins), x0, x1, y0, y1 (the hull's box on the screen, pixels).
  -- The ship's centreline lies along the screen's width (the bow to the right from starboard), so both ends are as far
  -- in front of the camera as its middle: its length spans VIEW.fill of the width at depth = length / (2 fill tanH).
  -- The camera looks down less than VIEW.elev by the angle that puts the ship's middle below the screen's centre.
  function V.frame(sw, sh, bottom, fovDeg)
    local th = math.tan(math.rad(fovDeg) / 2)
    local tanH, tanV = th, th * sh / sw
    if VIEW.fovAxis == 'v' then tanH, tanV = th * sw / sh, th end
    local top = math.max(0, math.min(sh, bottom or 0))
    if sh - top < VIEW.minFree * sh then top = 0 end
    local free = sh - top
    local e = math.rad(VIEW.elev)
    local length = VIEW.bow - VIEW.aft
    -- (how tall the hull's box stands across the line of sight: its width seen from above, its height from the side)
    local tall = 2 * VIEW.beam * math.sin(e) + VIEW.deck * math.cos(e)
    local depth = math.max(length / (2 * VIEW.fill * tanH), tall * sh / (2 * tanV * VIEW.fillV * free))
    local mid = { (VIEW.aft + VIEW.bow) / 2, VIEW.deck / 2, 0 }
    local q
    local row = (top + sh) / 2 -- (the screen's row the ship's middle is put on: moved until the hull's box is centred)
    for _ = 1, 4 do
      local beta = math.atan((row - sh / 2) / (sh / 2) * tanV)
      local pitch = e - beta
      local range = depth / math.cos(beta)
      local sp, cp = math.sin(pitch), math.cos(pitch)
      q = { sw = sw, sh = sh, tanH = tanH, tanV = tanV, fov = fovDeg, top = top, depth = depth, range = range, pitch = math.deg(pitch),
        p = { mid[1], mid[2] + range * math.sin(e), mid[3] + VIEW.side * range * math.cos(e) },
        x = { 0, -sp, -VIEW.side * cp }, y = { 0, cp, -VIEW.side * sp }, z = { VIEW.side, 0, 0 } }
      q.x0, q.x1, q.y0, q.y1 = 1e9, -1e9, 1e9, -1e9
      for _, c in ipairs(V.corners()) do
        local px, py = V.project(q, c)
        q.x0, q.x1, q.y0, q.y1 = math.min(q.x0, px), math.max(q.x1, px), math.min(q.y0, py), math.max(q.y1, py)
      end
      local off = (top + sh) / 2 - (q.y0 + q.y1) / 2
      if math.abs(off) < 0.5 then break end
      row = row + off
    end
    return q
  end

  -- that camera in the world, for a ship whose axes and place are s (api.shipCtx's: 1..3 forward, 10..12 its place):
  -- level (the ship's heading only), as LoSetCameraPosition takes it
  function V.world(q, s)
    local m = math.sqrt(s[1] * s[1] + s[3] * s[3])
    if m < 1e-6 then return nil end
    local fx, fz = s[1] / m, s[3] / m
    -- (forward, up, to starboard in the world: starboard = forward x up)
    local function w(a) return { x = a[1] * fx - a[3] * fz, y = a[2], z = a[1] * fz + a[3] * fx } end
    local p = w(q.p)
    return { x = w(q.x), y = w(q.y), z = w(q.z), p = { x = s[10] + p.x, y = s[11] + p.y, z = s[12] + p.z } }
  end

  -- in an aircraft: a slot of his own (multiplayer), or a unit of his own
  function V.inAircraft()
    if mp() and S.mySlot() then return true end
    local u = try(function() return DCS.getPlayerUnit() end)
    return u ~= nil and u ~= '' and u ~= 0
  end

  -- is the view to be held now; if not, why
  function V.want()
    if not VIEW.on then return false, 'switched off (VIEW.on)' end
    if V.dead then return false, 'given up for this mission' end
    if V.inAircraft() then return false, 'the player is in his aircraft' end
    -- (between the picker's Spawn and the slot taken the picker is put away: the view stays)
    if not (P.shown or S.spawnPre or S.spawnWait) then return false, S.vanilla and 'DCS\'s own slot list' or 'the picker is put away' end
    if not (S.carriers[S.carrierIx] or S.ship) then return false, 'no carrier' end
    return true
  end

  local function command(n, what)
    local ok, err
    if Export and Export.LoSetCommand then
      ok, err = pcall(Export.LoSetCommand, n)
    else
      ok, err = false, 'no Export.LoSetCommand here'
    end
    vlog(string.format('view command %d (%s) sent: %s', n, what, ok and 'no error' or ('ERROR: ' .. tostring(err))))
    return ok
  end
  local CMD_NAME = { [7] = 'F1, the cockpit', [8] = 'F2, the aircraft view', [13] = 'F9, the ship view', [15] = 'F10, the map', [16] = 'F11, the free camera' }
  local function readCam()
    local cp = try(function() return Export.LoGetCameraPosition() end)
    if type(cp) == 'table' and cp.p and cp.x and tonumber(cp.p.x) and tonumber(cp.x.x) then return cp end
    return nil
  end
  local function camText(cp)
    if not cp then return 'could not be read' end
    return string.format('at %.0f / %.0f / %.0f, looking %.2f / %.2f / %.2f%s', cp.p.x, cp.p.y, cp.p.z, cp.x.x, cp.x.y, cp.x.z,
      cp.x.y < -0.98 and ' (straight down: the map\'s)' or '')
  end

  function V.take(ship)
    local have = {}
    for _, n in ipairs({ 'LoGetCameraPosition', 'LoSetCameraPosition', 'LoSetCommand', 'LoForceCamera', 'LoCreateCameraRequest' }) do
      have[#have + 1] = n .. ' ' .. ((Export and type(Export[n]) == 'function') and 'yes' or 'NO')
    end
    local sw, sh = V.screen()
    local fov, given = V.fov()
    vlog(string.format('taking the view to %s. Export: %s. The screen %s x %s; DCS.getCurrentFOV %s; the camera now %s', tostring(ship), table.concat(have, ', '),
      tostring(sw), tostring(sh), given and string.format('%.1f', fov) or ('gives nothing: ' .. VIEW.fov .. ' taken'), camText(readCam())))
    if not (Export and Export.LoSetCameraPosition and Export.LoGetCameraPosition) then
      V.dead = true
      vlog('the camera cannot be put from here (no LoSetCameraPosition / LoGetCameraPosition): the view is left alone')
      return false
    end
    if not sw then
      V.dead = true
      vlog('the screen\'s size cannot be read (dxgui.GetScreenSize): the view is left alone')
      return false
    end
    V.held, V.ok, V.ci, V.n, V.last, V.ship, V.key, V.noShip, V.lost = true, nil, 1, 0, nil, ship, nil, nil, 0
    V.wait = 0
    if VIEW.setFov then
      local okf, errf = pcall(function() DCS.setCurrentFOV(VIEW.setFov) end)
      vlog(string.format('field of view set to %s: %s', tostring(VIEW.setFov), okf and 'no error' or ('ERROR: ' .. tostring(errf))))
    end
    -- (the first command is sent once the mission runs: V.tick)
    V.cmdDue, V.mt, V.pausedSaid = VIEW.cmds[1] ~= nil, nil, nil
    return true
  end

  function V.release(why, quiet)
    if not V.held then return end
    V.held, V.last = false, nil
    vlog(string.format('given up (%s) after %d frames; the camera %s', tostring(why), V.frames or 0, camText(readCam())))
    V.frames = 0
    if VIEW.after and not quiet and not V.inAircraft() then command(VIEW.after, CMD_NAME[VIEW.after] or '?') end
  end

  function V.tick()
    local want, why = V.want()
    if not want then return V.release(why) end
    local ship = S.carriers[S.carrierIx] or S.ship
    if not V.held and not V.take(ship) then return end
    if ship ~= V.ship then
      vlog('the picker shows ' .. tostring(ship) .. ' now: the camera goes there')
      V.ship, V.last, V.noShip, V.key = ship, nil, nil, nil
    end
    local c, err = try(api.shipCtx, ship)
    if not (type(c) == 'table' and c.s) then
      if not V.noShip then
        V.noShip = true
        vlog(string.format('where %s is could not be asked (%s): the camera is left where it is', tostring(ship), tostring(err)))
      end
      V.last = nil
      return
    end
    V.noShip = nil
    local sw, sh = V.screen()
    if not sw then return end
    local fov = V.fov()
    -- (where the window's lower edge is now: it may have been dragged)
    local bottom = P.y + P.h
    if P.win and P.shown then
      local okb, _, by, _, bh = pcall(function() return P.win:getBounds() end)
      if okb and tonumber(by) and tonumber(bh) and bh > 100 then bottom = by + bh end
    end
    local key = string.format('%d %d %d %.2f', sw, sh, bottom, fov)
    if key ~= V.key then
      V.key, V.q = key, V.frame(sw, sh, bottom, fov)
      local q = V.q
      vlog(string.format('the picture: screen %d x %d, field of view %.1f (%s), free below row %d: the camera %.0f m from the ship\'s middle, %.0f m up, %.0f m %s of the centreline, looking down %.1f degrees; the hull on the screen %d to %d across, %d to %d down',
        sw, sh, fov, VIEW.fovAxis == 'v' and 'vertical' or 'horizontal', q.top, q.range, q.p[2], math.abs(q.p[3]), q.p[3] >= 0 and 'to starboard' or 'to port', q.pitch,
        q.x0, q.x1, q.y0, q.y1))
    end
    local o = V.world(V.q, c.s)
    if not o then return end
    -- (WHILE THE MAP IS STILL UP THE CAMERA IS NOT PUT: the user's run of 2026-11-23: each command was given 30 frames
    -- (half a second) with the camera put every frame, the camera read as the map's all the while (straight down, its
    -- place moved over the ship: the put had moved the MAP), the view was given up, and the free camera's view came
    -- up afterwards. So after a view command the map is waited out, up to VIEW.leave frames, nothing put; only when
    -- the camera no longer looks straight down is it put and checked. Not left in that time: the next command.)
    -- (A PAUSED MISSION DOES NOT CHANGE ITS VIEW: the user's run of 2026-11-23: the mission paused at its start, both
    -- commands waited out and given up, and the ship view came up once he unpaused. So nothing is sent and nothing
    -- counted until the mission's clock runs: told by DCS's model time going on between two frames)
    local okm, mt = pcall(function() return DCS.getModelTime() end)
    local running = okm and type(mt) == 'number' and V.mt ~= nil and mt > V.mt
    if okm and type(mt) == 'number' then V.mt = mt end
    if not V.ok and V.n == 0 and not running then
      if not V.pausedSaid then
        V.pausedSaid = true
        vlog('the mission stands (paused, or not yet begun): the view is taken once it runs')
      end
      return
    end
    if V.cmdDue then
      V.cmdDue = false
      if V.pausedSaid then vlog('the mission runs') end
      command(VIEW.cmds[V.ci], CMD_NAME[VIEW.cmds[V.ci]] or '?')
      return
    end
    local cp0 = readCam()
    if not V.ok and V.n == 0 and cp0 and cp0.x.y < -0.98 then
      V.wait = (V.wait or 0) + 1
      if V.wait < VIEW.leave then return end
      local cmd = VIEW.cmds[V.ci]
      V.wait = 0
      if VIEW.cmds[V.ci + 1] then
        vlog(string.format('the map is still up %d frames after view command %s: the next command', VIEW.leave, tostring(cmd)))
        V.ci, V.last = V.ci + 1, nil
        command(VIEW.cmds[V.ci], CMD_NAME[VIEW.cmds[V.ci]] or '?')
        return
      end
      V.dead = true
      vlog(string.format('the map is still up %d frames after view command %s, the last: the view is left alone for this mission', VIEW.leave, tostring(cmd)))
      api.say('The view could not be put on the carrier (DCS stayed on the map: see the log).')
      return V.release('DCS stayed on the map', true)
    end
    if V.n == 0 and (V.wait or 0) > 0 then
      vlog(string.format('the map was left %d frames after view command %s: the camera %s', V.wait, tostring(VIEW.cmds[V.ci]), camText(cp0)))
      V.wait = 0
    end
    -- (the check: where the camera is now against where it was put the frame before)
    local cp, far, off = readCam(), nil, nil
    if cp and V.last then
      far = math.sqrt((cp.p.x - V.last.p.x) ^ 2 + (cp.p.y - V.last.p.y) ^ 2 + (cp.p.z - V.last.p.z) ^ 2)
      off = math.deg(math.acos(math.max(-1, math.min(1, cp.x.x * V.last.x.x + cp.x.y * V.last.x.y + cp.x.z * V.last.x.z))))
    end
    local okp, errp = pcall(Export.LoSetCameraPosition, o)
    V.n, V.frames = V.n + 1, (V.frames or 0) + 1
    if not okp then
      V.dead = true
      vlog('LoSetCameraPosition raised an error: ' .. tostring(errp) .. ': the view is left alone')
      return V.release('the camera could not be put', true)
    end
    V.last = o
    if V.n == 1 then vlog(string.format('first put: the camera to %s (LoSetCameraPosition: no error); before it: %s', camText(o), camText(cp))) end
    local stays = far ~= nil and far <= VIEW.tol and off <= VIEW.tolDeg
    if not V.ok and V.n >= VIEW.settle then
      local cmd = VIEW.cmds[V.ci]
      local seen = far and string.format('%.2f m from and %.2f degrees off where it was put the frame before (%s)', far, off, camText(cp)) or 'could not be read'
      if stays then
        V.ok, V.lost = true, 0
        vlog(string.format('HOLDS: %d frames after view command %s the camera is %s: put there every frame from here on', V.n, tostring(cmd), seen))
      elseif VIEW.cmds[V.ci + 1] then
        vlog(string.format('does NOT hold after view command %s: %d frames on the camera is %s: the next command', tostring(cmd), V.n, seen))
        V.ci, V.n, V.last = V.ci + 1, 0, nil
        command(VIEW.cmds[V.ci], CMD_NAME[VIEW.cmds[V.ci]] or '?')
      else
        V.dead = true
        vlog(string.format('does NOT hold after view command %s either: %d frames on the camera is %s: the view is left alone for this mission', tostring(cmd), V.n, seen))
        api.say('The view could not be put on the carrier (the camera does not stay where it is put: see the log).')
        return V.release('the camera does not stay where it is put', true)
      end
    elseif V.ok then
      -- (held, and then not any more for a second's frames: said once each way)
      if stays or far == nil then
        if V.lost >= 60 then vlog('the camera is where it is put again') end
        V.lost = 0
      else
        V.lost = V.lost + 1
        if V.lost == 60 then vlog(string.format('the camera is NOT where it is put any more (60 frames; now %.1f m, %.1f degrees off: %s): still put every frame', far, off, camText(cp))) end
      end
    end
  end
end

-- ---------------------------------------------------------------- every frame
function S.tick(t)
  S.lastT = t
  -- (once a mission in multiplayer: what the takeover is decided by, in the log; the wraps looked at again)
  if mp() and not S.saidMp then
    S.saidMp = true
    S.wrap()
    log(string.format('multiplayer: server %s, %d slots on carriers, DCS slot list asked for %s, DCS\'s slot screen up %s: the picker %s',
      tostring(server()), #S.slots, tostring(S.vanilla), tostring(S.MSR and S.MSR.isVisible and try(S.MSR.isVisible)), S.takeover() and 'takes its place' or 'does not'))
  end
  -- (before S.track: a slot of the host's own held until his FLY is known before S.took would take its static away)
  if mp() then
    local okf, errf = pcall(S.flyTick, t)
    if not okf then log('FLY: ' .. tostring(errf)) end
  end
  if mp() and server() and t >= S.trackAt then
    S.trackAt = t + 1
    try(S.track)
  end
  if mp() and server() then
    local okl, errl = pcall(S.lookTick, t)
    if not okl then log('lookalike: ' .. tostring(errl)) end
  end
  if mp() then
    local oks, errs = pcall(spawnTick, t)
    if not oks then log('spawn: ' .. tostring(errs)) end
    local okg, errg = pcall(S.guiTick, t)
    if not okg and not S.guiErr then
      S.guiErr = true
      log('the GUI state: ' .. tostring(errg))
    end
  end
  -- (DCS's screen came up before it was wrapped: the picker instead)
  if S.takeover() and not P.on and S.MSR and S.MSR.isVisible and try(S.MSR.isVisible) and not S.mySlot() then S.showPicker() end
  -- OVER DCS'S SCREEN, where that cannot be wrapped (the GUI state out of reach: S.guiTick): whenever the player has
  -- no slot. DCS's slot screen's windows are zOrder 0 to 2 and not modal, the picker's 114: it is drawn over them.
  -- Put away by the player while he has no slot: not again until his slot changes (S.closedAt).
  if S.takeover() and not S.guiDone and not P.on and t >= (S.overAt or 0) then
    S.overAt = t + 0.5
    local mine = S.mySlot()
    if S.closedAt ~= nil and (mine or '') ~= S.closedAt then S.closedAt = nil end
    if not mine and S.closedAt == nil then
      if not S.saidOver then
        S.saidOver = true
        log('DCS\'s slot screen cannot be put away from here: the picker is shown over it while the player has no slot')
      end
      S.showPicker()
    end
  end
  -- (the player has another slot now: the picker is put away)
  if P.on and mp() and S.mySlot() and S.mySlot() ~= P.slotAtShow then S.hidePicker() end
  S.applyPicker()
  if P.shown then pcall(S.moveMarks, t) end
  if P.shown and t >= S.refreshAt then
    S.refreshAt = t + 0.5
    local ok, err = pcall(S.refresh)
    if not ok then log('refresh: ' .. tostring(err)) end
  end
  -- (the view behind the picker: after the window is shown or put away, the carrier's tab chosen)
  local okv, errv = pcall(S.view.tick)
  if not okv and not S.viewErr then
    S.viewErr = true
    log('view: ' .. tostring(errv))
  end
end

function S.mySlot()
  local id = myId()
  if not id then return nil end
  local _, slot = try(function() return net.get_slot(id) end)
  slot = slot and tostring(slot) or ''
  return slot ~= '' and slot or nil
end

function S.start()
  S.hold, S.inSlot, S.vanilla, S.sel, S.carrierIx, S.green = {}, {}, false, nil, 1, {}
  S.saidMp, S.saidTake = nil, nil
  S.saidOver, S.overAt, S.closedAt = nil, nil, nil
  S.guiDone, S.guiTry, S.guiSaid, S.guiWant, S.pollAt, S.guiErr, S.guiVis = nil, nil, nil, nil, nil, nil, nil
  S.spawnWait, S.quietUntil = nil, nil
  S.fly, S.flyLast, S.flyWrap, S.flyWrapAll, S.flyWrapAt, S.flySaid, S.flyN = nil, nil, false, nil, nil, nil, nil
  S.firstDone, S.firstAsked, S.first, S.startRT = nil, nil, nil, try(function() return DCS.getRealTime() end)
  S.looks, S.lookAt = {}, nil
  S.view.held, S.view.dead, S.view.frames, S.viewErr = false, nil, 0, nil
  S.map, S.list, S.ship, S.mapAt = {}, {}, nil, -1e9
  S.loadCfg()
  S.loadSpots()
  S.loadSlots()
  S.wrap()
end

function S.stop()
  S.flyDrop('the mission stopped')
  S.flyWrap, S.flyWrapAll, S.flyWrapAt = false, nil, nil
  S.unaim('the mission stopped')
  S.shipObj, S.aimCount, S.aimOff = nil, nil, nil
  S.hidePicker()
  P.queue = {}
  -- (no frame comes after the mission's end: the window put away now)
  if P.win and P.shown then pcall(apply, false) end
  pcall(S.view.release, 'the mission stopped', true)
  S.hold, S.inSlot = {}, {}
  -- (DCS's screen no longer held back: the lease ended now, not in up to 3 s)
  if S.guiDone then gui('if CATCC_SLOTWRAP then CATCC_SLOTWRAP.till = 0 end return "ok"') end
end

S.wrap()
return S
