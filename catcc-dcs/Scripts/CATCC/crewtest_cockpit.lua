-- CATCC crew test: THE BRAKE RIDERS (catcc-dcs/deck-test/crew-test/BRAKE-RIDER.md).
--
-- The user (2026-11-25): "Please add brown shirts to the cockpit of aircraft being towed. They should spawn into the
-- cockpit just before the tug arrives. They should remain in the cockpit until the tug is clear. They should look
-- around while in the cockpit. The canopy should remain open. They should place their hands on the "towel rack" /
-- grab handles around the canopy frame." Then: "the towel rack is attached to the part of the canopy that raises when
-- opening, so they can't put their hands there. They can just rest their hands in their lap for now instead."
--
-- WHO. Our people named catcc-b0 .. b8 (the crew data patch: brown shirts, three in each of catapult crews 2, 3 and 4).
-- While nobody needs one a rider stands AWAY: C.CFG.away metres aft of the ship's origin, out of sight (the demo's
-- Hide switches put a driver there too; the native module puts a man no further than 1000 m).
--
-- WHEN. The demo gives this file, every frame, the aircraft its tractors are working on (C.tick: `list`), each as
--   coming  its tractor is on its way to it: a rider is put in when the tractor is C.CFG.board metres from the place
--           it hooks on at (or nearer when the way there begins nearer: then at once)
--   on      hooked on, being towed or pushed, being unhooked
--   done    delivered: the tractor is leaving. The rider stays until the tractor is C.CFG.clear metres further from the
--           aircraft than it was when it was delivered, or C.CFG.linger seconds have gone by. A delivered aircraft
--           never takes a new rider.
--   hold    on an elevator between its two tractors (the user, 2026-11-26: "I would prefer the brake rider to remain in
--           the cockpit during elevator rides between tugs"): one already aboard stays, whatever the hangar's tractor
--           does, until the deck's tractor has it (then: on) or the aircraft stays on the platform as its deck spot (the
--           demo leaves it out of the list then). Nobody is put in for this.
-- An aircraft no longer in the list (its tow ended, or broke off) has its rider taken out at once. An aircraft in two
-- entries (the hangar's tractor leaving it on a platform while the deck's comes for it) keeps its rider while either
-- needs him. No rider free: the tow goes without one (said once in the log for that aircraft).
--
-- WHERE. In the Hornet's seat: the figure's pelvis bone where fa-18c.edm's connector seat_pilot is (C.CFG.seat: 3.640 m
-- ahead of the aircraft's own position, 0.425 m up, on its centre line; crew-test/model/rider_pose.py --measure),
-- facing the way it faces. Put there again in every frame in which the aircraft has moved (a millimetre or a tenth of
-- a degree), else not.
--
-- HOW HE SITS. In the blend space of ours "catcc_bs_rdr_look" (five poses made on the user's PC by
-- crew-test/model/rider_pose.py at install: hands resting in the lap, feet on the pedals, the head
-- 100 and 50 degrees either way): his head turned by the native module as a driver's is (the same parameter). Where
-- he looks is crewtest_head.lua's, as for a driver whose tractor stands: ahead, and every 4 to 9 s a look to one side
-- for a second or two, sometimes then to the other. Without the head module or the blend space: the plain pose of ours
-- "catcc_rdr_seat" (hands in the lap, head ahead); without that, the pilot's own seated pose f18_0_init.
--
-- THE CANOPY is the demo's (the aircraft's model argument 38, opened as the jet's own mechanism opens it: 0.9): opened
-- when a rider is put in (cb.board) and left open.
--
-- Plain Lua 5.1; no DCS here: what it needs comes in (native: place / play / head; H: crewtest_head.lua's table).
local C = {}

C.CFG = {
  seat = { fwd = 3.640, up = 0.425 }, -- fa-18c.edm's seat_pilot; rider_pose.py's POSE['seat'] (a test holds them together)
  anim = 'catcc_bs_rdr_look', pose = 'catcc_rdr_seat', fallback = 'f18_0_init',
  board = 20,      -- m: the tractor this near the place it hooks on at
  clear = 8,       -- m: the tractor this much further from the aircraft than it was when it delivered it
  linger = 60,     -- s: at the most after the aircraft was delivered
  away = -900,     -- m aft of the ship's origin, where a rider waits
  awayEvery = 10,  -- s: one who waits is put there again this often (whatever DCS's crew logic did with him)
  look = 0.25,     -- s: where his head goes is decided this often
  moved = 0.001,   -- m (and the same in the facing's components): the aircraft has moved
  canopy = { arg = 38, open = 0.9 },
}

local sqrt, abs = math.sqrt, math.abs

-- a new set of riders: people = { { h, name }, ... } (more may be added later: C.add)
function C.new(people)
  local st = { pool = {}, byH = {}, aboard = {}, said = {}, clock = 0 }
  C.add(st, people or {})
  return st
end

function C.add(st, people)
  local n = 0
  for _, p in ipairs(people) do
    if p.h and not st.byH[p.h] then
      local r = { h = p.h, name = tostring(p.name), i = #st.pool }
      st.pool[#st.pool + 1] = r
      st.byH[p.h] = r
      n = n + 1
    end
  end
  table.sort(st.pool, function(a, b) return a.name < b.name end)
  for i, r in ipairs(st.pool) do r.i = i - 1 end
  return n
end

-- where a waiting rider stands
local function putAway(native, r, y)
  r.awayY = y or r.awayY or 20.149
  pcall(native.place, r.h, C.CFG.away, r.awayY, 2 * r.i, 1, 0)
end

-- he takes the seat: our blend space with his head turned by the native module (as H.seat does for a driver), else a
-- still pose
local function seat(native, H, r)
  r.pose, r.head = nil, nil
  if H and H.new and H.step and not CATCC_HEAD_OFF and native.head and native.headtick then
    local okp, resp = pcall(native.play, r.h, C.CFG.anim, 2)
    if okp and resp then
      local okh, resh = pcall(native.head, r.h, 0, H.CFG and H.CFG.omega or 6)
      if okh and resh then
        r.head = H.new(r.name)
        r.clock = 0
        r.pose = C.CFG.anim
        return r.pose
      end
    end
  end
  for _, a in ipairs({ C.CFG.pose, C.CFG.fallback }) do
    local ok, res = pcall(native.play, r.h, a, 2)
    if ok and res then
      r.pose = a
      return a
    end
  end
  return nil
end

local function place(native, r, e)
  local S = C.CFG.seat
  local p = r.at
  if p and abs(p[1] - e.x) < C.CFG.moved and abs(p[2] - e.y) < C.CFG.moved and abs(p[3] - e.z) < C.CFG.moved
    and abs(p[4] - e.fx) < C.CFG.moved and abs(p[5] - e.fz) < C.CFG.moved then return end
  r.at = { e.x, e.y, e.z, e.fx, e.fz }
  local ok, res, why = pcall(native.place, r.h, e.x + e.fx * S.fwd, e.y + S.up, e.z + e.fz * S.fwd, e.fx, e.fz)
  if not (ok and res) and not r.placeBad then
    r.placeBad = true
    return tostring(ok and why or res)
  end
end

-- One frame. now: the tow's clock (s); list: { { key, name, stage = 'coming' | 'on' | 'done' | 'hold', x, y, z, fx, fz (the
-- aircraft: its own position and the way it faces, the ship's frame), tx, tz (its tractor, as drawn), hx, hz (coming:
-- where the tractor hooks on) }, ... }; cb: { board = function(key, rider), leave = function(key, rider), log =
-- function(text) } (each may be nil). Returns the number of riders aboard.
function C.tick(st, native, H, now, list, cb)
  cb = cb or {}
  local CFG = C.CFG
  -- what each aircraft of the list needs
  local want, pose = {}, {}
  for _, r in pairs(st.aboard) do r.why = nil end
  for _, e in ipairs(list) do
    local k = e.key
    local r = st.aboard[k]
    local need
    if e.stage == 'on' then
      need = true
    elseif e.stage == 'coming' then
      need = (r ~= nil) or (e.hx and sqrt((e.tx - e.hx) ^ 2 + (e.tz - e.hz) ^ 2) <= CFG.board) or false
    elseif e.stage == 'hold' then
      need = r ~= nil
    elseif r then
      -- delivered: until the tractor is clear
      local d = sqrt((e.tx - e.x) ^ 2 + (e.tz - e.z) ^ 2)
      r.d0 = r.d0 or d
      r.doneAt = r.doneAt or now
      need = d < r.d0 + CFG.clear and now - r.doneAt < CFG.linger
      -- (why, if he climbs out: said then, below; an elevator ride may keep him in)
      r.why = 'its tractor is ' .. (now - r.doneAt >= CFG.linger and string.format('still near after %d s', CFG.linger) or string.format('clear (%.1f m off)', d))
    end
    if need then want[k] = true end
    if (e.stage == 'on' or e.stage == 'coming') and r then r.d0, r.doneAt = nil, nil end
    -- (the pose of the aircraft: the entry that is towing it, if two)
    if not pose[k] or e.stage == 'on' then pose[k] = e end
  end
  -- out: aircraft that no longer need one
  for k, r in pairs(st.aboard) do
    if not want[k] then
      if cb.log then cb.log(string.format('cockpit: %s climbs out of %s: %s', r.name, tostring(k.name or r.on), r.why or 'no tractor is working on it')) end
      st.aboard[k] = nil
      r.key, r.at, r.d0, r.doneAt, r.why = nil, nil, nil, nil, nil
      if r.head and H and H.unseat then H.unseat(native, r) end
      r.head = nil
      putAway(native, r)
      r.awayAt = now
      if cb.leave then cb.leave(k, r) end
    end
  end
  -- in: aircraft that need one and have none
  local free = {}
  for _, r in ipairs(st.pool) do
    if not r.key then free[#free + 1] = r end
  end
  local fi = 1
  for _, e in ipairs(list) do
    local k = e.key
    if want[k] and not st.aboard[k] then
      local r = free[fi]
      if not r then
        if not st.said[k] and cb.log then
          st.said[k] = true
          cb.log(string.format('cockpit: no brake rider free for %s (all %d are in other aircraft): it is towed without one', tostring(e.name), #st.pool))
        end
      else
        fi = fi + 1
        r.key, r.at, r.on = k, nil, tostring(e.name)
        st.aboard[k] = r
        local p = seat(native, H, r)
        local why = place(native, r, pose[k])
        if cb.board then cb.board(k, r) end
        if cb.log then
          cb.log(string.format('cockpit: %s climbs into %s (%s)%s', r.name, tostring(e.name), tostring(p or 'NO POSE could be played'),
            why and ('; he could not be placed: ' .. why) or ''))
        end
      end
    end
  end
  -- aboard: with the aircraft; his head now and then
  local n = 0
  st.lookAt = st.lookAt or now
  local looks = now >= st.lookAt
  if looks then st.lookAt = now + CFG.look end
  for k, r in pairs(st.aboard) do
    n = n + 1
    local why = place(native, r, pose[k])
    if why and cb.log then cb.log(string.format('cockpit: %s could not be put in the seat: %s', r.name, why)) end
    if looks and r.head and H and H.step then
      r.clock = (r.clock or 0) + CFG.look
      local yaw = H.step(r.head, r.clock, 0, 0, 1, 0)
      if yaw then pcall(native.head, r.h, yaw) end
    end
  end
  -- waiting: put away again now and then
  for _, r in ipairs(st.pool) do
    if not r.key and now - (r.awayAt or -1e9) >= CFG.awayEvery then
      r.awayAt = now
      putAway(native, r)
    end
  end
  return n
end

-- every rider out and away (the demo stops); `back`: each to where he waited before the demo (stood up)
function C.stop(st, native, H, cb)
  cb = cb or {}
  for k, r in pairs(st.aboard) do
    st.aboard[k] = nil
    r.key = nil
    if r.head and H and H.unseat then H.unseat(native, r) end
    r.head = nil
    if cb.leave then cb.leave(k, r) end
  end
  for _, r in ipairs(st.pool) do putAway(native, r) end
end

return C
