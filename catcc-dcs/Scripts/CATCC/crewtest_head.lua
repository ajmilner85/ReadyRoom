-- CATCC crew test: THE TRACTOR DRIVERS' HEAD (catcc-dcs/deck-test/crew-test/DRIVER-HEAD.md).
--
-- The user (2026-11-22): "can you investigate whether it's possible to get the tug drivers to turn their heads while they
-- are driving? If so, while reversing they should turn their heads 90-110 degrees (whatever is realistic for a human)
-- to the right. At other times it would be nice if their heads moved to look where they are about to turn or check the
-- area around them."
--
-- HOW A HEAD IS TURNED. A driver sits in a blend space of our own, "catcc_bs_drv_look" (five still poses of the F/A-18C
-- pilot figure's own look-round clip, made on the user's PC by crew-test/model/driver_head.py: install.ps1 -DriverHead),
-- in place of the seated pose f18_0_init; its one axis is the parameter "catcc_head_yaw": degrees, + to HIS right,
-- -100 .. 100. The native module turns it: native.head(h, degrees) says where the head is to go, and the module itself
-- brings it there smoothly, a little every frame (native.headtick(), called once a frame by the hook on DCS's thread).
-- So this file only DECIDES where a driver looks, and says so when that changes: a few calls a second at the most for a
-- driver who is turning, none for one who looks steadily one way. Nothing here is worked out more than once a frame for
-- a tractor that drives, four times a second for one that stands.
--
-- WHERE HE LOOKS (H.step):
--   backing    over his RIGHT shoulder, 100 degrees round (H.CFG.rev). Of that the neck and head are 81.5 degrees and the
--              torso 18.5 (the poses' own figures, driver_head.py --report): a neck turns about 80 degrees at the most,
--              so 100 is as far as the figure goes without the torso doing more than the clip has; the last of "looking
--              straight back" is the eyes'. Now and then he eases off a few degrees and looks round again (revSway).
--              He stays turned through a short stop while backing (H.CFG.settle).
--   driving    towards the point of his way `ahead` metres on (the caller's: the tow knows its way): into a turn before
--              the tractor has begun it. With no such point: into the turn the tractor is making (its turn rate).
--              On a straight: ahead, and every 6 to 12 s a look to one side (35 to 75 degrees, about a second).
--   standing   ahead, and every 4 to 9 s a look round: to one side for a second or two, sometimes then to the other.
-- What is random is drawn from the driver's own name, so a run plays the same way every time.
--
-- OFF UNLESS IT CAN WORK: H.seat gives nil (and the caller seats him in f18_0_init as before) when the native module has
-- no head / headtick, or the blend space is not among his animations (install.ps1 without -DriverHead). Config:
-- CATCC_HEAD_OFF = true in the hook's state turns it off whatever is installed.
local H = { ANIM = 'catcc_bs_drv_look', PARAM = 'catcc_head_yaw' }

H.CFG = {
  rev = 100, revSway = 8, revEvery = { 3, 7 },
  most = 100,                       -- the ends of the blend space's axis
  ahead = 9,                        -- metres of his way he looks ahead (the caller's aim point)
  aimGain = 0.9, aimMost = 70, aimDead = 8,
  lead = 1.5,                       -- with no aim point: the turn of the next 1.5 s at the rate of this instant
  turning = 20,                     -- looking this far into a turn: no looks round
  vMove = 0.12, settle = 0.6,       -- m/s that counts as moving; a stop shorter than this is none
  send = 4, steady = 0.5,           -- degrees his look must change to be said again; or: unchanged this long
  moveEvery = { 6, 12 }, stillEvery = { 4, 9 }, glance = { 35, 75 }, moveHold = { 0.6, 1.3 }, stillHold = { 1.0, 2.6 }, both = 0.4,
  idleEvery = 0.25,                 -- a standing tractor's driver: looked at four times a second
  omega = 6,                        -- how briskly the native module turns the head (1/s): 100 degrees in about 0.9 s
}

local abs, exp, floor, deg = math.abs, math.exp, math.floor, math.deg
local atan2 = math.atan2 or math.atan

-- a number 0 .. 1 from the driver's own row (Park and Miller's: every product below 2^46)
local function rnd(st)
  st.seed = (st.seed * 16807) % 2147483647
  return st.seed / 2147483647
end
local function between(st, r) return r[1] + (r[2] - r[1]) * rnd(st) end

function H.new(name)
  local seed = 7
  for i = 1, #tostring(name or '') do seed = (seed * 31 + tostring(name):byte(i)) % 2147483647 end
  local st = { seed = seed % 2147483646 + 1, mode = 'still', v = 0, w = 0, clock = 0 }
  for _ = 1, 3 do rnd(st) end
  return st
end

-- One step for a driver: `now` the tow's clock (s); x, z, hx, hz where his tractor is and the way it faces (the deck's
-- own axes: x forward, z to starboard; a unit vector); ax, az (may be nil) the point of his way he drives towards.
-- px, pz (may be nil): while he pushes an aircraft back, a point beyond its tail: where it is going.
-- Returns the degrees his head is to be turned to (+ right) when that is to be said to the native module, else nil.
function H.step(st, now, x, z, hx, hz, ax, az, px, pz)
  local C = H.CFG
  local dt = st.t and (now - st.t)
  if dt and dt <= 0 then return nil end -- (the clock stands: a pause)
  if not dt or dt > 2 then
    st.v, st.w = 0, 0 -- (the first step, or the first after a gap: nothing is known of how it moves)
    if not st.next then st.next = now + between(st, C.stillEvery) end
  else
    local dx, dz = x - st.x, z - st.z
    if dx * dx + dz * dz > (12 * dt + 0.5) ^ 2 then
      st.v, st.w = 0, 0 -- (put somewhere else, not driven there)
    else
      local a = 1 - exp(-dt / 0.25)
      st.v = st.v + ((dx * hx + dz * hz) / dt - st.v) * a
      st.w = st.w + (deg(atan2(st.hx * hz - st.hz * hx, st.hx * hx + st.hz * hz)) / dt - st.w) * a -- (+ to the right)
    end
  end
  st.t, st.x, st.z, st.hx, st.hz = now, x, z, hx, hz

  -- backing, driving or standing: a stop only after `settle`
  local want = st.v < -C.vMove and 'rev' or (st.v > C.vMove and 'fwd' or 'still')
  if want == st.mode then
    st.since = nil
  else
    st.since = st.since or now
    if want ~= 'still' or now - st.since >= C.settle then
      st.mode, st.since, st.look, st.revYaw = want, nil, nil, nil
      st.next = now + between(st, want == 'rev' and C.revEvery or (want == 'fwd' and C.moveEvery or C.stillEvery))
    end
  end

  local T
  if px then
    -- HE PUSHES AN AIRCRAFT BACK: his eyes are on where the aircraft is going (px, pz: a point beyond its tail), not
    -- on his own way and not wandering (the user, 2026-11-23: "a driver that is pushing an aircraft back should be
    -- looking toward where the aircraft is going, not randomly looking side to side or looking to where the tug is
    -- going (which might be different because of the articulation)"): as far round as the poses go
    local ux, uz = px - x, pz - z
    T = (ux * ux + uz * uz > 0.25) and deg(atan2(hx * uz - hz * ux, hx * ux + hz * uz)) or 0
    if T > C.most then T = C.most elseif T < -C.most then T = -C.most end
    st.look, st.revYaw = nil, nil
    st.next = now + between(st, C.moveEvery)
  elseif st.mode == 'rev' then
    if now >= st.next then
      st.revYaw = C.rev - C.revSway * rnd(st)
      st.next = now + between(st, C.revEvery)
      if rnd(st) < 0.5 then st.revYaw = C.rev end
    end
    T = st.revYaw or C.rev
  else
    local base = 0
    if st.mode == 'fwd' then
      local b
      if ax then
        local ux, uz = ax - x, az - z
        b = (ux * ux + uz * uz > 0.25) and deg(atan2(hx * uz - hz * ux, hx * ux + hz * uz)) or 0
      else
        b = st.w * C.lead
      end
      if abs(b) > C.aimDead then
        base = b * C.aimGain
        if base > C.aimMost then base = C.aimMost elseif base < -C.aimMost then base = -C.aimMost end
      end
    end
    local L = st.look
    if L and (now >= L.till or abs(base) >= C.turning) then
      -- (over; or a turn has come up: his eyes are on that)
      L = (abs(base) < C.turning) and L.after or nil
      if L then L.till = now + L.hold end
      st.look = L
      if not L then st.next = now + between(st, st.mode == 'fwd' and C.moveEvery or C.stillEvery) end
    end
    if not L and now >= st.next and abs(base) < C.turning then
      -- a look round: while the tractor turns a little, to the side it swings away from; else either
      local side = rnd(st) < 0.5 and -1 or 1
      if abs(st.w) > 3 then side = st.w > 0 and -1 or 1 end
      local hold = between(st, st.mode == 'fwd' and C.moveHold or C.stillHold)
      L = { yaw = side * between(st, C.glance), till = now + hold }
      if st.mode == 'still' and rnd(st) < C.both then L.after = { yaw = -side * between(st, C.glance), hold = between(st, C.stillHold) } end
      st.look = L
    end
    T = L and L.yaw or base
  end

  -- (whole degrees) said when it has changed enough, or when it has stood for a moment somewhere other than where he
  -- was last sent
  T = floor(T + 0.5)
  if T ~= st.T then st.T, st.Tat = T, now end
  local sent = st.sent
  if sent == nil or abs(T - sent) >= C.send or (abs(T - sent) >= 2 and now - st.Tat >= C.steady) then
    st.sent = T
    return T
  end
  return nil
end

-- ---------------------------------------------------------------- with the native module
-- A driver ({ h, name }) is seated: in the blend space, his head ahead. True when he is (driver.head: his row);
-- nil, why when not: the caller then seats him in the plain seated pose as before.
function H.seat(native, driver)
  driver.head = nil
  if CATCC_HEAD_OFF then return nil, 'switched off (CATCC_HEAD_OFF)' end
  if not (native and native.head and native.headtick and native.play) then return nil, 'the native module has no head / headtick' end
  local ok, res, e = pcall(native.play, driver.h, H.ANIM, 2)
  if not (ok and res) then return nil, tostring(ok and e or res) end
  local okh, resh, eh = pcall(native.head, driver.h, 0, H.CFG.omega)
  if not (okh and resh) then return nil, tostring(okh and eh or resh) end
  driver.head = H.new(driver.name)
  return true
end

-- Every frame his tractor is placed (Tow.apply): dt the seconds of the tow's clock this frame is (0: a pause: nothing
-- is done); where the tractor is, the way it faces, the point of its way it drives towards. His own clock (st.clock)
-- is the sum of these.
function H.drive(native, driver, dt, x, z, hx, hz, ax, az, px, pz)
  local st = driver.head
  if not st or not dt or dt <= 0 then return end
  st.clock = st.clock + dt
  local yaw = H.step(st, st.clock, x, z, hx, hz, ax, az, px, pz)
  if yaw then pcall(native.head, driver.h, yaw) end
end

-- The drivers of tractors nobody has placed since this was last called (they stand): tugs = { { driver = { h, name,
-- head } }, ... }; now: the tow's clock. Four times a second (H.CFG.idleEvery).
function H.idle(native, tugs, now)
  local C = H.CFG
  local last = H.idleAt
  if last and now >= last and now - last < C.idleEvery then return end
  H.idleAt = now
  local dt = (last and now > last) and (now - last) or 0
  if dt > 1 then dt = 1 end
  for i = 1, #tugs do
    local driver = tugs[i].driver
    local st = driver and driver.head
    if st then
      if dt > 0 and st.clock == st.idleSeen then
        st.clock = st.clock + dt
        local yaw = H.step(st, st.clock, st.x or 0, st.z or 0, st.hx or 1, st.hz or 0)
        if yaw then pcall(native.head, driver.h, yaw) end
      end
      st.idleSeen = st.clock
    end
  end
end

-- he leaves the seat (or the demo ends): the module forgets his head
function H.unseat(native, driver)
  if driver and driver.head then
    driver.head = nil
    if native and native.head then pcall(native.head, driver.h) end
  end
end

-- ---------------------------------------------------------------- the probe (F10 > Tow > Driver head; `tow|head|...`)
-- drivers: { { h, name }, ... } (every driver on the ship); what: 'right' | 'left' | 'ahead' | 'half' | 'report'.
-- Each is seated in the blend space where he is (a driver not on a tractor then sits on the deck where he stood) and
-- his head sent there. Returns what to show on screen, and lines for the log.
function H.probe(native, drivers, what)
  local to = ({ right = 100, left = -100, ahead = 0, half = 50 })[what]
  local log, seated, turned, why = {}, 0, 0, nil
  if not (native and native.head and native.headtick) then return 'driver head: the native module has no head / headtick (an older catcc_crew.dll).', log end
  if #drivers == 0 then return 'driver head: no drivers on this ship (catcc-t0 ..: the crew data patch).', log end
  for _, d in ipairs(drivers) do
    local playing
    if native.anim then
      local ok, a = pcall(native.anim, d.h)
      playing = ok and type(a) == 'table' and a.name or nil
    end
    if to and playing ~= H.ANIM then
      local ok, res, e = pcall(native.play, d.h, H.ANIM, 2)
      if ok and res then seated, playing = seated + 1, H.ANIM else why = tostring(ok and e or res) end
    end
    if to and playing == H.ANIM then
      local ok, res, e = pcall(native.head, d.h, to, H.CFG.omega)
      if ok and res then turned = turned + 1 else why = tostring(ok and e or res) end
    end
    local okp, p = pcall(native.prop, d.h, H.PARAM)
    log[#log + 1] = string.format('driver head: %s plays "%s"; "%s" reads %s', tostring(d.name), tostring(playing), H.PARAM, okp and tostring(p) or '?')
  end
  if not to then return string.format('driver head: %d driver(s); what each plays and where his head is: in the log.', #drivers), log end
  if turned == 0 then
    return string.format('driver head: NOT TURNED: the blend space "%s" could not be played (%s). Installed with install.ps1 -DriverHead?', H.ANIM, tostring(why)), log
  end
  local says = { right = 'RIGHT, 100 degrees: over his right shoulder, as when backing', left = 'LEFT, 100 degrees', ahead = 'AHEAD', half = 'RIGHT, 50 degrees' }
  return string.format('driver head: %d of %d driver(s) now turn their heads to their %s. It should take about a second, smoothly.', turned, #drivers, says[what]), log
end

return H
