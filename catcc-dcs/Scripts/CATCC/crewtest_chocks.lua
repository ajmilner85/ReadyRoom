-- CATCC crew test: the wheel chock tool (TEST ONLY): the in-game panel's "Chocks" page. Loaded by crewtest_ui.lua.
-- The user, 2026-11-24, after the wheel chock model (crew-test/model/wheel_chock.py: CATCC_WheelChock, our mod's static
-- type) was installed: a test of it in the testing UI.
--
--   Chock my jet / Chock selected   a chock on each MAIN wheel of the player's jet, or of the aircraft the deck tool has
--                                   selected (a click on it). None on the nose gear (the user, 2026-11-24: "in all the
--                                   real life references I've looked at, the NLG is never chocked"). Each a static LINKED
--                                   to the ship, made by the mission script (CATCC_CR.marker) as the axle finder's marker
--                                   is; a static cannot be moved, so "Chock ..." again makes them anew where the aircraft
--                                   then stands. Each set to fit its tyre.
--   Wheel                           which chock the buttons below change: both, the left or the right main's.
--   Fit / Open / Closed / steps     the spacing: model argument 10, each block's tyre-side plate this far from the centre
--                                   point in metres (0.012 to 0.36), set through native.objarg, and written again every
--                                   half second (as the deck tool keeps its aircraft's wings).
--   Fore / aft, In / out            the chosen wheel's chock (or both) moved along the aircraft's nose, or inboard /
--                                   outboard, by a step: made anew there (a static cannot be moved), its spacing kept; the
--                                   moves kept until DCS closes
--   Sweep                           every chock from closed to open and back, over 6 s, until pressed again.
--   Report                          each chock's spacing, its fit and where it stands, in the log (Logs\catcc-crewtest.log).
--
-- THE HORNET'S OWN CHOCKS (the user, 2026-11-24: "prevent the chocks built into the F/A-18C model from ever appearing and
-- substitute our own whenever the game tries to insert them"; "I want the built in chocks to always be hidden").
-- fa-18c.edm and its LODs 1 to 4 (read with crew-test/model/edm.py) draw them as six parts, two shapes a wheel: each
-- part shown only while argument 23 (the jet's chock state) is in its range: the mains' from 0.5, the nose's at 1 only
-- (the user, in DCS: hidden "for anything from -1.00 to 0.999"); each wheel's shape argument (135 nose, 136 and 137 the
-- mains) picks one of its two shapes, and every value of -1 .. 1 shows one (model arguments go no further: writing 2 to
-- them, tried first, did nothing).
--   HIDDEN AND SUBSTITUTED, every frame while the player's jet is an F/A-18C: argument 23 read. The jet's own value
--   tells the state (in from OWN.out; the jet writes 1 and 0) and is replaced by OWN.hide (0.25: below both ranges); our
--   OWN.hide read back means the jet has not written it since, the state unchanged. So it works whether the jet writes
--   23 every frame (then ours, written after it in the frame, is what is drawn: NOT SEEN IN DCS YET) or only when its
--   chocks change; which of the two is logged once a jet. Chocks in: ours put on the main wheels as by "Chock my jet";
--   out: the ones put so taken away (ones put by hand stay).
--
-- THE CHOCK ON A WHEEL. The model's origin is on the deck midway between the blocks, across in the middle of the
-- 0.2135 m span beside the bar where the tyre stands; its x along the bar, the bar on its +z side. Each chock is put
-- with its x along the aircraft's nose, its bar OUTBOARD, its origin under the axle; a tyre wider than the span is put
-- away from the bar by half the difference (its inboard face then against the blocks' far ends). The fit: the spacing at
-- which a block touches the tyre, for a tyre of radius r whose axle is h above the deck (h < r: the tyre is pressed flat
-- under the aircraft's weight), from the block's outline: the 45 degree plates C high at its foot and top, the upright
-- tyre-side plate between (wheel_chock.py spacing(r) is this with h = r).
--
-- api (from the panel): dostring(code) in the mission's Lua state; split(s); objarg(id, n, v): native.objarg on the ship
-- (its result, or nil and why; v nil: the argument read); jet(): where the player's jet is (the hook's getCtx: jx, jz,
-- fx, fz in the ship's frame, ship); jetId(): the player's aircraft's object id and its type name; deck: the hook's
-- Tow.Deck (list, lock, pose, ship); log(text); now().
-- Returns the tool: place(what), clear(), select(which), set(v), step(d), fit(), move(fwd, out), sweep(), report(),
-- status(), tick() (a message to show, or nil), reset(); the spacing math as fitFor(r, h) and placeFor(x, z, fx, fz).
local api = ...
local C = { list = nil, which = 'all', sweepOn = false }

-- the model (crew-test/model/wheel_chock.py: H, C, SPAN, S_MIN, S_MAX, CHOCK_ARG; a test keeps these the same)
local M = { H = 0.150, C = 0.040, SPAN = 0.2135, MIN = 0.012, MAX = 0.360, ARG = 10, TYPE = 'CATCC_WheelChock' }
C.M = M

-- THE F/A-18C'S MAIN WHEELS, from the jet's own position (fwd along its nose, side to its right), each with its tyre's
-- radius r, its axle's height h above the deck and its width w; all as seen right in DCS by the user, 2026-11-24:
--   fwd    2.358 m behind and side 1.590 m either side: THE USER'S FINAL ADJUSTMENTS in DCS, 2026-11-24 (Report:
--          "+0.0350 from -2.3930", "-0.0700 from 1.6600"). Before: 2.393 (the first chock test's tyre centre, chocktest.lua,
--          "drawn wheel centre about -2.39"; the flight model's 2.438 was too far aft) and 1.66 (10 cm outboard of the
--          hook's track TOW.track 3.12, the user: "need to move outboard by about 10cm")
--   r 0.39 (the collision model's main wheels, 0.78 m across), h 0.37 (the radius the hook rolls them on,
--   TOW.mainWheelR), w 0.292 (the jet's 30 x 11.5-14.5 tyre): the spacing they give, seen right.
-- Each wheel's chock can be moved from there (adj: metres forward; out: metres outboard): kept until DCS closes (from
-- mission to mission, and when the chocks are made again); "Report" logs where each then stands.
local WHEELS = {
  { key = 'left', name = 'Left main', fwd = -2.358, side = -1.590, r = 0.39, h = 0.37, w = 0.292, adj = 0, out = 0 },
  { key = 'right', name = 'Right main', fwd = -2.358, side = 1.590, r = 0.39, h = 0.37, w = 0.292, adj = 0, out = 0 },
}
C.WHEELS = WHEELS

-- THE MAIN WHEELS ON THEIR STRUTS (the user, 2026-11-25: "the chocks are perfect on my aircraft, but on the statics they
-- are intersecting with the tires"). Each main wheel hangs on a trailing arm that swings with its strut's compression
-- (model argument 4 the right main, 6 the left; 3 and 5 put the gear down): the axle drops and moves forward as the
-- strut is compressed. The hub's centre from fa-18c.edm's own nodes (the arm Dummy194, the hub Dummy244, evaluated
-- down the node tree; ED's own chock pair, on the same arm, centred at x -2.356, z 1.59 where the user set ours), every
-- 0.05 of the strut: { strut, x forward, y up } of the model's origin. The player's jet, with ours set right by eye, stood
-- 1.826 m above the deck with its struts at about 0.90 (the hub 1.4557 m below the origin: the axle 0.370 m up, the
-- height the fit was made for); the demo's static Hornets stand at 0.778 (read from them: the lookalike's "pose read").
-- So for another Hornet: the axle's height = its origin above the deck + the hub's y at its strut, the spacing fitted to
-- that, and its chock moved forward by the hub's x there less at STRUT_REF.
local HUB = {
  { 0.00, -1.9700, -2.0152 }, { 0.05, -2.0052, -1.9975 }, { 0.10, -2.0393, -1.9777 }, { 0.15, -2.0722, -1.9560 },
  { 0.20, -2.1036, -1.9322 }, { 0.25, -2.1337, -1.9067 }, { 0.30, -2.1621, -1.8794 }, { 0.35, -2.1888, -1.8504 },
  { 0.40, -2.2138, -1.8199 }, { 0.45, -2.2369, -1.7879 }, { 0.50, -2.2580, -1.7546 }, { 0.55, -2.2771, -1.7202 },
  { 0.60, -2.2941, -1.6846 }, { 0.65, -2.3089, -1.6480 }, { 0.70, -2.3215, -1.6107 }, { 0.75, -2.3319, -1.5726 },
  { 0.80, -2.3399, -1.5340 }, { 0.85, -2.3456, -1.4950 }, { 0.90, -2.3490, -1.4557 }, { 0.95, -2.3500, -1.4163 },
  { 1.00, -2.3487, -1.3769 },
}
local STRUT_REF = 0.90
local STRUT_ARG = { left = 6, right = 4 }
-- the decks' heights above the ship's origin: the flight deck, the hangar floor (the hook's TOW / Tow.Deck numbers)
local DECKS = { 20.149, 8.711 }

-- the hub's centre at a strut's compression c: x, y of the model's origin
function C.hubAt(c)
  c = math.max(0, math.min(1, tonumber(c) or STRUT_REF))
  for i = 1, #HUB - 1 do
    local a, b = HUB[i], HUB[i + 1]
    if c <= b[1] then
      local t = (c - a[1]) / (b[1] - a[1])
      return a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t
    end
  end
  return HUB[#HUB][2], HUB[#HUB][3]
end

-- a main wheel of an aircraft whose origin stands up metres above the ship's origin, its strut at c: the axle's height
-- above the deck it stands on, and how far its chock goes forward of the player-set place. platform: the surface it stands
-- on when that is an elevator's platform (api.platformAt), which may be anywhere between the hangar floor and the flight
-- deck (the user's run of 2026-11-26: four pairs fitted partway up, at 21.268 to 21.832 m, their axles taken from the
-- flight deck: spacings from 0.012 to 0.36)
function C.wheelAt(up, c, platform)
  local deck = DECKS[#DECKS]
  for _, d in ipairs(DECKS) do
    if up - d > 0.5 then
      deck = d
      break
    end
  end
  if platform then deck = platform end
  local hx, hy = C.hubAt(c)
  local rx = C.hubAt(STRUT_REF)
  return (up - deck) + hy, hx - rx
end
local KEEP = 0.5 -- seconds between writes of each chock's argument, and between looks at the jet's own chocks
-- A NEW CHOCK OPENS WIDE, THEN CLOSES ON ITS TYRE (the user, 2026-11-26: "the chock model spawns in its fully closed
-- position, then collapses to the correct size for the hornet's wheels. I would prefer if the model started fully open,
-- and then collapsed down"): fully open (M.MAX) for GLIDE.hold seconds from when it is made, then eased in to its
-- spacing over GLIDE.close seconds, written every frame until then (a static's argument is 0, fully closed, until a
-- write reaches it: every frame, not every KEEP, so that is a frame at the most)
local GLIDE = { hold = 0.4, close = 0.8 }
C.GLIDE = GLIDE
-- the spacing a chock made at t0 is to have now (target v), or nil once it has closed on it
function C.glide(t0, v, now)
  if not t0 then return nil end
  local k = (now - t0 - GLIDE.hold) / GLIDE.close
  if k >= 1 then return nil end
  if k <= 0 then return M.MAX end
  k = k * k * (3 - 2 * k)
  return M.MAX + (v - M.MAX) * k
end
local SWEEP = 6  -- seconds for closed -> open -> closed
-- the Hornet's own chocks (see the top of this file)
local OWN = { type = 'FA-18C_hornet', state = 23, hide = 0.25, out = 0.2, watch = 2 }
C.OWN = OWN

local function clamp(v) return math.max(M.MIN, math.min(M.MAX, v)) end

-- the spacing at which a block touches a tyre of radius r whose axle is h above the deck, over the chock's centre point
function C.fitFor(r, h)
  local best, n = M.MIN, 600
  for i = 0, n do
    local y = M.H * i / n
    local dy = y - h
    if math.abs(dy) < r then
      local off = 0
      if y < M.C then off = M.C - y elseif y > M.H - M.C then off = y - (M.H - M.C) end
      local s = math.sqrt(r * r - dy * dy) - off
      if s > best then best = s end
    end
  end
  return clamp(best)
end

-- where the chock of each wheel stands for an aircraft at x, z (its own position, the ship's frame) with its nose along
-- fx, fz: { wheel, x, z, ang (radians clockwise from the bow) }
function C.placeFor(x, z, fx, fz, extra)
  local l = math.sqrt(fx * fx + fz * fz)
  fx, fz = fx / l, fz / l
  local rx, rz = -fz, fx -- (the aircraft's right, on the ship)
  local out = {}
  for _, w in ipairs(WHEELS) do
    local out1 = w.side >= 0 and 1 or -1 -- (the bar outboard: the model's +z to that side)
    local side = w.side + out1 * (math.max(0, (w.w - M.SPAN) / 2) + (w.out or 0))
    local along = w.fwd + (w.adj or 0) + ((extra and extra[w.key]) or 0)
    local cx, cz = x + fx * along + rx * side, z + fz * along + rz * side
    local hx, hz = fx * out1, fz * out1 -- (the model's x: the nose's way for a chock to starboard, back for one to port)
    out[#out + 1] = { wheel = w, x = cx, z = cz, ang = (math.atan2 or math.atan)(hz, hx) }
  end
  return out
end

local function mission(code)
  local ok, r = pcall(api.dostring, code)
  if not ok then return { 'ERR', tostring(r) } end
  if type(r) ~= 'string' then return { 'ERR', 'the menu script answered nothing' } end
  return api.split(r)
end

-- a chock's argument written: true, or nil and why (the first answer of each chock logged)
local function write(e, v)
  local ok, res, why = pcall(api.objarg, e.id, M.ARG, v)
  local good = ok and res ~= nil and res ~= false
  if not e.said then
    e.said = true
    api.log(string.format('chocks: %s (object %s): argument %d = %.3f %s', e.wheel.name, tostring(e.id), M.ARG, v,
      good and ('written (' .. tostring(res) .. ')') or ('NOT WRITTEN: ' .. tostring(ok and why or res))))
  end
  e.at = api.now()
  if not good then return nil, tostring(ok and why or res) end
  return true
end

local function chosen()
  local out = {}
  for _, e in ipairs(C.list or {}) do
    if C.which == 'all' or e.wheel.key == C.which then out[#out + 1] = e end
  end
  return out
end

local function values()
  local parts = {}
  for _, e in ipairs(C.list or {}) do
    parts[#parts + 1] = string.format('%s %.3f%s', e.wheel.name, e.v, math.abs(e.v - e.fit) < 0.0005 and '' or string.format(' (fit %.3f)', e.fit))
  end
  return table.concat(parts, ', ')
end

-- one chock made under key at a place of placeFor's (the one standing under that key taken away): the script's answer
local function makeOne(key, p, ship)
  return mission(string.format('return (CATCC_CR and CATCC_CR.marker) and CATCC_CR.marker(%q, %q, %.4f, %.4f, %.5f, nil, %s) or "ERR|the menu script cannot place markers: run crew-test\\\\install.ps1 with DCS closed"',
    key, M.TYPE, p.x, p.z, p.ang, ship and string.format('%q', ship) or 'nil'))
end

-- the chocks made (anew): what = 'jet' (the player's) or 'lock' (the deck tool's selected aircraft). A message, or nil, why
function C.place(what)
  local x, z, fx, fz, ship, whose
  if what == 'lock' then
    local D = api.deck
    local e = D and D.list and D.shown and D.lock and D.list[D.lock]
    if not e then return nil, 'chocks: no aircraft selected: "Deck spots" > "Park Hornets", then click one.' end
    local hdg
    x, z, hdg = D.pose(e)
    fx, fz = math.cos(math.rad(hdg)), math.sin(math.rad(hdg))
    ship, whose = D.ship, D.label and D.label(e) or 'the selected aircraft'
  else
    local c, err = api.jet()
    if not c then return nil, 'chocks: can\'t tell where your jet is: ' .. tostring(err) end
    x, z, fx, fz, ship, whose = c.jx, c.jz, c.fx, c.fz, nil, 'your jet'
  end
  C.clear(true)
  C.base = { x = x, z = z, fx = fx, fz = fz }
  local list, bad = {}, {}
  for _, p in ipairs(C.placeFor(x, z, fx, fz)) do
    local key = 'catcc-chock-' .. p.wheel.key
    local r = makeOne(key, p, ship)
    if r[1] == 'OK' and tonumber(r[2]) and tonumber(r[2]) ~= 0 then
      local fit = C.fitFor(p.wheel.r, p.wheel.h)
      list[#list + 1] = { wheel = p.wheel, key = key, id = tonumber(r[2]), name = r[3], x = p.x, z = p.z, ang = p.ang, ship = ship, v = fit, fit = fit, at = -1e9, t0 = api.now() }
    else
      bad[#bad + 1] = p.wheel.name .. ': ' .. tostring(r[2])
    end
  end
  C.list = #list > 0 and list or nil
  C.sweepOn = false
  local unset
  for _, e in ipairs(list) do
    local ok, why = write(e, C.glide(e.t0, e.v, api.now()) or e.v)
    if not ok then unset = why end
  end
  api.log(string.format('chocks: on %s (at %.3f fwd %.3f stbd, nose %.4f %.4f%s): %s%s', whose, x, z, fx, fz, ship and (', ' .. ship) or '',
    #list > 0 and table.concat((function()
      local t = {}
      for _, e in ipairs(list) do t[#t + 1] = string.format('%s "%s" at %.3f / %.3f, %.1f deg, spacing %.4f', e.wheel.name, tostring(e.name), e.x, e.z, math.deg(e.ang) % 360, e.v) end
      return t
    end)(), '; ') or 'none made', #bad > 0 and ('; NOT MADE: ' .. table.concat(bad, '; ')) or ''))
  if #list == 0 then return nil, 'chocks: none could be made: ' .. table.concat(bad, '; ') end
  return string.format('chocks: %d on %s, each fitted to its tyre: %s.%s%s', #list, whose, values(), #bad > 0 and (' Not made: ' .. table.concat(bad, '; ') .. '.') or '',
    unset and (' The spacing is not set yet (' .. unset .. '): tried again every half second.') or '')
end

-- the chocks taken away (quiet: no message, for a new placing)
function C.clear(quiet)
  local n = 0
  for _, e in ipairs(C.list or {}) do
    mission(string.format('return CATCC_CR and CATCC_CR.marker and CATCC_CR.marker(%q, "", 0, 0, 0, nil, %s)', e.key, e.ship and string.format('%q', e.ship) or 'nil'))
    n = n + 1
  end
  C.list, C.sweepOn, C.auto = nil, false, nil
  if quiet then return end
  if n == 0 then return nil, 'chocks: none to take away.' end
  api.log('chocks: taken away')
  return 'chocks: taken away.'
end

function C.select(which)
  C.which = which
  return nil
end

local function apply(fn, what)
  if not C.list then return nil, 'chocks: none placed: "Chock my jet" or "Chock selected" first.' end
  C.sweepOn = false
  local bad
  for _, e in ipairs(chosen()) do
    e.v, e.t0 = clamp(fn(e)), nil
    local ok, why = write(e, e.v)
    if not ok then bad = why end
  end
  api.log('chocks: ' .. what .. ' (' .. C.which .. '): ' .. values())
  if bad then return nil, 'chocks: the spacing could not be set: ' .. bad end
  return 'chocks: ' .. values() .. '.'
end

-- where each wheel's chock stands (metres forward of the aircraft's own position, metres out from its centre line),
-- and its moves
function C.where()
  local parts = {}
  for _, w in ipairs(WHEELS) do
    local moved = {}
    if math.abs(w.adj) >= 0.0005 then moved[#moved + 1] = string.format('%+.3f fwd', w.adj) end
    if math.abs(w.out) >= 0.0005 then moved[#moved + 1] = string.format('%+.3f out', w.out) end
    parts[#parts + 1] = string.format('%s %.3f m, %.3f m out%s', w.name, w.fwd + w.adj, math.abs(w.side) + w.out, #moved > 0 and (' (' .. table.concat(moved, ', ') .. ')') or '')
  end
  return table.concat(parts, ', ')
end

-- the chosen wheel's chock (or both) moved fwd metres along the aircraft's nose and out metres outboard: made anew
-- there, its spacing kept
function C.move(fwd, out)
  if not (C.list and C.base) then return nil, 'chocks: none placed: "Chock my jet" or "Chock selected" first.' end
  local B, bad = C.base, nil
  for _, e in ipairs(chosen()) do
    local w = e.wheel
    w.adj, w.out = w.adj + (fwd or 0), w.out + (out or 0)
    for _, p in ipairs(C.placeFor(B.x, B.z, B.fx, B.fz)) do
      if p.wheel == w then
        local r = makeOne(e.key, p, e.ship)
        if r[1] == 'OK' and tonumber(r[2]) and tonumber(r[2]) ~= 0 then
          e.id, e.name, e.x, e.z, e.ang, e.said, e.at = tonumber(r[2]), r[3], p.x, p.z, p.ang, nil, -1e9
          write(e, C.sweepOn and M.MIN or e.v)
        else
          bad = w.name .. ': ' .. tostring(r[2])
        end
      end
    end
  end
  api.log(string.format('chocks: moved %+.3f m forward, %+.3f m outboard (%s): %s', fwd or 0, out or 0, C.which, C.where()))
  if bad then return nil, 'chocks: could not be made again: ' .. bad end
  return 'chocks: ' .. C.where() .. '.'
end

function C.set(v) return apply(function() return v end, string.format('set to %.3f', v)) end
function C.step(d) return apply(function(e) return e.v + d end, string.format('%+.3f', d)) end
function C.fit() return apply(function(e) return e.fit end, 'fitted') end

function C.sweep()
  if not C.list then return nil, 'chocks: none placed: "Chock my jet" or "Chock selected" first.' end
  C.sweepOn = not C.sweepOn
  C.sweepT0 = api.now()
  if not C.sweepOn then
    for _, e in ipairs(C.list) do write(e, e.v) end
    return 'chocks: sweep stopped: ' .. values() .. '.'
  end
  return string.format('chocks: sweeping, closed to open and back every %d s.', SWEEP)
end

function C.report()
  if not C.list then return nil, 'chocks: none placed.' end
  local parts = {}
  for _, e in ipairs(C.list) do
    local w = e.wheel
    parts[#parts + 1] = string.format('%s: spacing %.4f (fit %.4f for r %.3f, axle %.3f up; %+.4f from the fit); centre %.4f m forward of the jet\'s position (%+.4f from %.4f), %.4f m out (%+.4f from %.4f)',
      w.name, e.v, e.fit, w.r, w.h, e.v - e.fit, w.fwd + w.adj, w.adj, w.fwd, math.abs(w.side) + w.out, w.out, math.abs(w.side))
  end
  api.log('chocks: report: ' .. table.concat(parts, '; '))
  return 'chocks: ' .. values() .. '. (In the log.)'
end

function C.status()
  local name = { all = 'Both', left = 'Left main', right = 'Right main' }
  -- (needs attention: a client that cannot see the other aircraft)
  local warn = (C.client and C.client.bad) and ('\nOther aircraft: ' .. C.client.bad) or ''
  if not C.list then return 'No chocks.' .. warn end
  local moved = {}
  for _, w in ipairs(WHEELS) do
    local m = {}
    if math.abs(w.adj) >= 0.0005 then m[#m + 1] = string.format('%+.3f fwd', w.adj) end
    if math.abs(w.out) >= 0.0005 then m[#m + 1] = string.format('%+.3f out', w.out) end
    if #m > 0 then moved[#moved + 1] = w.name .. ' ' .. table.concat(m, ' ') end
  end
  return (C.sweepOn and 'Sweeping. ' or '') .. values() .. (#moved > 0 and ('\nMoved: ' .. table.concat(moved, ', ')) or '') .. '\nWheel: ' .. (name[C.which] or C.which) .. warn
end

-- the Hornet's own chocks on the player's jet, every frame: hidden, and ours put in and taken away with them. A message
-- or nil. Argument 23 read: the jet's own value (in, or out: below OWN.out) tells the state and is replaced by OWN.hide;
-- our own OWN.hide read back means the jet has not written it since (the state unchanged)
local function own(now)
  local okj, id, typ = pcall(api.jetId)
  if not (okj and type(id) == 'number' and typ == OWN.type) then
    C.ownState = nil
    return
  end
  local ok, v = pcall(api.objarg, id, OWN.state)
  if not (ok and type(v) == 'number') then return end -- (the ship not read yet: tried again)
  local ours = math.abs(v - OWN.hide) < 0.005
  local state
  if ours then state = C.ownState or 0 else state = v >= OWN.out and v or 0 end
  if state >= OWN.out then pcall(api.objarg, id, OWN.state, OWN.hide) end
  -- (once for each jet, over its first OWN.watch seconds with the chocks in: does it write argument 23 again every frame?)
  local W = C.watch
  if C.ownJet ~= id then
    C.ownJet, W = id, { id = id, n = 0, again = 0 }
    C.watch = W
    -- (once a jet: its main struts and its height, which the other Hornets' chocks are fitted against: C.wheelAt)
    local okl, cl = pcall(api.objarg, id, STRUT_ARG.left)
    local okr, cr = pcall(api.objarg, id, STRUT_ARG.right)
    local okc, ctx = pcall(api.jet)
    api.log(string.format('chocks: your jet (object %d): main struts left %s, right %s (the fit was made at %.2f); its own position %s above the ship\'s origin',
      id, tostring(okl and cl), tostring(okr and cr), STRUT_REF, (okc and ctx and ctx.jy) and string.format('%.3f m', ctx.jy) or '?'))
  end
  if state >= OWN.out and not W.done then
    W.t0 = W.t0 or now
    if W.wrote then
      W.n = W.n + 1
      if not ours then W.again = W.again + 1 end
    end
    W.wrote = true
    if now - W.t0 >= OWN.watch and W.n > 0 then
      W.done = true
      api.log(string.format('chocks: the Hornet\'s own chocks on your jet (object %d): argument %d written %.2f every frame while they are in; the jet wrote it again in %d of %d frames (%s)',
        id, OWN.state, OWN.hide, W.again, W.n, W.again == 0 and 'only when its chocks change' or (W.again == W.n and 'every frame' or 'now and then')))
    end
  end
  local was = C.ownState
  C.ownState = state
  local inNow, inBefore = state >= OWN.out, (was or 0) >= OWN.out
  if inNow and not inBefore and not C.list then
    local msg, why = C.place('jet')
    if msg then C.auto = true end
    api.log(string.format('chocks: your jet\'s own chocks went in (argument %d %.2f): hidden, ours put in: %s', OWN.state, v, tostring(msg or why)))
    return msg or why
  end
  if inBefore and not inNow then
    api.log(string.format('chocks: your jet\'s own chocks came out (argument %d %.2f)%s', OWN.state, v, C.auto and ': ours taken away' or ''))
    if C.auto then
      C.clear(true)
      return 'chocks: taken away with your jet\'s own.'
    end
  end
end

-- THE OTHER HORNETS (the user, 2026-11-25: "statics (and I assume other aircraft) still show the built in chocks"):
-- every F/A-18C on a ship's deck but the player's own, static or live (AI, other players), and the demo's lookalike
-- Hornets (CATCC_HornetLook, CATCC_HornetLookF: drawn with the Hornet's own model), asked from the mission every
-- OTHERS.every seconds: object id, name, its ship, where it stands in that ship's frame and its nose.
-- THE SPAWN: a lookalike stands on a spot while a player goes into that spot's slot, and the slot picker refuses the
-- spawn while any static but a lookalike ("<key>-look <n>") stands on the spot (crewtest_slots.lua S.staticOn). Ours on
-- the lookalike, named plainly, did (the user, 2026-11-25: "preventing me from spawning into any spotted jet"); left off
-- it, the spot showed no chocks for those seconds. The user's choice, 2026-11-25 ("keep them visible: change only my
-- chock code"): a lookalike's chocks are named as lookalikes are, "catcc-chock-o<id>-<wheel>-look <n>", which the
-- picker passes over (deck equipment, as the lookalike: nothing that collides with a jet). And a Hornet's chocks are
-- taken away in the frame its object is no longer there, not at the next asking. Every frame each
-- one's argument 23 read: from OWN.out its chocks are in (the deck spotting demo writes OWN.hide, 0.25, for in: then
-- nothing to hide); from 0.5 (shown) it is written OWN.hide. Ours put on its main wheels when they go in, taken away
-- when they come out or the aircraft is gone; placed from a place asked AFTER they went in (a towed one has just
-- stopped), at most OTHERS.perFrame makings a frame (the demo's 40 at once were a hitch).
local OTHERS = { every = 2, perFrame = 4 }
C.others = {}
local OTHERS_Q = [[
local me = %s
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
local out = {}
local function add(o, kind)
  local ok, typ = pcall(function() return o:isExist() and o:getTypeName() end)
  if not (ok and (typ == 'FA-18C_hornet' or typ == 'CATCC_HornetLook' or typ == 'CATCC_HornetLookF')) then return end
  local id = tonumber(o.id_)
  if not id or id == me then return end
  if kind == 'u' and o.inAir and o:inAir() then return end
  local p = o:getPosition()
  local best, bd
  for _, s in ipairs(ships) do
    local dx, dz = p.p.x - s.pos.p.x, p.p.z - s.pos.p.z
    local d = dx * dx + dz * dz
    if d < 250 * 250 and (not bd or d < bd) then best, bd = s, d end
  end
  if not best then return end
  local sp = best.pos
  local d = { x = p.p.x - sp.p.x, y = p.p.y - sp.p.y, z = p.p.z - sp.p.z }
  out[#out + 1] = string.format('%%d,%%s,%%s,%%s,%%.4f,%%.4f,%%.5f,%%.5f,%%.4f', id, kind, (o:getName():gsub('[,;]', '_')), (best.name:gsub('[,;]', '_')),
    dot(d, sp.x), dot(d, sp.z), dot(p.x, sp.x), dot(p.x, sp.z), dot(d, sp.y))
end
for _, side in ipairs(SIDES) do
  if Group.Category.AIRPLANE then
    for _, g in ipairs(coalition.getGroups(side, Group.Category.AIRPLANE) or {}) do
      for _, u in ipairs(g:getUnits() or {}) do add(u, 'u') end
    end
  end
  if coalition.getStaticObjects then
    for _, s in ipairs(coalition.getStaticObjects(side) or {}) do add(s, 's') end
  end
end
return 'OK;' .. table.concat(out, ';')
]]

-- the other Hornets asked for again: a table by object id, or nil and why
local function othersAsk(me)
  local ok, r = pcall(api.dostring, string.format(OTHERS_Q, me and tostring(me) or 'nil'))
  if not (ok and type(r) == 'string' and r:sub(1, 3) == 'OK;') then return nil, tostring(r) end
  local out = {}
  for row in r:sub(4):gmatch('[^;]+') do
    local id, kind, name, ship, f, s, hx, hz, up = row:match('^(%d+),(%a),([^,]*),([^,]*),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)$')
    id = tonumber(id)
    if id then out[id] = { kind = kind, name = name, ship = ship, x = tonumber(f), z = tonumber(s), fx = tonumber(hx), fz = tonumber(hz), up = tonumber(up) } end
  end
  return out
end

-- (NOT IN THE HANGAR, NOR ON A PLATFORM ON ITS WAY: our chock is a static linked to the ship, which DCS stands on the
-- flight deck whatever height it is given: the user's run of 2026-11-26: the chocks of the demo's 24 hangar aircraft
-- (10.567 m above the ship's origin) stood on the flight deck over them, "almost a regular grid". Only an aircraft on the
-- flight deck (its origin at least 0.5 m above it) has ours; one going up an elevator has them once it is up.)
-- (ON AN ELEVATOR'S PLATFORM it has ours at whatever height the platform is (the user, 2026-11-26, of the tie-downs:
-- "always spawn at flight deck level, not at hangar deck level and then translate up with the aircraft"): put down to
-- the platform by the native module and moved with it (C.follow))
function C.belowDeck(o) return o.up ~= nil and o.up < DECKS[1] + 0.5 and not (api.platformAt and api.platformAt(o.x, o.z)) end

-- a chock of ours on a platform: put at the platform's surface now (api.staticpos, the ship's own frame); c.py the
-- height it was last put at
function C.follow(c)
  if not (api.platformAt and api.staticpos and c.id and c.x) then return end
  -- (the platform its aircraft stands on: a wheel's chock may lie past the platform's box)
  local y = api.platformAt(c.ox or c.x, c.oz or c.z)
  if y and (not c.py or math.abs(y - c.py) > 0.001) then
    local ok, res = pcall(api.staticpos, c.id, c.x, y, c.z, math.cos(c.ang), math.sin(c.ang))
    if ok and res then c.py = y end
  end
end

local function othersClear(o)
  for _, key in ipairs(o.keys or {}) do
    mission(string.format('return CATCC_CR and CATCC_CR.marker and CATCC_CR.marker(%q, "", 0, 0, 0, nil, %q)', key, o.ship))
  end
  o.keys = nil
end

local function othersPlace(id, o)
  local keys, ids = {}, {}
  -- (each main wheel from its own strut, read now, and the aircraft's height: C.wheelAt)
  local extra, fits, said = {}, {}, {}
  for _, w in ipairs(WHEELS) do
    local ok, c = pcall(api.objarg, id, STRUT_ARG[w.key])
    c = (ok and type(c) == 'number') and c or STRUT_REF
    local h, dx = C.wheelAt(o.up or (DECKS[1] + 1.826), c, api.platformAt and api.platformAt(o.x, o.z) or nil)
    extra[w.key], fits[w.key] = dx, C.fitFor(w.r, h)
    said[#said + 1] = string.format('%s strut %.3f, axle %.3f m up, %+.3f m fwd, spacing %.4f', w.name, c, h, dx, fits[w.key])
  end
  if not o.posSaid then
    o.posSaid = true
    api.log(string.format('chocks: %s (object %d), %.3f m above the ship\'s origin: %s', o.name, id, o.up or -1, table.concat(said, '; ')))
  end
  for _, p in ipairs(C.placeFor(o.x, o.z, o.fx, o.fz, extra)) do
    -- (on a lookalike: named as lookalikes are, so that the slot picker passes them over: see THE SPAWN above)
    local key = string.format('catcc-chock-o%d-%s%s', id, p.wheel.key, tostring(o.name):find('%-look %d+$') and '-look' or '')
    local r = makeOne(key, p, o.ship)
    keys[#keys + 1] = key
    if r[1] == 'OK' and tonumber(r[2]) and tonumber(r[2]) ~= 0 then
      local fit = fits[p.wheel.key] or C.fitFor(p.wheel.r, p.wheel.h)
      ids[#ids + 1] = { id = tonumber(r[2]), v = fit, t0 = api.now(), x = p.x, z = p.z, ang = p.ang, ox = o.x, oz = o.z }
      C.follow(ids[#ids])
    elseif not o.said then
      o.said = true
      api.log(string.format('chocks: %s (object %d): %s not made: %s', o.name, id, p.wheel.name, tostring(r[2])))
    end
  end
  o.keys, o.ids, o.placed = keys, ids, { x = o.x, z = o.z, fx = o.fx, fz = o.fz, name = o.name, ship = o.ship, up = o.up }
end

local function others(now)
  local okj, me = pcall(api.jetId)
  me = okj and type(me) == 'number' and me or nil
  -- (asked again every OTHERS.every seconds, or at once when one's chocks went in and it waits for its place)
  if now - (C.othersAt or -1e9) >= OTHERS.every or C.othersWait then
    C.othersAt, C.othersWait = now, nil
    local got, why = othersAsk(me)
    if got then
      for id, o in pairs(C.others) do
        if not got[id] then
          othersClear(o)
          C.others[id] = nil
        end
      end
      for id, g in pairs(got) do
        local o = C.others[id]
        if not o then
          o = { id = id }
          C.others[id] = o
        end
        o.kind, o.name, o.ship, o.x, o.z, o.fx, o.fz, o.up, o.at = g.kind, g.name, g.ship, g.x, g.z, g.fx, g.fz, g.up, now
        -- (NOT WHERE ITS CHOCKS WERE PUT: another aircraft under the same object id (the deck spotting demo stopped
        -- and started again: its statics are made anew and DCS gives them the ids the last ones had), or this one
        -- moved with its chocks in: they are taken away and put again where it stands. The user's run of 2026-11-26:
        -- a restart with the hangar full left the chocks of the run before on 24 empty deck spots.)
        local pl = o.placed
        if o.keys and pl and (pl.name ~= o.name or pl.ship ~= o.ship or (pl.x - o.x) ^ 2 + (pl.z - o.z) ^ 2 > 0.09 or math.abs(pl.fx - o.fx) + math.abs(pl.fz - o.fz) > 0.02 or (math.abs((pl.up or 0) - (o.up or 0)) > 0.3 and not (api.platformAt and api.platformAt(o.x, o.z)))) then
          othersClear(o)
          o.ids, o.placed = nil, nil
        end
      end
    elseif not C.othersSaid then
      C.othersSaid = true
      api.log('chocks: the other Hornets could not be asked for: ' .. tostring(why))
    end
  end
  local budget, made = OTHERS.perFrame, 0
  for id, o in pairs(C.others) do
    local ok, v, why = pcall(api.objarg, id, OWN.state)
    local gone = ok and v == nil and tostring(why):find('no object with that id', 1, true)
    if gone then
      -- (taken away for a player's spawn, or made anew: its chocks off the spot at once; not asked about again)
      othersClear(o)
      o.ids, o.want = nil, false
      C.others[id] = nil
    elseif ok and type(v) == 'number' then
      if v >= 0.5 then pcall(api.objarg, id, OWN.state, OWN.hide) end
      local inNow = v >= OWN.out
      if inNow and not o.want then o.inAt = now end
      o.want = inNow
    end
    if gone then
      -- (nothing more for it)
    elseif o.want and not o.keys and not C.belowDeck(o) then
      if (o.at or -1e9) <= (o.inAt or 0) then
        C.othersWait = true
      elseif budget > 0 then
        budget, made = budget - 1, made + 1
        othersPlace(id, o)
      end
    elseif not o.want and o.keys then
      othersClear(o)
    end
    -- (their spacing kept as ours is: every KEEP seconds)
    if o.ids then
      local keep = now - (o.keptAt or -1e9) >= KEEP
      if keep then o.keptAt = now end
      for _, c in ipairs(o.ids) do
        C.follow(c)
        local g = C.glide(c.t0, c.v, now)
        if g then pcall(api.objarg, c.id, M.ARG, g) elseif keep then c.t0 = nil pcall(api.objarg, c.id, M.ARG, c.v) end
      end
    end
  end
  if made > 0 then
    local n = 0
    for _, o in pairs(C.others) do if o.keys then n = n + 1 end end
    if n ~= C.othersN then
      C.othersN = n
      api.log(string.format('chocks: ours on %d other Hornet(s) (their own hidden)', n))
    end
  end
end

-- ON A MULTIPLAYER CLIENT (the user's first two-PC run, 2026-11-26, on the client: "Saw built in chocks on all spotted
-- aircraft"; "I believe our chocks were there ... but were in the fully closed state"). Model arguments are each PC's
-- own: what the host writes (the Hornets' 23, our chocks' 10) is not seen on a client. And a client has no mission
-- scripting state to ask for the aircraft (the hook's dostring goes to its own "server" state, which runs no mission).
-- So a client finds them through DCS's export API instead (Export.LoGetWorldObjects: every object it knows, statics
-- among them, by its own object ids, which native.objarg takes), allowed on a client only where the server allows object
-- export (server.advanced.allow_object_export; Export.LoIsObjectExportAllowed). Every CLIENT.every seconds: the ships,
-- the Hornets (and lookalikes) and our chocks (CATCC_WheelChock: made by the server). Every frame: a Hornet's own chocks,
-- shown, written OWN.hide, as on the host. Every KEEP seconds: each of our chocks, matched to the nearest Hornet's
-- wheel (left or right of its centre line), given that wheel's spacing (its strut, read here, and its height above the
-- deck: C.wheelAt, as on the host). The client's own jet is a Hornet like the others here (its chocks are the server's).
local CLIENT = { every = 2, near = 4 }
local HORNETS = { ['FA-18C_hornet'] = true, CATCC_HornetLook = true, CATCC_HornetLookF = true }
C.client = { hornets = {}, chocks = {} }

function C.isClient()
  local okm, m = pcall(function() return DCS.isMultiplayer() end)
  local oks, s = pcall(function() return DCS.isServer() end)
  return okm and m == true and oks and s == false
end

-- an export object's axes (x forward, y up, z right; DCS's world: x north, z east): from its Heading and Pitch (a
-- ship's Bank is taken as 0)
local function axes(o)
  local h, p = tonumber(o.Heading) or 0, tonumber(o.Pitch) or 0
  return { math.cos(p) * math.cos(h), math.sin(p), math.cos(p) * math.sin(h) },
    { -math.sin(p) * math.cos(h), math.cos(p), -math.sin(p) * math.sin(h) },
    { -math.sin(h), 0, math.cos(h) }
end

local function sub(a, b) return { (a.x or 0) - (b.x or 0), (a.y or 0) - (b.y or 0), (a.z or 0) - (b.z or 0) } end
local function dot3(a, b) return a[1] * b[1] + a[2] * b[2] + a[3] * b[3] end

-- the world as this PC has it: ships, Hornets (with their place in their ship's frame) and our chocks; or nil, why
function C.clientAsk()
  if not (Export and Export.LoGetWorldObjects) then return nil, 'no export API here' end
  if Export.LoIsObjectExportAllowed then
    local oka, allowed = pcall(Export.LoIsObjectExportAllowed)
    if oka and allowed == false then return nil, 'the server does not allow object export (its allow_object_export)' end
  end
  local okw, objs = pcall(Export.LoGetWorldObjects, 'units')
  if not (okw and type(objs) == 'table') then return nil, 'the world\'s objects could not be read: ' .. tostring(objs) end
  local ships, hornets, chocks = {}, {}, {}
  for id, o in pairs(objs) do
    local name = type(o) == 'table' and o.Name
    if type(o) == 'table' and o.Position then
      if type(o.Type) == 'table' and o.Type.level1 == 3 then
        ships[#ships + 1] = o
      elseif HORNETS[name] then
        hornets[tonumber(id)] = o
      elseif name == M.TYPE then
        chocks[tonumber(id)] = o
      end
    end
  end
  local out = {}
  for id, o in pairs(hornets) do
    local best, bd
    for _, s in ipairs(ships) do
      local d = (o.Position.x - s.Position.x) ^ 2 + (o.Position.z - s.Position.z) ^ 2
      if d < 250 * 250 and (not bd or d < bd) then best, bd = s, d end
    end
    if best then
      local F, U, R = axes(best)
      local d = sub(o.Position, best.Position)
      out[id] = { x = dot3(d, F), up = dot3(d, U), z = dot3(d, R), pos = o.Position, heading = tonumber(o.Heading) or 0 }
    end
  end
  return { hornets = out, chocks = chocks, nShips = #ships }
end

-- a chock's wheel: the nearest Hornet within CLIENT.near m, and which side of its centre line the chock lies
local function chockWheel(c, hornets)
  local best, bd
  for id, h in pairs(hornets) do
    local dx, dz = c.Position.x - h.pos.x, c.Position.z - h.pos.z
    local d = dx * dx + dz * dz
    if d < CLIENT.near * CLIENT.near and (not bd or d < bd) then best, bd = id, d end
  end
  if not best then return nil end
  local h = hornets[best]
  local right = -(c.Position.x - h.pos.x) * math.sin(h.heading) + (c.Position.z - h.pos.z) * math.cos(h.heading)
  return best, right >= 0 and 'right' or 'left'
end

local function client(now)
  local okj, me = pcall(api.jetId)
  me = okj and type(me) == 'number' and me or nil
  local K = C.client
  if now - (K.at or -1e9) >= CLIENT.every then
    K.at = now
    local got, why = C.clientAsk()
    if not got then
      if K.bad ~= why then api.log('chocks (client): ' .. tostring(why)) end
      K.bad, K.hornets, K.chocks = why, {}, {}
    else
      K.bad = nil
      K.hornets = got.hornets
      -- (each chock's spacing: from its wheel, worked out again at every asking)
      local chocks, fitted, total = {}, 0, 0
      for cid, c in pairs(got.chocks) do
        total = total + 1
        local hid, key = chockWheel(c, got.hornets)
        if hid then
          local h = got.hornets[hid]
          local okc, strut = pcall(api.objarg, hid, STRUT_ARG[key])
          strut = (okc and type(strut) == 'number') and strut or STRUT_REF
          local axle = C.wheelAt(h.up, strut, api.platformAt and api.platformAt(h.x, h.z) or nil)
          local w = WHEELS[key == 'left' and 1 or 2]
          chocks[cid] = { v = C.fitFor(w.r, axle), at = (K.chocks[cid] or {}).at }
          fitted = fitted + 1
        end
      end
      K.chocks = chocks
      local n = 0
      for _ in pairs(got.hornets) do n = n + 1 end
      local said = string.format('%d ship(s), %d Hornet(s), %d of our chocks (%d matched to a wheel)', got.nShips, n, total, fitted)
      if K.said ~= said then
        K.said = said
        api.log('chocks (client): from the export API: ' .. said)
      end
    end
  end
  for id in pairs(K.hornets) do
    if id ~= me then
      local ok, v = pcall(api.objarg, id, OWN.state)
      if ok and type(v) == 'number' and v >= 0.5 then pcall(api.objarg, id, OWN.state, OWN.hide) end
    end
  end
  for cid, c in pairs(K.chocks) do
    if now - (c.at or -1e9) >= KEEP then
      c.at = now
      pcall(api.objarg, cid, M.ARG, c.v)
    end
  end
end

-- every frame: the Hornet's own chocks; the sweep; each chock's argument written again every KEEP seconds. A message
-- for the panel's last line, or nil
function C.tick()
  local now = api.now()
  local okm, msg = pcall(own, now)
  if not okm then
    if not C.ownErr then api.log('chocks: the Hornet\'s own chocks: ' .. tostring(msg)) end
    C.ownErr, msg = true, nil
  end
  local oko, erro = pcall(C.isClient() and client or others, now)
  if not oko and not C.othersErr then
    C.othersErr = true
    api.log('chocks: the other Hornets: ' .. tostring(erro))
  end
  if not C.list then return msg end
  if C.sweepOn then
    local a = 0.5 - 0.5 * math.cos(2 * math.pi * ((now - (C.sweepT0 or 0)) / SWEEP))
    local v = M.MIN + (M.MAX - M.MIN) * a
    for _, e in ipairs(C.list) do write(e, v) end
    return msg
  end
  for _, e in ipairs(C.list) do
    local g = C.glide(e.t0, e.v, now)
    if g then
      write(e, g)
    elseif now - (e.at or -1e9) >= KEEP then
      e.t0 = nil
      write(e, e.v)
    end
  end
  return msg
end

-- a mission starts or ends: its statics are gone with it (the moves are kept)
function C.reset()
  C.list, C.base, C.sweepOn, C.which, C.auto, C.ownState, C.ownJet, C.watch = nil, nil, false, 'all', nil, nil, nil, nil
  C.others, C.othersAt, C.othersWait, C.othersN, C.othersSaid = {}, nil, nil, nil, nil
  C.client = { hornets = {}, chocks = {} }
end

return C
