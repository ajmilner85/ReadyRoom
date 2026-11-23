-- THE HANGAR'S TOWS, SOLVED: for every aircraft of the user's hangar plan, in HIS OWN ORDER, a tow onto its place on its
-- elevator that can be driven with everything that is still down there at its turn. Run by hangar_solve.py (in the test
-- rig: the hook, the demo and their own planners under DCS's Lua 5.1); what it finds goes into crewtest_hangar.lua
-- (`tows`, by the plan's place), and the demo drives those ways (crewtest_demo.lua: towOf).
--
-- THE USER, 2026-11-18: "I'm not even going to run the demo anymore unless we have paths for all aircraft. I've
-- described what I believe is the correct unloading sequence to guide you." His sequence, as he wrote it:
--   EL1 1, EL1 2, EL1 3, EL2 1, EL2 2, EL1 4, EL2 3, EL2 4, EL1 5 and 6, EL2 5 and 6,
--   EL3 1, EL4 1, EL4 2, EL3 2, EL3 3, EL3 4, EL4 3, EL4 4, EL3 5 and 6, EL4 5 and 6
-- and the side of the platform each goes on ("left side of EL1 (assume looking from starboard to port)": looking to
-- port, left is AFT: the plan's place 1; right is FORWARD: place 2):
--   EL1: 1 right (it is pushed straight back; 2 goes left), 2 left, 3 left (4 goes right), 4 right
--   EL2: 1 left, 2 right, 3 right, 4 left      EL3: 1 right, 2 left, 3 right, 4 left      EL4: 1 right, 2 left, 3 right, 4 left
--   the fifth and sixth of each ("plenty of room"): whichever place can be driven.
-- His rule: "Tugs may connect to aircraft with the nosewheel turned initially if required": tried when the tractor
-- cannot get onto the nose line, or no tow can be driven from there (alpha: 10 to 70 degrees either way, by tens).
--
-- WHAT STANDS IN THE WAY AT AN AIRCRAFT'S TURN: every aircraft later in his order, where it is parked; an aircraft
-- that has gone before it but whose partner on the platform has not (it stands on its place on the platform. If the
-- platform is up it stands short of the door instead, where it may be in the way: the demo then waits until the
-- platform is down and it has been pushed on); and, for the after elevators' aircraft (3 and 4, which work while 1 and 2 do),
-- every aircraft of elevators 1 and 2 where it is parked, whether it has gone or not (if no tow can be driven so:
-- with those gone, as his order has it: `relaxed`).
--
-- THE SEARCH, for one aircraft onto one place (all of it driven in the head by the demo's towOf: the hook's own Tow.Fd.sim
-- and Tow.Fd.back against the hangar's map, what the user marked, and the other aircraft):
--   pushed only        the main wheels' way: (straight back a little,) to a corner on the place's line, out along it;
--   pulled, then pushed  the tractor straight ahead 3 .. 32 m; or ahead and round one bend (15 .. 130 degrees either way)
--                      and on 7 .. 28 m; or round two bends; then pushed as above from where that leaves it.
-- One reversal at most (the user's rule from the start). Of what can be driven: the fewest corners first; then the
-- most room to the other aircraft (up to 1.5 m), then the shortest.
--
-- THE TRACTORS' OWN WAYS (2026-11-18: found as the demo ran, by a way-finder through square cells whose corners a
-- tractor cannot always follow, they failed or held a tow up for minutes, depending on where each tractor happened to
-- stand): planned HERE, for a tractor as it drives (ROUTE: forward only, turning on 4.6 m and more; straight ahead or
-- to either side a metre at a time, the cheapest way through its places and headings: A*), held against the hangar's
-- floor (1.15 m all round its own point), every aircraft's wheels (0.35 m) and every place a tractor waits at (4.5 m:
-- a tractor that stands idle is never in another's way), and then driven in the head by the hook's own Tow.Fd.simSolo:
--   ways   from every waiting place (the plan's homes and rest: "posts") to the aircraft's hook-up place: head on for
--          its front hitch, or past it to back onto the bar's ring; as the tractor stands, or after backing a quarter
--          circle to either side (side);
--   out    from where the tow leaves the tractor, back to every post (onto it the way a tractor stands there).
-- With an aircraft's tow go the ways for it: the demo takes the tractor that stands at a post with a way, and sends it
-- back by one; its own way-finder is what is left when none fits.
ROUTES_SRC = ROUTES_REAL
STATIC_UP = 21.9
for i = 0, 7 do add(105 + i, 'catcc-t' .. i, '1: catcc-t' .. i, 12 + i, 33, SHIP_A) end
PLAYER = false
HANDLER.onSimulationStart()
frames(1)
CAMAT = { f = 0, s = 0, up = 300, lf = 0, ls = 1 }
HOTKEYS['Ctrl+Shift+F9']()
frames(2)
local D = CATCC_DEMO
local lab = D.lab()
local H = lab.H
local t00 = os.clock()

-- (by elevator and turn, as the plan has them; the third: the place on the platform, if it is given. THE ORDER FOUND IN
-- THE RIG (2026-11-20: hangar_plan.py's RIG_ORDER says which aircraft that is): his, but elevator 4's third and fourth
-- take whichever place can be driven. USER_ORDER=true: his, with his places, as before.)
local ORDER = { { 1, 1, 2 }, { 1, 2, 1 }, { 1, 3, 1 }, { 2, 1, 1 }, { 2, 2, 2 }, { 1, 4, 2 }, { 2, 3, 2 }, { 2, 4, 1 }, { 1, 5 }, { 1, 6 }, { 2, 5 }, { 2, 6 },
  { 3, 1, 2 }, { 4, 1, 2 }, { 4, 2, 1 }, { 3, 2, 1 }, { 3, 3, 2 }, { 3, 4, 1 }, { 4, 3 }, { 4, 4 }, { 3, 5 }, { 3, 6 }, { 4, 5 }, { 4, 6 } }
if USER_ORDER then
  ORDER = { { 1, 1, 2 }, { 1, 2, 1 }, { 1, 3, 1 }, { 2, 1, 1 }, { 2, 2, 2 }, { 1, 4, 2 }, { 2, 3, 2 }, { 2, 4, 1 }, { 1, 5 }, { 1, 6 }, { 2, 5 }, { 2, 6 },
    { 3, 1, 2 }, { 4, 1, 2 }, { 4, 2, 1 }, { 3, 2, 1 }, { 3, 3, 2 }, { 3, 4, 1 }, { 4, 3, 2 }, { 4, 4, 1 }, { 3, 5 }, { 3, 6 }, { 4, 5 }, { 4, 6 } }
end
if ONLY then -- (a test's wish, or to look at one: "3/3,4/2")
  local keep = {}
  for el, turn in tostring(ONLY):gmatch('(%d)/(%d)') do keep[el .. '/' .. turn] = true end
  ONLY = keep
end

-- the aircraft of the hangar, by elevator and turn
local byKey, bySlot = {}, {}
for _, sl in ipairs(H.slots) do bySlot[sl.n] = sl end
local planes = {}
for _, a in ipairs(D.aircraft) do
  if a.level == 'hangar' and a.slot then
    local sl = bySlot[a.slot]
    byKey[sl.el .. '/' .. sl.turn] = a
    planes[#planes + 1] = a
    a.el, a.turn = sl.el, sl.turn
  end
end
rec(string.format('hangar: %d aircraft, %d tractors', #planes, #D.tugs))
for _, sl in ipairs(H.slots) do rec(string.format('SLOT %d %.2f %.2f %.1f', sl.n, sl.x, sl.z, math.deg((math.atan2 or math.atan)(sl.fz, sl.fx)) % 360)) end

local function unit(x, z)
  local l = math.sqrt(x * x + z * z)
  return x / l, z / l
end
local function ang(ux, uz, vx, vz)
  local d = (ux * vx + uz * vz) / math.max(1e-9, math.sqrt(ux * ux + uz * uz) * math.sqrt(vx * vx + vz * vz))
  return math.deg(math.acos(math.max(-1, math.min(1, d))))
end

-- gone[a]: it has left its place; stood[a] = { k, st }: it stands on / short of its platform (its partner has not come)
local gone, stood = {}, {}
local function obstacle(x, z, fx, fz, name)
  return { x = x, z = z, fx = fx, fz = fz, name = name, half = 4.2, shape = lab.shape(x, z, fx, fz) }
end
local function othersFor(a, relaxed)
  local out = {}
  local aft = a.el >= 3
  for _, o in ipairs(planes) do
    if o ~= a then
      local there = not gone[o]
      if aft and o.el <= 2 and not relaxed then there = true end
      if there then out[#out + 1] = obstacle(o.x, o.z, o.fx, o.fz, o.name) end
      if gone[o] and stood[o] then
        local S = H.elevators[stood[o].k].stations[stood[o].st]
        local s = S.fz < 0 and 1 or -1
        out[#out + 1] = obstacle(S.x, S.z, S.fx, S.fz, o.name .. ' (on the platform)')
        -- (DOOR_TOO: and short of the door, where it waits while the platform is up: a tow that can be driven so can
        -- begin before the platform is back: both of a pair then wait at the door)
        if DOOR_TOO then out[#out + 1] = obstacle(S.x, s * (s > 0 and lab.READY.stbd or lab.READY.port), S.fx, S.fz, o.name .. ' (short of the door)') end
      end
    end
  end
  return out
end

-- the pushes worth trying: { kz, ease, rho[, pts] }
local function pushesFor(k, st, tier)
  local S = H.elevators[k].stations[st]
  local s = S.fz < 0 and 1 or -1
  local mFz = S.z + s * 2.438
  local out = {}
  for _, d in ipairs({ 3, 5, 7, 9, 11, 13, 15, 18, 21, 24, 27, 30, 33 }) do
    for _, ease in ipairs({ false, 3, 6 }) do
      for _, rho in ipairs({ 6, 4, 9, 12 }) do out[#out + 1] = { kz = math.floor((mFz - s * d) * 100 + 0.5) / 100, ease = ease, rho = rho } end
    end
  end
  return out
end
-- (from where the pull ends: the main wheels at m, the nose f: the corner lies behind the aircraft, not more than 100
-- degrees off its tail, 1.5 m and more away; the bend there into the place's line is 115 degrees at most)
local function pushFilter(mx, mz, fx, fz, v, S, mF)
  local s = S.fz < 0 and 1 or -1
  local sx, sz = mx, mz
  if v.ease then sx, sz = mx - fx * v.ease, mz - fz * v.ease end
  local vx, vz = S.x - sx, v.kz - sz
  local l = math.sqrt(vx * vx + vz * vz)
  if l < 1.5 then return math.abs(fx) < 0.2 and -fz * s > 0 end
  if s * (mF.z - v.kz) < 2 then return false end
  return ang(vx, vz, -fx, -fz) <= 100 and ang(vx, vz, 0, s) <= 115
end

-- the pulls: the tractor's corners from where it is hooked on (p0, pointing u); tier 1 straight, 2 one bend, 3 two
local function pullsFor(p0, ux, uz, tier)
  local out = {}
  local function dir(deg)
    local c, sn = math.cos(math.rad(deg)), math.sin(math.rad(deg))
    return ux * c - uz * sn, ux * sn + uz * c
  end
  if tier == 1 then
    for _, d in ipairs({ 3, 5, 7, 9, 11, 13, 15, 18, 21, 24, 28, 32 }) do out[#out + 1] = { len = d, { p0[1] + ux * d, p0[2] + uz * d } } end
  elseif tier == 2 then
    for _, d1 in ipairs({ 2, 5, 8, 12, 16, 20 }) do
      for _, th in ipairs({ 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 110, -110, 130, -130 }) do
        local vx, vz = dir(th)
        for _, d2 in ipairs({ 7, 10, 14, 18, 23, 28 }) do
          local c1 = { p0[1] + ux * d1, p0[2] + uz * d1 }
          out[#out + 1] = { len = d1 + d2, c1, { c1[1] + vx * d2, c1[2] + vz * d2 } }
        end
      end
    end
  else
    for _, d1 in ipairs({ 3, 8, 14 }) do
      for _, th in ipairs({ 30, -30, 60, -60, 90, -90, 120, -120 }) do
        local vx, vz = dir(th)
        for _, d2 in ipairs({ 8, 14, 20 }) do
          for _, th2 in ipairs({ 30, -30, 60, -60, 90, -90 }) do
            local wx, wz = dir(th + th2)
            for _, d3 in ipairs({ 8, 14, 20 }) do
              local c1 = { p0[1] + ux * d1, p0[2] + uz * d1 }
              local c2 = { c1[1] + vx * d2, c1[2] + vz * d2 }
              out[#out + 1] = { len = d1 + d2 + d3, c1, c2, { c2[1] + wx * d3, c2[2] + wz * d3 } }
            end
          end
        end
      end
    end
  end
  -- (to the centimetre: as the plan will have them)
  for _, pull in ipairs(out) do
    for _, q in ipairs(pull) do q[1], q[2] = math.floor(q[1] * 100 + 0.5) / 100, math.floor(q[2] * 100 + 0.5) / 100 end
  end
  table.sort(out, function(p, q) return p.len < q.len end)
  return out
end

-- ---------------------------------------------------------------- a tractor's way, as it drives
local Tow, TOW = lab.Tow, lab.TOW
local posts = {}
for _, h in ipairs(H.homes) do posts[#posts + 1] = h end
for _, h in ipairs(H.rest or {}) do posts[#posts + 1] = h end
local hangarTugs = {}
for _, t in ipairs(D.tugs) do
  if t.level == 'hangar' then hangarTugs[#hangarTugs + 1] = t end
end
local probe = hangarTugs[1]
-- (the tractors themselves are put out of the way while the solver works)
for _, t in ipairs(hangarTugs) do t.d = { x = 1e6, z = 1e6, hx = 1, hz = 0, v = 0 } end
-- (floor, wheels: the room a way is planned with: ROOM[1] first (1.5 m of floor all round the tractor's point, 0.8 m to
-- another aircraft's wheels), ROOM[2] for what cannot be had so (1.15 m, 0.35 m: the hook's own measures are 1.0 and 0.1).
-- OFF: a way must be driveable by a tractor that stands a little off its place too: 12 cm to either side and 2.5
-- degrees round either way: as the demo ran, a tractor came to its post 10 cm and a few degrees off, and a way planned
-- to the centimetre from the post itself went through a wheel. (With 0.3 m and 6 degrees there was no way to the two
-- after posts at all, and to the aftmost aircraft from one post of six. The demo sets a tractor square on its post
-- when it parks there, so what is left is where a tow leaves a tractor: a few centimetres.))
local ROOM = { { floor = 1.5, wheels = 0.8 }, { floor = 1.15, wheels = 0.35 } }
local OFF = { { 0.12, 2.5 }, { -0.12, -2.5 }, { 0.12, -2.5 }, { -0.12, 2.5 } }
local ROUTE = { R = 4.6, step = 1.5, cell = 0.75, nh = 16, floor = 1.15, wheels = 0.35, post = 4.5, postCost = 8, max = 120000 }
local atan2 = math.atan2 or math.atan

-- may a tractor be here (its own point, its heading): false (the floor, another aircraft's wheels), or what a step
-- here costs: 1; 8 within 4.5 m of a place a tractor waits at (a way keeps off those where it can: one that passes a
-- post is of no use while a tractor stands there)
local function tugOk(x, z, hx, hz, all)
  if not Tow.Fd.on(x, z, ROUTE.floor) then return false end
  local T
  for _, o in ipairs(all) do
    if (o.x - x) ^ 2 + (o.z - z) ^ 2 < 169 then
      T = T or Tow.Fd.tugShape(x, z, hx, hz)
      if Tow.Fd.gap(T, o.shape.low) < ROUTE.wheels then return false end
    end
  end
  for _, q in ipairs(posts) do
    if (q.x - q.hx * 0.6 - x) ^ 2 + (q.z - q.hz * 0.6 - z) ^ 2 < ROUTE.post ^ 2 then return ROUTE.postCost end
  end
  return 1
end

-- EVERY WAY AT ONCE: from a pose, forward (dir 1: where can a tractor get to from here) or backward (dir -1: from
-- where can a tractor get here), the cheapest first (Dijkstra over its place, in cells of 0.75 m, and its heading, in
-- sixteenths of a turn; a step 1.5 m straight or round to either side on R), until every target is found: a target is
-- a pose to arrive at (dir 1) or to set off from (dir -1); it is found when the search has a pose on the target's own
-- line, 1.2 to 9 m short of it (beyond it), within 0.4 m and 12 degrees, with the straight between them free.
-- Returns found[tag] = the way's points, in the order they are driven. Run inside the hangar's surroundings.
local function spread(dir, seed, all, targets, R)
  R = R or ROUTE.R
  local step, c, nh = ROUTE.step, ROUTE.cell, ROUTE.nh
  local function key(x, z, th)
    local hb = math.floor(th / (2 * math.pi / nh) + 0.5) % nh
    return (math.floor(x / c) + 400) * 100000 + (math.floor(z / c) + 100) * 100 + hb
  end
  local heap, hn = {}, 0
  local function push(n)
    hn = hn + 1
    heap[hn] = n
    local i = hn
    while i > 1 do
      local q = math.floor(i / 2)
      if heap[q].g <= heap[i].g then break end
      heap[q], heap[i] = heap[i], heap[q]
      i = q
    end
  end
  local function pop()
    local top = heap[1]
    heap[1] = heap[hn]
    heap[hn] = nil
    hn = hn - 1
    local i = 1
    while true do
      local l, r, m = 2 * i, 2 * i + 1, i
      if l <= hn and heap[l].g < heap[m].g then m = l end
      if r <= hn and heap[r].g < heap[m].g then m = r end
      if m == i then break end
      heap[m], heap[i] = heap[i], heap[m]
      i = m
    end
    return top
  end
  local found, left = {}, #targets
  if not tugOk(seed.x, seed.z, seed.hx, seed.hz, all) then return found, 0 end
  local seen = {}
  push({ x = seed.x, z = seed.z, th = atan2(seed.hz, seed.hx), g = 0 })
  local n = 0
  while hn > 0 and n < ROUTE.max and left > 0 do
    local cur = pop()
    local k = key(cur.x, cur.z, cur.th)
    if not seen[k] then
      seen[k] = true
      n = n + 1
      for _, t in ipairs(targets) do
        if not found[t.tag] then
          local dx, dz = cur.x - t.x, cur.z - t.z
          local along, lat = (dx * t.hx + dz * t.hz) * -dir, math.abs(dx * -t.hz + dz * t.hx)
          if along >= (t.min or 1.2) and along <= 9 and lat <= 0.4 and math.abs((cur.th - t.th + math.pi) % (2 * math.pi) - math.pi) <= math.rad(12) then
            local good = true
            for d = 0, along, 0.5 do
              if not tugOk(t.x - dir * t.hx * d, t.z - dir * t.hz * d, t.hx, t.hz, all) then good = false break end
            end
            if good then
              local chain = {}
              local q = cur
              while q do
                chain[#chain + 1] = { q.x, q.z }
                q = q.parent
              end
              local pts = {}
              if dir > 0 then
                for i = #chain, 1, -1 do pts[#pts + 1] = chain[i] end
                pts[#pts + 1] = { t.x, t.z }
              else
                pts[1] = { t.x, t.z }
                for i = 1, #chain do pts[#pts + 1] = chain[i] end
              end
              found[t.tag], left = pts, left - 1
            end
          end
        end
      end
      for _, kap in ipairs({ 0, 1 / R, -1 / R }) do
        local thm, th2 = cur.th + dir * kap * step / 2, cur.th + dir * kap * step
        local x2, z2 = cur.x + dir * step * math.cos(thm), cur.z + dir * step * math.sin(thm)
        if not seen[key(x2, z2, th2)] then
          local c1 = tugOk((cur.x + x2) / 2, (cur.z + z2) / 2, math.cos(thm), math.sin(thm), all)
          local c2 = c1 and tugOk(x2, z2, math.cos(th2), math.sin(th2), all)
          if c2 then push({ x = x2, z = z2, th = th2, g = cur.g + step * (kap == 0 and 1 or 1.15) * math.max(c1, c2), parent = cur }) end
        end
      end
    end
  end
  return found, n
end

-- the way thinned: a point kept where the way has turned 12 degrees or come 6 m since the last kept
local function thin(pts)
  local out = { pts[1] }
  local lastDir
  for i = 2, #pts - 1 do
    local a, b = out[#out], pts[i]
    local dir = atan2(pts[i + 1][2] - b[2], pts[i + 1][1] - b[1])
    lastDir = lastDir or atan2(b[2] - a[2], b[1] - a[1])
    local turn = math.abs((dir - lastDir + math.pi) % (2 * math.pi) - math.pi)
    if turn > math.rad(12) or math.sqrt((b[1] - a[1]) ^ 2 + (b[2] - a[2]) ^ 2) >= 6 then
      out[#out + 1] = b
      lastDir = dir
    end
  end
  out[#out + 1] = pts[#pts]
  return out
end

-- where a tractor sets off from, standing at a pose: as it stands (0), after backing a quarter circle to either side
-- (1 / -1: the demo's quarterBack), or after backing straight 6 or 10 m ('b6', 'b10'): nil if it cannot
local function startOf(env, from, all, spec)
  if spec == 0 then return from end
  if type(spec) == 'string' then
    local L = tonumber(spec:sub(2))
    for d = 0.5, L, 0.5 do
      if not lab.within(env, tugOk, from.x - from.hx * d, from.z - from.hz * d, from.hx, from.hz, all) then return nil end
    end
    return { x = from.x - from.hx * L, z = from.z - from.hz * L, hx = from.hx, hz = from.hz }
  end
  probe.d = { x = from.x, z = from.z, hx = from.hx, hz = from.hz, v = 0 }
  local arc, d1 = lab.within(env, lab.quarterBack, probe, spec, all)
  probe.d = { x = 1e6, z = 1e6, hx = 1, hz = 0, v = 0 }
  return arc and d1 or nil
end

-- every way a tractor at `from` can set off: { side, back, d (where its way begins), alts (the same for a tractor
-- standing a little off: OFF) }; one that a tractor a little off cannot begin is left out
local function starts(env, from, all, specs)
  local out = {}
  for _, spec in ipairs(specs) do
    local d = startOf(env, from, all, spec)
    if d then
      local alts, good = {}, true
      for _, o in ipairs(OFF) do
        local c, sn = math.cos(math.rad(o[2])), math.sin(math.rad(o[2]))
        local f2 = { x = from.x - from.hz * o[1], z = from.z + from.hx * o[1], hx = from.hx * c - from.hz * sn, hz = from.hx * sn + from.hz * c }
        local d2 = startOf(env, f2, all, spec)
        if d2 then alts[#alts + 1] = d2 else good = false end
      end
      if good then out[#out + 1] = { side = type(spec) == 'number' and spec or 0, back = type(spec) == 'string' and tonumber(spec:sub(2)) or nil, d = d, alts = alts } end
    end
  end
  return out
end

-- a way driven in the head as the demo's tractor will drive it (thinned, or as it was found), from where it begins
-- and from where it begins for a tractor a little off its place: the points, or nil
-- (AS IT IS STORED: its points to the centimetre; and with 0.3 m to another aircraft's wheels where the hook asks 0.1:
-- a way that passed the hook's own measure by millimetres here did not pass it in the demo, where its points are the
-- plan's, written to the centimetre: the rig, 2026-11-18)
local function driven(env, st, pts, goal, all)
  local touch = TOW.tugTouch
  TOW.tugTouch = 0.3
  local out
  for _, way in ipairs({ thin(pts), pts }) do
    local path = {}
    for _, q in ipairs(way) do path[#path + 1] = { math.floor(q[1] * 100 + 0.5) / 100, math.floor(q[2] * 100 + 0.5) / 100 } end
    local good = lab.within(env, Tow.Fd.simSolo, st.d, path, {}, goal, all)
    for _, d2 in ipairs(st.alts or {}) do
      good = good and lab.within(env, Tow.Fd.simSolo, d2, path, {}, goal, all)
    end
    if good and not out then out = path end
  end
  TOW.tugTouch = touch
  return out
end

-- THE WAYS TO A PLACE (G; goal: what the hook holds the tractor's end against) FROM EVERY POST: one search backward
-- from G, with room to spare; then, for the posts still without a way, with the least room. Returns ways[post] =
-- { side, back, pts }, and how many.
local function waysIn(env, G, goal, all)
  local lists = {}
  for i, P in ipairs(posts) do lists[i] = starts(env, P, all, { 0, 1, -1, 'b6', 'b10' }) end
  local ways, n = {}, 0
  for _, room in ipairs(ROOM) do
    ROUTE.floor, ROUTE.wheels = room.floor, room.wheels
    local targets = {}
    for i = 1, #posts do
      if not ways[i] then
        for j, st in ipairs(lists[i]) do
          targets[#targets + 1] = { x = st.d.x, z = st.d.z, hx = st.d.hx, hz = st.d.hz, th = atan2(st.d.hz, st.d.hx), tag = i * 10 + j }
        end
      end
    end
    local found = #targets > 0 and lab.within(env, spread, -1, G, all, targets) or nil
    for i = 1, #posts do
      for j, st in ipairs(lists[i]) do
        local pts = type(found) == 'table' and found[i * 10 + j]
        if pts and not ways[i] then
          local path = driven(env, st, pts, goal, all)
          if path then ways[i], n = { side = st.side, back = st.back, pts = path }, n + 1 end
        end
      end
    end
  end
  ROUTE.floor, ROUTE.wheels = ROOM[2].floor, ROOM[2].wheels
  return ways, n
end

-- THE WAYS FROM A POSE TO EVERY POST: one search forward from each place the tractor can set off from (specs), with
-- room to spare, then with the least; onto a post it comes straight for 3 m and more
-- (places: other places than the posts to get to: { x, z, hx, hz, min (the straight it comes in on), goal (what the hook
-- holds its end against) } each)
local function waysOut(env, from, all, specs, places)
  local ways, n = {}, 0
  local list = starts(env, from, all, specs)
  local dests = places or posts
  for _, room in ipairs(ROOM) do
    ROUTE.floor, ROUTE.wheels = room.floor, room.wheels
    for _, st in ipairs(list) do
      local targets = {}
      for i, P in ipairs(dests) do
        if not ways[i] then targets[#targets + 1] = { x = P.x, z = P.z, hx = P.hx, hz = P.hz, th = atan2(P.hz, P.hx), tag = i, min = P.min or 3 } end
      end
      local found = #targets > 0 and lab.within(env, spread, 1, st.d, all, targets) or nil
      for i, P in ipairs(dests) do
        local pts = type(found) == 'table' and found[i]
        if pts and not ways[i] then
          local path = driven(env, st, pts, P.goal or { x = P.x, z = P.z, hx = P.hx, hz = P.hz }, all)
          if path then ways[i], n = { side = st.side, back = st.back, pts = path }, n + 1 end
        end
      end
    end
  end
  ROUTE.floor, ROUTE.wheels = ROOM[2].floor, ROOM[2].wheels
  return ways, n
end

local function fmtPts(pts)
  local out = {}
  for _, q in ipairs(pts) do out[#out + 1] = string.format('{ %.2f, %.2f }', q[1], q[2]) end
  return '{ ' .. table.concat(out, ', ') .. ' }'
end

local function fmtWays(ws)
  local out = {}
  for i = 1, #posts do
    local w = ws[i]
    if w then out[#out + 1] = string.format('[%d] = { side = %d%s%s, pts = %s }', i, w.side, w.back and string.format(', back = %d', w.back) or '', w.front and ', front = true' or '', fmtPts(w.pts)) end
  end
  return '{ ' .. table.concat(out, ', ') .. ' }'
end

-- WHICH WAY A TRACTOR STANDS AT EACH POST: the way that connects best. With the hangar as it is packed, the ways from
-- post to post are planned with every post standing both ways (nose aft, nose forward); a post then stands the way
-- that has the more other posts it can be reached from AND gets to (the lesser of the two counts; then their sum;
-- then as the plan has it). Said (POST lines): hangar_plan.py gives the plan's homes and rest those headings.
-- (EXTRA_POSTS = 'x,z;x,z': more places to look at; POSTS_ONLY: only this is done.)
do
  if EXTRA_POSTS then
    for x, z in tostring(EXTRA_POSTS):gmatch('(-?[%d.]+),(-?[%d.]+)') do posts[#posts + 1] = { x = tonumber(x), z = tonumber(z), hx = -1, hz = 0 } end
  end
  local all0 = {}
  for _, o in ipairs(planes) do all0[#all0 + 1] = obstacle(o.x, o.z, o.fx, o.fz, o.name) end
  local n = #posts
  local real = posts
  -- (both ways: 2 n candidates; candidate c stands for post (c - 1) % n + 1, nose aft if c <= n)
  local cand = {}
  for c = 1, 2 * n do
    local P = real[(c - 1) % n + 1]
    cand[c] = { x = P.x, z = P.z, hx = c <= n and -1 or 1, hz = 0 }
  end
  posts = cand
  local reach = {}
  for c = 1, 2 * n do reach[c] = waysOut(lab.ENV, cand[c], all0, { 0, 1, -1, 'b6', 'b10' }) end
  posts = real
  for i, P in ipairs(real) do
    local best, bestScore
    for _, c in ipairs({ P.hx < 0 and i or i + n, P.hx < 0 and i + n or i }) do
      -- (to and from the other posts, whichever way those stand)
      local outs, ins = 0, 0
      for j = 1, n do
        if j ~= i then
          if reach[c][j] or reach[c][j + n] then outs = outs + 1 end
          if reach[j][c] or reach[j + n][c] then ins = ins + 1 end
        end
      end
      local score = math.min(outs, ins) * 100 + outs + ins
      if not bestScore or score > bestScore then best, bestScore = c, score end
      rec(string.format('POSTWAY %d (%.1f / %.1f) nose %s: gets to %d others, reached from %d', i, P.x, P.z, cand[c].hx < 0 and 'aft' or 'forward', outs, ins))
    end
    P.hx, P.hz = cand[best].hx, 0
    rec(string.format('POST %d %.1f %.1f %d', i, P.x, P.z, P.hx))
  end
  if POSTS_ONLY then ORDER = {} end
end

-- FROM POST TO POST (hops): a tow may have a way for a tractor from a few posts only (the aftmost aircraft: from two
-- of ten): a tractor that stands at another post first goes to one of those. Planned with the hangar as it is packed
-- (every aircraft where it is parked: a way that can be driven so can be driven whatever has gone since).
if not NO_WAYS then
  local all0 = {}
  for _, o in ipairs(planes) do all0[#all0 + 1] = obstacle(o.x, o.z, o.fx, o.fz, o.name) end
  for i, P in ipairs(posts) do
    local ws, n = waysOut(lab.ENV, P, all0, { 0, 1, -1, 'b6', 'b10' })
    ws[i] = nil
    rec(string.format('HOP [%d] = %s, -- from post %d (%.1f / %.1f) to %d others', i, fmtWays(ws), i, P.x, P.z, n - (n > 0 and 1 or 0)))
  end
end

-- where the tractor stops for an aircraft, the bar turned alpha: head on (FRONT.run short of its front pintle in the
-- ring), or past the hook-up place by 2 m and more, facing away, to back onto the ring
local function goalsFor(a, alpha, env)
  local fx, fz = unit(a.fx, a.fz)
  local nx, nz = a.x + fx * TOW.noseGear, a.z + fz * TOW.noseGear
  local ux, uz = D.turned(fx, fz, alpha)
  local reach = lab.reach()
  local uF = reach - (TOW.hitch - TOW.hitchFront) + lab.FRONT.run
  local goals = { front = { G = { x = nx + ux * uF, z = nz + uz * uF, hx = -ux, hz = -uz } } }
  goals.front.goal = goals.front.G
  for _, run in ipairs(lab.ALONG.run) do
    local gx, gz = nx + ux * (reach + run), nz + uz * (reach + run)
    if not goals.rear and lab.within(env, Tow.Fd.on, gx, gz, 1.2) then
      goals.rear = { G = { x = gx, z = gz, hx = ux, hz = uz }, run = run }
      goals.rear.goal = { x = gx, z = gz, hx = ux, hz = uz, turnOk = lab.ALONG.turnOk }
    end
  end
  return goals
end

-- can a tractor get to it, the bar turned alpha: its ways from the posts, head on and for its rear hitch (kept: the
-- tow's own ways are these)
local function reachable(a, oth, env, alpha)
  local fx, fz = unit(a.fx, a.fz)
  local all = { obstacle(a.x, a.z, fx, fz, a.name) }
  for _, o in ipairs(oth) do all[#all + 1] = o end
  local goals = goalsFor(a, alpha, env)
  local R = { n = 0 }
  for _, kind in ipairs({ 'front', 'rear' }) do
    if goals[kind] then
      local ways, n = waysIn(env, goals[kind].G, goals[kind].goal, all)
      R[kind], R.n = ways, R.n + n
    end
  end
  if R.n == 0 then return nil, 'no way for a tractor from any post' end
  return R
end

-- one aircraft onto one place: the tow (T), or nil and why
local function solve(a, k, st, relaxed)
  local oth = othersFor(a, relaxed)
  local env = lab.hangarEnv(a, k)
  local fx, fz = unit(a.fx, a.fz)
  local nx, nz = a.x + fx * 3.005, a.z + fz * 3.005
  local reach = lab.reach()
  local pushes = pushesFor(k, st)
  local whys, tried = {}, 0
  local function note(w)
    w = tostring(w):gsub('%(near .*$', ''):gsub('%([-%d]+ m forward.*$', '')
    whys[w] = (whys[w] or 0) + 1
  end
  -- (QUICK: the nose wheel straight, and pushed only or pulled straight: the try with its partner short of the door)
  for _, alpha in ipairs(QUICK and { 0 } or { 0, 10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60, 70, -70 }) do
    D.tried = {}
    local how, whyR = reachable(a, oth, env, alpha)
    if DIAG then rec(string.format('DIAG %d/%d alpha %d: %s (%.0f s)', a.el, a.turn, alpha, how and (how.n .. ' ways for a tractor') or tostring(whyR), os.clock() - t00)) end
    if not how then
      note('alpha ' .. alpha .. ': no tractor gets to it: ' .. tostring(whyR))
    else
      local ux, uz = D.turned(fx, fz, alpha)
      local p0 = { nx + ux * reach, nz + uz * reach }
      -- (THE TOW THAT TAKES THE LEAST TIME (the user, 2026-11-18, after the run: "The very last tow took forever": it
      -- was pushed 117 m, tail first, at a push's pace: the fewest corners had come first). Pushed only and pulled
      -- straight are always both tried; pulled round a bend as well if the best of those takes more than 70 s. A tow's
      -- time: its pull at the pace of a tow, its push at a push's (the demo's towOf: secs); 8 s are worth 1 m of room
      -- to another aircraft (up to 1.5 m).)
      local best
      for tier = 0, (QUICK and 1 or DEEP and 3 or 2) do
        local pulls = tier == 0 and { false } or pullsFor(p0, ux, uz, tier)
        local found = 0
        for _, pull in ipairs(pulls) do
          local T = { st = st, alpha = alpha, pull = pull or nil, pushes = pushes, filter = pushFilter }
          tried = tried + 1
          local plan, len, gap, steer = lab.within(env, lab.towOf, a, k, st, oth, false, T)
          if plan then
            found = found + 1
            local score = math.min(1.5, gap or 1.5) * 8 - plan.secs
            if not best or score > best.score then best = { score = score, T = T, len = len, gap = gap, steer = steer, note = plan.note, endTug = plan.endTug, secs = plan.secs, tier = tier, pullLen = plan.pullLen } end
            if found >= (tier <= 1 and 99 or 10) then break end
          else
            note(len)
          end
        end
        if best and tier >= 1 and (best.secs <= 70 or tier >= 2 or QUICK) then
          best.T.pushes, best.T.filter = nil, nil
          best.reach, best.tried = how, tried
          return best
        end
      end
    end
  end
  local list = {}
  for w, n in pairs(whys) do list[#list + 1] = { w = w, n = n } end
  table.sort(list, function(p, q) return p.n > q.n end)
  local txt = {}
  for i = 1, math.min(6, #list) do txt[#txt + 1] = string.format('%d x %s', list[i].n, list[i].w) end
  return nil, string.format('%d ways tried; %s', tried, table.concat(txt, ' | '))
end


-- THE TRACTORS' WAYS FOR A SOLVED TOW: to the aircraft from every post (ways: found when the tow was: got.reach; for
-- a tow with a pull the rear hitch's first, for a push the front one's), and back to every post from where the tow
-- leaves the tractor (out), for the hitch(es) those ways use. What stands in the way back: what did for the tow, and
-- the aircraft on its place on the platform (no longer where it was). A tractor on its front hitch faces the
-- aircraft it has pushed on: it backs a quarter circle first.
local function waysFor(a, k, got, relaxed)
  local T, R = got.T, got.reach
  local oth = othersFor(a, relaxed)
  -- (WHICH HITCH (the user, 2026-11-18, after the run: "I see a lot of tugs wasting time making half turns in front of
  -- aircraft to line up their hitch when they could have just pulled straight in and used the hitch on the other
  -- side of the tug"): from each post the SHORTER way of the two: head on for the front hitch, or round to back onto
  -- the ring. Only a tow that begins with a pull of more than 15 m keeps the rear hitch (the tractor would drive that
  -- pull backwards) unless the way round is more than half as long again and 10 m.)
  local function wayLen(w)
    local n = 0
    for i = 2, #w.pts do n = n + math.sqrt((w.pts[i][1] - w.pts[i - 1][1]) ^ 2 + (w.pts[i][2] - w.pts[i - 1][2]) ^ 2) end
    return n + (w.back or 0) + (w.side ~= 0 and 6 or 0)
  end
  if DIAG then
    -- (each way driven once more, from the post itself)
    local fx0, fz0 = unit(a.fx, a.fz)
    local all0 = { obstacle(a.x, a.z, fx0, fz0, a.name) }
    for _, o in ipairs(oth) do all0[#all0 + 1] = o end
    local env0 = lab.hangarEnv(a, k)
    for i = 1, #posts do
      local W = H.tows and H.tows[a.slot] and H.tows[a.slot].ways and H.tows[a.slot].ways[i]
      if W then
        local d0 = { x = W.pts[1][1], z = W.pts[1][2], hx = posts[i].hx, hz = 0 }
        local good, bad = lab.within(env0, Tow.Fd.simSolo, d0, W.pts, {}, nil, all0)
        local same = R[W.front and 'front' or 'rear'] and R[W.front and 'front' or 'rear'][i]
        rec(string.format('DIAGPLAN %d/%d post %d (%s): the plan has %d points from %.2f / %.2f, now found %s: %s', a.el, a.turn, i, W.front and 'front' or 'rear', #W.pts, W.pts[1][1], W.pts[1][2],
          same and string.format('%d points, second %.2f / %.2f against %.2f / %.2f', #same.pts, same.pts[2][1], same.pts[2][2], W.pts[2][1], W.pts[2][2]) or 'none', good and 'driven' or tostring(bad)))
      end
      for _, kind in ipairs({ 'front', 'rear' }) do
        local w = R[kind] and R[kind][i]
        if w then
          local d0 = { x = w.pts[1][1], z = w.pts[1][2], hx = posts[i].hx, hz = 0 }
          local good, bad = lab.within(env0, Tow.Fd.simSolo, d0, w.pts, {}, nil, all0)
          rec(string.format('DIAGWAY %d/%d post %d %s side %d back %s: %s; others %d', a.el, a.turn, i, kind, w.side, tostring(w.back), good and 'driven' or tostring(bad), #all0))
        end
      end
    end
  end
  local longPull = T.pull and (got.pullLen or 0) > 15
  local ways, used, nWays = {}, {}, 0
  for i = 1, #posts do
    local f, r = R.front and R.front[i], R.rear and R.rear[i]
    local kind
    if f and r then
      local lf, lr = wayLen(f), wayLen(r)
      if longPull then kind = (lr > lf * 1.5 + 10) and 'front' or 'rear' else kind = (lf <= lr) and 'front' or 'rear' end
    elseif f or r then
      kind = f and 'front' or 'rear'
    end
    if kind then
      local w = kind == 'front' and f or r
      ways[i] = { side = w.side, back = w.back, pts = w.pts, front = kind == 'front' }
      used[kind], nWays = true, nWays + 1
    end
  end
  local S = H.elevators[k].stations[T.st]
  local after = { obstacle(S.x, S.z, S.fx, S.fz, a.name .. ' (on the platform)') }
  for _, o in ipairs(oth) do after[#after + 1] = o end
  local e = got.endTug
  local f = TOW.hitch - TOW.hitchFront
  -- (the platform is floor for it: the tractor stands at its inboard edge)
  local env = lab.hangarEnv({ x = 1e6, z = 1e6, fx = 1, fz = 0, name = '' }, k)
  local out, nOut = {}, 0
  for _, kind in ipairs({ 'rear', 'front' }) do
    if used[kind] then
      local from = kind == 'rear' and e or { x = e.x - e.hx * f, z = e.z - e.hz * f, hx = -e.hx, hz = -e.hz }
      local n
      out[kind], n = waysOut(env, from, after, kind == 'rear' and { 0, 1, -1 } or { 1, -1, 'b6', 'b10' })
      nOut = nOut + n
    end
  end
  return ways, out, nWays, nOut
end

local TRACES, RES = {}, {}
local solved, failed = 0, 0
for _, o in ipairs(ORDER) do
  local k, turn, st = o[1], o[2], o[3]
  local a = byKey[k .. '/' .. turn]
  if a then
    -- (its partner on the platform: 1 with 2, 3 with 4, 5 with 6)
    local mate = byKey[k .. '/' .. (turn % 2 == 1 and turn + 1 or turn - 1)]
    local sts = st and { st } or { 2, 1 }
    if not st and mate and stood[mate] then sts = { 3 - stood[mate].st } end
    local got, why
    if not ONLY or ONLY[k .. '/' .. turn] then
      local t0 = os.clock()
      for _, relaxed in ipairs(k >= 3 and { false, true } or { false }) do
        for _, s1 in ipairs(sts) do
          if not got then
            local r, w
            if mate and stood[mate] and not NO_DOOR then
              DOOR_TOO, QUICK = true, true
              r, w = solve(a, k, s1, relaxed)
              DOOR_TOO, QUICK = nil, nil
              -- (taken if it is not a slow one: else the tow is solved as before, to begin when the platform is down)
              if r and r.secs <= 90 then r.door2 = true else r = nil end
            end
            if not r then r, w = solve(a, k, s1, relaxed) end
            if r then got, r.relaxed = r, relaxed else why = (why and (why .. ' || ') or '') .. string.format('place %d%s: %s', s1, relaxed and ' (1 and 2 gone)' or '', tostring(w)) end
          end
        end
      end
      if got then
        solved = solved + 1
        RES[a] = got
        got.world = othersFor(a, got.relaxed)
        local T = got.T
        local ways, out, nWays, nOut = {}, {}, 0, 0
        if not NO_WAYS then ways, out, nWays, nOut = waysFor(a, k, got, got.relaxed) end
        -- (its trace: where the aircraft and the tractor are along the tow, every metre and a half: for CLEAR)
        do
          T.trace = true
          DOOR_TOO = got.door2
          local plan = lab.within(lab.hangarEnv(a, k), lab.towOf, a, k, T.st, othersFor(a, got.relaxed), false, T)
          DOOR_TOO = nil
          T.trace = nil
          TRACES[#TRACES + 1] = { n = a.slot, trace = plan and plan.trace or {} }
        end
        got.line = string.format('TOW n = %d, el = %d, turn = %d, st = %d, alpha = %d%s, kz = %.2f, rho = %d%s%s%s@NEXT@ -- %s; %.0f m in all, least room %s, nose wheel %.0f degrees at most; tractor ways from %d of %d posts, back to %d; tier %d, %d tried, %.0f s%s',
          a.slot, k, turn, T.st, T.alpha, T.pull and (', pull = ' .. fmtPts(T.pull)) or '', T.kz, T.rho, T.ease and string.format(', ease = %d', T.ease) or '', T.pts and (', pts = ' .. fmtPts(T.pts)) or '',
          NO_WAYS and '' or string.format(', ways = %s, out = { rear = %s, front = %s }', fmtWays(ways), fmtWays(out.rear or {}), fmtWays(out.front or {})),
          tostring(got.note) .. string.format('; some %.0f s%s', got.secs or 0, got.door2 and '; its partner may stand short of the door meanwhile' or ''), got.len, got.gap and string.format('%.2f m', got.gap) or 'none near', got.steer or 0, nWays, #posts, nOut, got.tier, got.tried, os.clock() - t0,
          got.relaxed and '; WITH ELEVATORS 1 AND 2\'S AIRCRAFT GONE' or '')
        got.ways, got.kinds = ways, out
      else
        failed = failed + 1
        rec(string.format('FAIL n = %d, el = %d, turn = %d (%.0f s): %s', a.slot, k, turn, os.clock() - t0, tostring(why)))
      end
    end
    -- (it has gone: onto its place; its partner, if that stood there, goes with it)
    local stAt = got and got.T.st or st or sts[1]
    gone[a] = true
    if mate and stood[mate] then stood[mate] = nil else stood[a] = { k = k, st = stAt } end
  end
end
-- A TRACTOR FOR EACH ELEVATOR (the user, 2026-11-18, after the run: "I'm still seeing tugs sitting idle while there are
-- aircraft ... in the hangar that could be brought closer", "Tugs in the hangar sometimes pull off to the side to
-- stage instead of parking at their next aircraft even when there is no collision risk if they wait at the
-- aircraft"): the demo gives each elevator one tractor, which goes from where a tow leaves it STRAIGHT TO THE NEXT
-- AIRCRAFT OF ITS ELEVATOR and waits at its nose. For every aircraft but an elevator's last:
--   nextWay   the tractor's way from where this aircraft's tow leaves it (on its rear hitch, on its front one) to the
--             place it stops at for the next aircraft of the same elevator (the shorter of: head on, or past it to
--             back onto the ring; as `ways` are chosen), with everything that is still parked when this tow ends;
--   early     (on the next aircraft's own tow) a tractor standing there is in the way of no tow that comes between
--             the two in the order: each of those driven in the head once more with the tractor standing there.
if not NO_WAYS then
  local idx = {}
  for i, o in ipairs(ORDER) do
    local a = byKey[o[1] .. '/' .. o[2]]
    if a then idx[a] = i end
  end
  -- (the hangar just after ORDER[upto] has gone: gone / stood as the main loop left them then)
  local function replay(upto)
    gone, stood = {}, {}
    for i = 1, upto do
      local o = ORDER[i]
      local a = byKey[o[1] .. '/' .. o[2]]
      if a then
        local mate = byKey[o[1] .. '/' .. (o[2] % 2 == 1 and o[2] + 1 or o[2] - 1)]
        gone[a] = true
        if mate and stood[mate] then stood[mate] = nil else stood[a] = { k = o[1], st = RES[a] and RES[a].T.st or o[3] or 2 } end
      end
    end
  end
  local function tractorAt(G, name)
    local sh = Tow.Fd.tugShape(G.x, G.z, G.hx, G.hz)
    sh.low = { sh[1] }
    return { x = G.x, z = G.z, fx = G.hx, fz = G.hz, name = name, half = 4.2, shape = sh }
  end
  for k = 1, 4 do
    local list = {}
    for _, o in ipairs(ORDER) do
      if o[1] == k and byKey[k .. '/' .. o[2]] then list[#list + 1] = byKey[k .. '/' .. o[2]] end
    end
    -- WHERE THE ELEVATOR'S TRACTOR STANDS AT THE START (start): at the nose of its first aircraft (head on if it can,
    -- else to back on), if a tractor standing there from the beginning is in the way of no tow that comes before
    -- that aircraft's in the order (each of those driven in the head once more with the tractor standing there)
    do
      local Y = list[1]
      local ry = Y and RES[Y]
      if ry then
        local goals = goalsFor(Y, ry.T.alpha, lab.hangarEnv(Y, k))
        local chosen
        for _, kind in ipairs({ 'front', 'rear' }) do
          local g = goals[kind]
          local good = g ~= nil and not chosen
          if good then
            for j = 1, idx[Y] - 1 do
              local o = ORDER[j]
              local Z = byKey[o[1] .. '/' .. o[2]]
              local rz = Z and RES[Z]
              if rz and good then
                local oth = {}
                for _, q in ipairs(rz.world) do oth[#oth + 1] = q end
                oth[#oth + 1] = tractorAt(g.G, 'a tractor waiting at the nose of ' .. tostring(Y.name))
                if not lab.within(lab.hangarEnv(Z, o[1]), lab.towOf, Z, o[1], rz.T.st, oth, false, rz.T) then good = false end
              end
            end
          end
          if good then chosen = { kind = kind, G = g.G } end
        end
        if chosen then
          ry.start = string.format(', start = { x = %.2f, z = %.2f, hx = %.4f, hz = %.4f%s }', chosen.G.x, chosen.G.z, chosen.G.hx, chosen.G.hz, chosen.kind == 'front' and ', front = true' or '')
        end
        rec(string.format('START el %d: its tractor %s', k, chosen and ('at the nose of its first aircraft, ' .. (chosen.kind == 'front' and 'head on' or 'to back on')) or 'at a post (at the nose it would be in an earlier tow\'s way)'))
      end
    end
    for i = 1, #list - 1 do
      local X, Y = list[i], list[i + 1]
      local rx, ry = RES[X], RES[Y]
      if rx and ry then
        replay(idx[X])
        -- (everything still parked, the next aircraft among them; this one on its place on the platform)
        local all = othersFor({ el = k }, false)
        local env = lab.hangarEnv({ x = 1e6, z = 1e6, fx = 1, fz = 0, name = '' }, k)
        local goals = goalsFor(Y, ry.T.alpha, lab.hangarEnv(Y, k))
        local places, kinds = {}, {}
        for _, kind in ipairs({ 'front', 'rear' }) do
          local g = goals[kind]
          if g then
            places[#places + 1] = { x = g.G.x, z = g.G.z, hx = g.G.hx, hz = g.G.hz, min = 1.2, goal = g.goal }
            kinds[#kinds + 1] = kind
          end
        end
        local e = rx.endTug
        local f = TOW.hitch - TOW.hitchFront
        local nextWay = {}
        local longPull = ry.T.pull and (ry.pullLen or 0) > 15
        for _, from in ipairs({ 'rear', 'front' }) do
          if rx.kinds and rx.kinds[from] then
            local d0 = from == 'rear' and e or { x = e.x - e.hx * f, z = e.z - e.hz * f, hx = -e.hx, hz = -e.hz }
            local ws = waysOut(env, d0, all, from == 'rear' and { 0, 1, -1 } or { 1, -1, 'b6', 'b10' }, places)
            local best, bestLen
            for j, kind in ipairs(kinds) do
              local w = ws[j]
              if w then
                local len = 0
                for q = 2, #w.pts do len = len + math.sqrt((w.pts[q][1] - w.pts[q - 1][1]) ^ 2 + (w.pts[q][2] - w.pts[q - 1][2]) ^ 2) end
                -- (a tow that begins with a long pull: on the rear hitch unless that is much the longer way)
                if longPull and kind == 'front' then len = len * 1.5 + 10 end
                if not bestLen or len < bestLen then best, bestLen = { side = w.side, back = w.back, pts = w.pts, front = kind == 'front', G = places[j] }, len end
              end
            end
            nextWay[from] = best
          end
        end
        -- early: the tows between the two in the order, each with a tractor standing where this one would wait
        local early = { front = true, rear = true }
        for _, kind in ipairs({ 'front', 'rear' }) do
          local g = goals[kind]
          if not g then
            early[kind] = false
          else
            for j = idx[X] + 1, idx[Y] - 1 do
              local o = ORDER[j]
              local Z = byKey[o[1] .. '/' .. o[2]]
              local rz = Z and RES[Z]
              if rz and early[kind] then
                local oth = {}
                for _, q in ipairs(rz.world) do oth[#oth + 1] = q end
                oth[#oth + 1] = tractorAt(g.G, 'a tractor waiting at the nose of ' .. tostring(Y.name))
                local plan = lab.within(lab.hangarEnv(Z, o[1]), lab.towOf, Z, o[1], rz.T.st, oth, false, rz.T)
                if not plan then early[kind] = false end
              end
            end
          end
        end
        local function fmtWay(w)
          return string.format('{ side = %d%s%s, pts = %s }', w.side, w.back and string.format(', back = %d', w.back) or '', w.front and ', front = true' or '', fmtPts(w.pts))
        end
        rx.next = string.format(', nextWay = { rear = %s, front = %s }', nextWay.rear and fmtWay(nextWay.rear) or 'false', nextWay.front and fmtWay(nextWay.front) or 'false')
        ry.early = string.format(', early = { front = %s, rear = %s }', tostring(early.front), tostring(early.rear))
        rec(string.format('NEXT el %d turn %d -> %d: from its rear hitch %s, from its front one %s; waiting there: head on %s, to back on %s', k, X.turn, Y.turn,
          nextWay.rear and 'a way' or 'none', nextWay.front and 'a way' or 'none', early.front and 'harmless' or 'IN THE WAY of an earlier tow', early.rear and 'harmless' or 'IN THE WAY of an earlier tow'))
      end
    end
  end
end
for _, o in ipairs(ORDER) do
  local a = byKey[o[1] .. '/' .. o[2]]
  local r = a and RES[a]
  if r and r.line then rec((r.line:gsub('@NEXT@', function() return (r.next or '') .. (r.early or '') .. (r.start or '') end))) end
end

-- WHICH TOWS ARE CLEAR OF WHICH (CLEAR lines; the plan's `clear`): two tows may be driven at the same time if, all
-- along both, the one's aircraft and tractor keep 0.6 m from the other's (the aircraft's whole outline against the
-- other aircraft's; a tractor against the other aircraft's wheels and the other tractor): whenever each begins.
-- (A tow that crosses where another's aircraft is parked, or where it ends on the platform, is not clear of it.)
if not NO_WAYS then
  local function shapes(tr)
    local out = {}
    for _, q in ipairs(tr) do
      local fx, fz = unit(q[1] - q[3], q[2] - q[4])
      local x, z = q[1] - fx * TOW.noseGear, q[2] - fz * TOW.noseGear
      out[#out + 1] = { x = x, z = z, jet = lab.shape(x, z, fx, fz), tug = Tow.Fd.tugShape(q[5], q[6], q[7], q[8]) }
    end
    return out
  end
  for _, t in ipairs(TRACES) do t.sh = shapes(t.trace) end
  local function clearOf(A, B)
    for _, p in ipairs(A.sh) do
      for _, q in ipairs(B.sh) do
        if (p.x - q.x) ^ 2 + (p.z - q.z) ^ 2 < 900 then
          if Tow.Fd.gap(p.jet, q.jet) < 0.6 or Tow.Fd.gap(p.tug, q.jet.low) < 0.6 or Tow.Fd.gap(q.tug, p.jet.low) < 0.6 or Tow.Fd.gap(p.tug, q.tug) < 0.6 then return false end
        end
      end
    end
    return true
  end
  local lists, pairsClear = {}, 0
  for i = 1, #TRACES do
    for j = i + 1, #TRACES do
      local A, B = TRACES[i], TRACES[j]
      if #A.sh > 0 and #B.sh > 0 and clearOf(A, B) then
        lists[A.n], lists[B.n] = lists[A.n] or {}, lists[B.n] or {}
        table.insert(lists[A.n], B.n)
        table.insert(lists[B.n], A.n)
        pairsClear = pairsClear + 1
      end
    end
  end
  for _, t in ipairs(TRACES) do
    table.sort(lists[t.n] or {})
    rec(string.format('CLEAR [%d] = { %s },', t.n, table.concat(lists[t.n] or {}, ', ')))
  end
  rec(string.format('CLEARPAIRS %d of %d pairs of tows can be driven at the same time', pairsClear, #TRACES * (#TRACES - 1) / 2))
  -- WHICH TOWS A TRACTOR WAITING AT A POST IS IN THE WAY OF (POSTCLASH lines; the plan's postClash): the tows whose
  -- aircraft or tractor come within 0.6 m of a tractor standing at the post, anywhere along the tow. The demo sends
  -- no tractor to wait at a post while such a tow is still to come (in the rig, 2026-11-18, the tractors that had
  -- finished stood at the posts along the port wall, beside the last two aircraft of elevator 4, and were moved off
  -- from one to the other until nothing moved).
  for i, P in ipairs(posts) do
    local tug = Tow.Fd.tugShape(P.x, P.z, P.hx, P.hz)
    local list = {}
    for _, t in ipairs(TRACES) do
      local hit = false
      for _, q in ipairs(t.sh) do
        if not hit and (q.x - P.x) ^ 2 + (q.z - P.z) ^ 2 < 900 and (Tow.Fd.gap(tug, q.jet) < 0.6 or Tow.Fd.gap(tug, q.tug) < 0.6) then hit = true end
      end
      if hit then list[#list + 1] = t.n end
    end
    table.sort(list)
    rec(string.format('POSTCLASH [%d] = { %s },', i, table.concat(list, ', ')))
  end
end
rec(string.format('DONE: %d solved, %d not, %.0f s', solved, failed, os.clock() - t00))
