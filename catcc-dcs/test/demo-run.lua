-- THE DECK SPOTTING DEMO FROM START TO FINISH, in the test harness of crewtest.test.ts (its mocked DCS and stand-in
-- native module). Run by the test "the whole demo" under DCS's own Lua 5.1, and by hand:
--   python -I ..\deck-test\crew-test\luarun.py <dump folder> demo-run.lua DEMO_ON=true [NO_JET=true UI_ON=true] [ACCEL_SET=4]
-- (fengari, which the other tests run in, would take some ten minutes over it.)
-- JET_SPOT='E11': the player's jet on another spot than Stbd bow 3.
-- NO_JET: no player's jet on the deck (forty aircraft; started by the panel's hot key: there is no F10 menu without a
-- player); else the player's jet stands on Stbd bow 3 (as in the user's mission: that spot is left empty).
-- What it records: the tractors' least distance from each other while one of them moves, where each tractor ends,
-- every deck spot whose aircraft is not on it, the chocks (argument 23: no aircraft moves along the deck with them in),
-- the covers (argument 24) and the tow bars at the end, and what is left after the demo is stopped.
-- STAMP=true: the log's lines carry the model time (hh:mm:ss) instead of 00:00:00 (for reading a run by hand: who
-- waited how long for what).
-- CATCC_DEMO_HANGAR_ONLY=true: the hangar's side alone is looked at (what comes up stands on its deck spot at once).
-- THREAD=true: THE DEMO ON ITS OWN THREAD (catcc-handoff/WORKER-THREAD-PLAN.md): the real native module's worker thread
-- and Scripts/CATCC/crewtest_worker.lua; this harness is DCS's main thread. Each frame waits for the worker's step
-- (CATCC_DEMO_LOCKSTEP: the same run every time); CATCC_DEMO_LOCKSTEP='late': its commands a frame later, as in DCS;
-- CATCC_DEMO_DISORDER=<seed>: frames left out and lists of commands held back.
-- HEAD_ON=true: the drivers turn their heads (Scripts/CATCC/crewtest_head.lua; the stand-in native module records
-- every `head` call and counts the frames' `headtick`s): how many calls, and that the run is otherwise the same.
ROUTES_SRC = ROUTES_REAL
STATIC_UP = 21.9
if THREAD then
  local m = assert(assert(REAL_LOADLIB(DLL_PATH, 'luaopen_catcc_crew'))(), 'the native module did not open')
  for _, k in ipairs({ 'worker_start', 'worker_post', 'worker_poll', 'worker_wait', 'worker_stop', 'worker_state', 'worker_blob', 'worker_blobinfo', 'worker_carry', 'worker_moves' }) do
    NATIVE[k] = assert(m[k], k)
  end
  -- (the packed list's commands are made by the real module: outside DCS it reaches nothing, so here it calls the
  -- stand-ins instead: CATCC_DEMO_NO_BLOB=true: everything as text for Lua, as before)
  CATCC_THREAD_SINK = NATIVE
  CATCC_THREAD_SCRIPT = SCRIPTS_DIR .. 'crewtest_worker.lua'
  CATCC_THREAD_WRITEDIR = 'W/'
  CATCC_THREAD_FILES = { ['Config/CATCC-test.lua'] = { src = 'return { chockTest = true, crewTest = true }' } }
  for _, n in ipairs({ 'crewtest_hook.lua', 'crewtest_demo.lua', 'crewtest_hangar.lua', 'crewtest_routes.lua' }) do CATCC_THREAD_FILES['Scripts/CATCC/' .. n] = SCRIPTS_DIR .. n end
  -- (HEAD_ON: the drivers' head on the demo's thread too)
  if HEAD_ON then CATCC_THREAD_FILES['Scripts/CATCC/crewtest_head.lua'] = SCRIPTS_DIR .. 'crewtest_head.lua' end
  -- (COCKPIT_ON: the brake riders, there too)
  if COCKPIT_ON then CATCC_THREAD_FILES['Scripts/CATCC/crewtest_cockpit.lua'] = SCRIPTS_DIR .. 'crewtest_cockpit.lua' end
  -- FREE=<ms>: NOT in lockstep, as in DCS: a frame of the rig takes that long by the clock and the worker keeps up as it
  -- can (its planning by its own clock, between the frames): no two runs are the same
  if FREE then CATCC_DEMO_LOCKSTEP = false elseif CATCC_DEMO_LOCKSTEP == nil then CATCC_DEMO_LOCKSTEP = true end
  -- what the main thread's side takes of a frame, by the real clock: reading and sending the frame; applying the
  -- worker's lists of commands (the stand-in native module's calls with it)
  MAIN_COST = { frame = 0, apply = 0, n = 0 }
  if CATCC_THR and REAL_CLOCK then
    local f0, a0 = CATCC_THR.frame, CATCC_THR.apply
    CATCC_THR.frame = function(t)
      local c = REAL_CLOCK()
      f0(t)
      MAIN_COST.frame, MAIN_COST.n = MAIN_COST.frame + REAL_CLOCK() - c, MAIN_COST.n + 1
    end
    CATCC_THR.apply = function(m)
      local c = REAL_CLOCK()
      a0(m)
      MAIN_COST.apply = MAIN_COST.apply + REAL_CLOCK() - c
    end
    local b0 = CATCC_THR.blob
    CATCC_THR.blob = function(bs)
      local c = REAL_CLOCK()
      b0(bs)
      MAIN_COST.apply = MAIN_COST.apply + REAL_CLOCK() - c
    end
  end
end
if STAMP then
  os.date = function() return string.format('%02d:%02d:%02d', math.floor(MT / 3600), math.floor(MT / 60) % 60, math.floor(MT) % 60) end
end
local RT = load(ROUTES_REAL)()
local me
for _, e in ipairs(RT) do if e.id == (JET_SPOT or 'SB3') then me = e end end
for i = 0, 9 do add(105 + i, 'catcc-t' .. i, '1: catcc-t' .. i, 12 + i, 33, SHIP_A) end
-- COCKPIT_ON=true: the brake riders (Scripts/CATCC/crewtest_cockpit.lua): nine brown shirts, catcc-b0 .. b8, as the crew
-- data patch declares them
if COCKPIT_ON then for i = 0, 8 do add(130 + i, 'catcc-b' .. i, (2 + math.floor(i / 3)) .. ': catcc-b' .. i, 10 - i, 33, SHIP_A) end end
if NO_JET then PLAYER = false else setJet(me.x, me.z, me.fx, me.fz) end
-- the stand-in ship's elevators: command 1 takes the deck-edge fence up, the platform down, the lower fence down (the
-- hook raises a platform itself)
ONFRAME = function(dt)
  for idx = 0, 3 do
    if ELEV[idx] == 1 then
      local top, plat, bottom = 27 + 2 * idx, 57 + idx, 28 + 2 * idx
      if (ARGS[top] or 0) < 1 then ARGS[top] = math.min(1, (ARGS[top] or 0) + dt / 4)
      elseif (ARGS[plat] or 0) < 1 then ARGS[plat] = math.min(1, (ARGS[plat] or 0) + dt / 17)
      else ARGS[bottom] = 0 end
    end
  end
  -- LIVE=true: WHAT DCS DOES AND THE STAND-INS DID NOT (the user's first run with the demo on its own thread,
  -- 2026-11-20: the hook took 47 ms a frame): (1) the camera's place in the world changes every frame (the ship
  -- steams, the user looks about): whatever is asked of DCS with the camera's place in it is a new question every
  -- frame; (2) DCS puts its own command back on a bubble we keep down, every frame: the hook gives ours again four
  -- times a second, for as long as the demo runs.
  if LIVE then
    LIVE_N = (LIVE_N or 0) + 1
    if CAMAT then CAMAT.f = (LIVE_N % 2000) * 0.013 end
    BUB[0], BUB[1] = 2, 2
  end
end
-- MT0=<seconds>: the mission's clock at the start (a demo begun late in a mission)
if MT0 then MT = MT0 end
HANDLER.onSimulationStart()
frames(1)
CAMAT = { f = 0, s = 0, up = 300, lf = 0, ls = 1 }
local function toggle()
  if NO_JET then HOTKEYS['Ctrl+Shift+F9']() else click('CATCC demo: spot the deck: start / stop') end
end
toggle()
frames(2)
-- HIDE=<seconds>: the panel's "Hide each in turn" (the hook's Tow.Hide), that long each: what is hidden is put far off
-- (100 km ahead, 10 km up; a driver 900 m aft); the checks below leave a hidden object out, and every frame it is
-- counted whether each object is hidden exactly when its kind is
HD = { n = 0, wrong = 0, most = 0, states = {} }
function HD.away(p) return p ~= nil and (p.f > 50000 or p.up > 5000) end
local away = HD.away
if HIDE then
  CATCC_HIDE.every = tonumber(HIDE)
  CATCC_HIDE.set('cycle')
end
local tugs, planes = {}, {}
for name, o in pairs(STATICS) do
  if name:find('^catcc%-demo%-t') then tugs[#tugs + 1] = { name = name:match('^(%S+)'), id = o.id_ } end
  if name:find('^catcc%-demo%-a%d+ %d+$') then planes[#planes + 1] = { name = name, id = o.id_ } end
end
table.sort(tugs, function(a, b) return a.name < b.name end)
rec('statics: ' .. #tugs .. ' tractors, ' .. #planes .. ' aircraft')
ACCEL = tonumber(ACCEL_SET or 2)
local seen, finished = 0, nil
local least, where = 1e9, ''
-- AN AIRCRAFT IN TOW AGAINST THE OTHER TRACTORS AND THE OTHER AIRCRAFT IN TOW (tractors now cross each other's ways in
-- time, not only in place): the aircraft taken as the line from 8.5 m behind its own position to 8.5 m ahead of it;
-- its own tractor is the one within 14 m of its nose. leastAT: to a tractor that is not its own; leastAA: between two
-- aircraft that both move.
local leastAT, whereAT, leastAA, whereAA = 1e9, '', 1e9, ''
local function segPoint(ax, az, bx, bz, px, pz)
  local dx, dz = bx - ax, bz - az
  local t = math.max(0, math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)))
  return math.sqrt((ax + dx * t - px) ^ 2 + (az + dz * t - pz) ^ 2)
end
local function segSeg(a, b)
  local best = 1e9
  for i = 0, 8 do
    local t = i / 8
    best = math.min(best, segPoint(b[1], b[2], b[3], b[4], a[1] + (a[3] - a[1]) * t, a[2] + (a[4] - a[2]) * t), segPoint(a[1], a[2], a[3], a[4], b[1] + (b[3] - b[1]) * t, b[2] + (b[4] - b[2]) * t))
  end
  return best
end
local moved = {}
local was, chocksOut, rolledChocked = {}, {}, 0
local covers0 = 0
for _, a in ipairs(planes) do if JETARG[a.id .. '/24'] == 1 then covers0 = covers0 + 1 end end
rec('covers on at the start: ' .. covers0)
-- AP_AT=<model time> [AP_FOR=<seconds>]: DCS's ACTIVE PAUSE is put on then, for that long (60 s): nothing of the demo's
-- may move while it is on (the mission's clock runs on; the stand-in ship's own elevators too, as DCS's would)
Export.LoSimulationOnActivePause = function() return ACTIVE_PAUSE == true end
local ap
SLOW = {}
local cpuAll = 0
PROF, PROF_STEP, PROF_WORST = {}, {}, nil
if PROFILE then
  PROF_HOOK = function()
    -- (the innermost function of the demo's or the hook's own that is running, and the planner-level one above it)
    local key
    for lv = 2, 12 do
      local i = debug.getinfo(lv, 'Sl')
      if not i then break end
      if i.what == 'Lua' and (i.short_src:find('crewtest_demo', 1, true) or i.short_src:find('crewtest_hook', 1, true)) then
        key = (i.short_src:find('demo', 1, true) and 'demo:' or 'hook:') .. (PROFILE_LINES and ('L' .. i.currentline) or i.linedefined)
        break
      end
    end
    if key and PROFILE_STACK then
      -- (the chain of the demo's own functions above it, outermost first, three at the most)
      local chain = {}
      for lv = 2, 40 do
        local i = debug.getinfo(lv, 'S')
        if not i then break end
        if i.what == 'Lua' and i.short_src:find('crewtest_demo', 1, true) then chain[#chain + 1] = i.linedefined end
      end
      local n = #chain
      key = table.concat({ tostring(chain[n]), tostring(chain[n - 1]), tostring(chain[n - 2]) }, '>')
    end
    if key then
      PROF[key] = (PROF[key] or 0) + 1
      PROF_STEP[key] = (PROF_STEP[key] or 0) + 1
    end
  end
  debug.sethook(PROF_HOOK, '', 2000)
end
for i = 1, 60 * 90 / ACCEL * 4 do
  local c0, l0 = (REAL_CLOCK or os.clock)(), #LOG
  if FREE and THREAD then
    -- (the frame's time by the clock: FREE=250 is real time for the rig's quarter of a second)
    local r0 = REAL_CLOCK()
    while REAL_CLOCK() - r0 < FREE / 1000 do NATIVE.worker_wait(1) end
  end
  frames(0.25)
  local c1 = (REAL_CLOCK or os.clock)() - c0
  if PROFILE then
    if not PROF_WORST or c1 > PROF_WORST[1] then PROF_WORST = { c1, MT, PROF_STEP } end
    PROF_STEP = {}
  end
  cpuAll = cpuAll + c1
  if #SLOW < 12 or c1 > SLOW[#SLOW][1] then
    SLOW[#SLOW + 1] = { c1, MT, l0 + 1, #LOG }
    table.sort(SLOW, function(a, b) return a[1] > b[1] end)
    SLOW[13] = nil
  end
  CPU_ALL = cpuAll
  if AP_AT and not ap and MT >= AP_AT then
    ACTIVE_PAUSE = true
    ap = { t0 = MT, n = 0 }
  elseif ap and not ap.done then
    ap.n = ap.n + 1
    if ap.n == 2 then
      -- (two frames for it to be seen: where everything of the demo's stands now, and the platforms the hook raises)
      ap.at, ap.t1 = {}, MT
      for name, o in pairs(STATICS) do
        local p = name:find('^catcc%-demo') and PLACED[o.id_]
        if p then ap.at[o.id_] = { p.f, p.s, p.up, name } end
      end
    elseif ap.at and MT - ap.t0 >= (AP_FOR or 60) then
      local moved, most, who = 0, 0, ''
      for id, q in pairs(ap.at) do
        local p = PLACED[id]
        local d = p and math.sqrt((p.f - q[1]) ^ 2 + (p.s - q[2]) ^ 2 + (p.up - q[3]) ^ 2) or 0
        -- (a millimetre: the same place told again, rounded)
        if d > 0.005 then moved = moved + 1 end
        if d > most then most, who = d, string.format('%s from %.2f / %.2f up %.2f to %.2f / %.2f up %.2f', q[4], q[1], q[2], q[3], p.f, p.s, p.up) end
      end
      local n = 0
      for _ in pairs(ap.at) do n = n + 1 end
      rec(string.format('active pause from model time %.0f: in %.0f s of the mission %d of %d things of the demo moved (most %.3f m%s)', ap.t1, MT - ap.t1, moved, n, most, most > 0 and (': ' .. who) or ''))
      ACTIVE_PAUSE = false
      ap.done = true
    end
  end
  -- (HIDE: is each object hidden exactly when its kind is? An aircraft by the height it was given: hangar or deck)
  if HIDE then
    local on, key = CATCC_HIDE.on, {}
    for _, k in ipairs(CATCC_HIDE.KINDS) do
      if on[k] then key[#key + 1] = k end
    end
    key = #key > 0 and table.concat(key, ',') or 'none'
    HD.states[key] = true
    local mid, n = (CATCC_DEMO and CATCC_DEMO.hideMid) or 16, 0
    local function check(what, hidden, should)
      if hidden then n = n + 1 end
      if hidden ~= should then
        HD.wrong = HD.wrong + 1
        HD.who = HD.who or string.format('%s %s at model time %.0f (hidden: %s)', what, hidden and 'hidden' or 'shown', MT, key)
      end
    end
    for _, t in ipairs(tugs) do
      local p = PLACED[t.id]
      if p then check(t.name, away(p), on.tractors == true) end
    end
    for _, a in ipairs(planes) do
      local p = PLACED[a.id]
      if p then
        local hid = away(p)
        local up = hid and p.up - 10000 or p.up
        check(a.name, hid, ((up < mid and on.hangar) or (up >= mid and on.deck)) == true)
      end
    end
    for name, o in pairs(STATICS) do
      local p = name:find('^catcc%-demo%-a%d+%-bar') and PLACED[o.id_]
      if p then check(name, away(p), on.bars == true) end
    end
    for i = 0, 9 do
      local q = byH[105 + i]
      if q and q.x then check('driver ' .. i, q.x <= -899, on.drivers == true) end
    end
    HD.n, HD.most = HD.n + 1, math.max(HD.most, n)
  end
  -- the tractors, pair by pair (on the same deck: within 2 m of the same height)
  for a = 1, #tugs do
    local p = PLACED[tugs[a].id]
    if away(p) then p = nil end
    if p then
      local m = moved[a]
      if m and (math.abs(m.f - p.f) > 0.01 or math.abs(m.s - p.s) > 0.01) then tugs[a].moving = MT end
      if m and math.abs((m.up or p.up) - p.up) < 0.5 then
        local d = math.sqrt((m.f - p.f) ^ 2 + (m.s - p.s) ^ 2)
        if d > (JUMP_T or 0) then JUMP_T, JUMP_TW = d, string.format('%s at model time %.0f', tugs[a].name, MT) end
      end
      moved[a] = { f = p.f, s = p.s, up = p.up }
      for b = a + 1, #tugs do
        local q = PLACED[tugs[b].id]
        if q and not away(q) and math.abs(p.up - q.up) < 2 then
          local d = math.sqrt((p.f - q.f) ^ 2 + (p.s - q.s) ^ 2)
          -- (two standing where they wait do not count: only when one of them moved in the last 2 s)
          local live = (tugs[a].moving and MT - tugs[a].moving < 2) or (tugs[b].moving and MT - tugs[b].moving < 2)
          if live and d < least then
            least, where = d, string.format('%s at %.1f / %.1f and %s at %.1f / %.1f, model time %.0f (log line %d)', tugs[a].name, p.f, p.s, tugs[b].name, q.f, q.s, MT, #LOG)
          end
        end
      end
    end
  end
  -- the aircraft: one that moves along the deck has its chocks out
  local rolling = {}
  local rollingH = {}
  HMOVED = HMOVED or {}
  for _, a in ipairs(planes) do
    local p = PLACED[a.id]
    -- (hidden: left out; where it stood before it was hidden is not its last place)
    if away(p) then p, was[a.id] = nil, nil end
    if p then
      local q = was[a.id]
      local out = JETARG[a.id .. '/23'] == 0
      if out then chocksOut[a.id] = true end
      local went = q and math.sqrt((q.f - p.f) ^ 2 + (q.s - p.s) ^ 2) > 0.05
      if went and not out then
        rolledChocked = rolledChocked + 1
        if rolledChocked == 1 then rec(string.format('first moved with its chocks in: %s at %.1f / %.1f up %.1f, model time %.0f (log line %d)', a.name, p.f, p.s, p.up, MT, #LOG)) end
      end
      if went and p.up > 20 then rolling[#rolling + 1] = { a = a, p = p, seg = { p.f - p.nf * 8.5, p.s - p.ns * 8.5, p.f + p.nf * 8.5, p.s + p.ns * 8.5 } } end
      -- (in the hangar: one that moves counts as in tow for 4 s more: one that stands waiting behind another does)
      if went and p.up <= 20 then HMOVED[a.id] = MT end
      if p.up <= 20 and p.up > 5 and HMOVED[a.id] and MT - HMOVED[a.id] < 4 then rollingH[#rollingH + 1] = { a = a, p = p, seg = { p.f - p.nf * 8.5, p.s - p.ns * 8.5, p.f + p.nf * 8.5, p.s + p.ns * 8.5 } } end
      was[a.id] = { f = p.f, s = p.s }
    end
  end
  for i, r in ipairs(rolling) do
    for _, t in ipairs(tugs) do
      local q = PLACED[t.id]
      if q and q.up > 19 and not away(q) then
        local own = math.sqrt((q.f - (r.p.f + r.p.nf * 12)) ^ 2 + (q.s - (r.p.s + r.p.ns * 12)) ^ 2) < 14
        local d = segPoint(r.seg[1], r.seg[2], r.seg[3], r.seg[4], q.f, q.s)
        if not own and d < leastAT then
          leastAT, whereAT = d, string.format('%s at %.1f / %.1f and %s at %.1f / %.1f, model time %.0f (log line %d)', r.a.name, r.p.f, r.p.s, t.name, q.f, q.s, MT, #LOG)
        end
      end
    end
    for j = i + 1, #rolling do
      local d = segSeg(r.seg, rolling[j].seg)
      if d < leastAA then
        leastAA, whereAA = d, string.format('%s at %.1f / %.1f and %s at %.1f / %.1f, model time %.0f (log line %d)', r.a.name, r.p.f, r.p.s, rolling[j].a.name, rolling[j].p.f, rolling[j].p.s, MT, #LOG)
      end
    end
  end
  for i2, r in ipairs(rollingH) do
    for _, t in ipairs(tugs) do
      local q = PLACED[t.id]
      if q and q.up <= 19 and q.up > 5 then
        local own = math.sqrt((q.f - (r.p.f + r.p.nf * 12)) ^ 2 + (q.s - (r.p.s + r.p.ns * 12)) ^ 2) < 14
        local d = segPoint(r.seg[1], r.seg[2], r.seg[3], r.seg[4], q.f, q.s)
        if not own and d < (LEAST_HT or 1e9) then
          LEAST_HT, WHERE_HT = d, string.format('%s at %.1f / %.1f and %s at %.1f / %.1f, model time %.0f (log line %d)', r.a.name, r.p.f, r.p.s, t.name, q.f, q.s, MT, #LOG)
        end
      end
    end
    for j = i2 + 1, #rollingH do
      local d = segSeg(r.seg, rollingH[j].seg)
      if d < (LEAST_HA or 1e9) then
        LEAST_HA, WHERE_HA = d, string.format('%s at %.1f / %.1f and %s at %.1f / %.1f, model time %.0f (log line %d)', r.a.name, r.p.f, r.p.s, rollingH[j].a.name, rollingH[j].p.f, rollingH[j].p.s, MT, #LOG)
      end
    end
  end
  if i % 40 == 0 then
    for k = seen + 1, #LOG do
      if LOG[k]:find('the deck is spotted', 1, true) then finished = true end
      if LOG[k]:find('NOTHING HAS MOVED', 1, true) then finished = false end
    end
    seen = #LOG
    if finished ~= nil then break end
  end
end
rec('finished ' .. tostring(finished) .. ' at model time ' .. MT)
if HIDE then
  local states = {}
  for k in pairs(HD.states) do states[#states + 1] = k end
  table.sort(states)
  rec(string.format('hidden in turn: %d frames checked, states %s, at most %d objects hidden at once, %d wrong%s', HD.n, table.concat(states, ' / '), HD.most, HD.wrong, HD.who and (': the first ' .. HD.who) or ''))
end
-- (HIDE: everything drawn again for what is counted at the end: where the aircraft stand)
if HIDE then
  CATCC_HIDE.cycle, CATCC_HIDE.on = nil, {}
  CATCC_HIDE.send()
  frames(1)
end
if THREAD then
  rec('thread: ' .. tostring(CATCC_THR and CATCC_THR.live and CATCC_THR.report()))
  rec(string.format('thread, the main thread\'s side by the real clock: %.3f ms a frame reading and sending the frame, %.3f ms a frame applying its commands (%d frames)',
    1000 * MAIN_COST.frame / math.max(1, MAIN_COST.n), 1000 * MAIN_COST.apply / math.max(1, MAIN_COST.n), MAIN_COST.n))
end
rec(string.format('processor time of the steps of the rig (a quarter of a second of real time each): %.1f s in all', CPU_ALL or 0))
if PROFILE then
  debug.sethook()
  for _, set in ipairs({ { 'the whole run', PROF }, { string.format('the slowest step (%.0f ms at model time %.0f)', PROF_WORST[1] * 1000, PROF_WORST[2]), PROF_WORST[3] } }) do
    local list, all = {}, 0
    for k, n in pairs(set[2]) do list[#list + 1] = { k, n } all = all + n end
    table.sort(list, function(a, b) return a[2] > b[2] end)
    local out = {}
    for i = 1, math.min(14, #list) do out[#out + 1] = string.format('%s %.0f%%', list[i][1], 100 * list[i][2] / math.max(1, all)) end
    rec('profile, ' .. set[1] .. ' (function by the line it is defined at, share of samples): ' .. table.concat(out, '; '))
  end
end
for _, q in ipairs(SLOW or {}) do
  local first = ''
  for k = q[3], math.min(q[4], q[3] + 60) do
    local l = tostring(LOG[k])
    if l:find('tow:', 1, true) or l:find('demo:', 1, true) then
      first = first .. ' | ' .. l:gsub('^.-hook%s+', ''):sub(1, 110)
      if #first > 330 then break end
    end
  end
  rec(string.format('slow step: %.0f ms at model time %.0f (log lines %d to %d)%s', q[1] * 1000, q[2], q[3], q[4], first))
end
rec(string.format('the farthest a tractor moved between two frames of the rig (%.2f s of the mission): %.2f m: %s', 0.25 * (ACCEL or 1), JUMP_T or 0, tostring(JUMP_TW)))
rec(string.format('least distance between two tractors (one of them moving): %.1f m: %s', least, where))
rec(string.format('least distance between an aircraft in tow (its centre line) and a tractor that is not its own: %.1f m: %s', leastAT, whereAT))
rec(string.format('least distance between two aircraft in tow (their centre lines): %.1f m: %s', leastAA, whereAA))
rec(string.format('least distance IN THE HANGAR between an aircraft in tow (its centre line) and a tractor that is not its own: %.1f m: %s', LEAST_HT or -1, tostring(WHERE_HT)))
rec(string.format('least distance IN THE HANGAR between two aircraft in tow (their centre lines): %.1f m: %s', LEAST_HA or -1, tostring(WHERE_HA)))
for _, t in ipairs(tugs) do
  local p = PLACED[t.id]
  rec(string.format('%s ends at %.1f / %.1f up %.2f', t.name, p.f, p.s, p.up))
end
-- where every aircraft ended: against its spot
local n = 0
for _, e in ipairs(RT) do
  if e.spot and e.id then
    local best = 1e9
    for _, a in ipairs(planes) do
      local p = PLACED[a.id]
      if p and p.up > 20 then best = math.min(best, math.sqrt((p.f - e.x) ^ 2 + (p.s - e.z) ^ 2)) end
    end
    if best < 0.05 then n = n + 1 else rec(string.format('spot %s: the nearest aircraft on the flight deck is %.2f m off', e.id, best)) end
  end
end
rec('spots with their aircraft on them: ' .. n)
local folded = 0
for _, a in ipairs(planes) do if JETARG[a.id .. '/8'] == 1 then folded = folded + 1 end end
rec('wings folded: ' .. folded)
-- the board numbers: what arguments 442 / 31 / 32 read on each aircraft (hundreds, tens, units; a digit d as d / 10)
local boards = {}
for _, a in ipairs(planes) do
  local h, t, u = JETARG[a.id .. '/442'], JETARG[a.id .. '/31'], JETARG[a.id .. '/32']
  if h and t and u then boards[#boards + 1] = math.floor(h * 10 + 0.5) * 100 + math.floor(t * 10 + 0.5) * 10 + math.floor(u * 10 + 0.5) end
end
table.sort(boards)
rec('board numbers on ' .. #boards .. ' aircraft: ' .. table.concat(boards, ' '))
local nOut, chocked, covered, bars = 0, 0, 0, 0
for _ in pairs(chocksOut) do nOut = nOut + 1 end
for _, a in ipairs(planes) do
  if JETARG[a.id .. '/23'] == 1 then chocked = chocked + 1 end
  if JETARG[a.id .. '/24'] == 1 then covered = covered + 1 end
end
for name in pairs(STATICS) do if name:find('^catcc%-demo%-a%d+%-bar') then bars = bars + 1 end end
rec(string.format('chocks: out on %d aircraft while they were towed, %d samples of an aircraft moving with them in; in on %d at the end; covers on %d at the end; tow bars left %d', nOut, rolledChocked, chocked, covered, bars))
-- (COCKPIT_ON: the canopies the brake riders opened (argument 38 at 0.9) and left open)
if COCKPIT_ON then
  local open = 0
  for _, a in ipairs(planes) do if math.abs((JETARG[a.id .. '/38'] or 0) - 0.9) < 1e-4 then open = open + 1 end end
  rec('canopies open at the end: ' .. open)
end
if not NO_JET then
  click('CATCC demo: report')
  frames(1)
end
-- (HIDE: the drivers hidden when it stops: they are put back on their seats, the demo's objects are taken away)
if HIDE then
  CATCC_HIDE.cycle, CATCC_HIDE.on = nil, { drivers = true }
  CATCC_HIDE.send()
  frames(1)
end
-- stopped: everything is taken away, the elevators are told up, the bubbles let go
toggle()
frames(2)
if HIDE then
  local away = 0
  for i = 0, 9 do
    local q = byH[105 + i]
    if q and q.x and q.x <= -899 then away = away + 1 end
  end
  rec('drivers left away after the stop: ' .. away)
end
if COCKPIT_ON then
  local away = 0
  for i = 0, 8 do
    local q = byH[130 + i]
    if q and q.x and q.x <= -899 then away = away + 1 end
  end
  rec('brake riders away after the stop: ' .. away)
end
local left = 0
for name in pairs(STATICS) do if name:find('catcc-demo', 1, true) then left = left + 1 end end
rec('left after the stop: ' .. left)
-- RESTART=true: the mission ends and another begins in the same DCS; the demo is started again, runs two minutes, and
-- the mission ends with it running. (On its own thread: the worker is stopped with the mission and a new one starts
-- with the next demo.)
if RESTART then
  local function count()
    local n = 0
    for name in pairs(STATICS) do if name:find('catcc-demo', 1, true) then n = n + 1 end end
    return n
  end
  local function state() return THREAD and (NATIVE.worker_state()) or 'no thread' end
  local l0 = #LOG
  HANDLER.onSimulationStop()
  rec('restart: the mission ended: worker ' .. state())
  MT = 0
  HANDLER.onSimulationStart()
  frames(1)
  toggle()
  frames(2)
  local made = count()
  local moved0 = {}
  for id, p in pairs(PLACED) do moved0[id] = { p.f, p.s, p.up } end
  for _ = 1, 480 do frames(0.25) end
  local movedN = 0
  for id, p in pairs(PLACED) do
    local q = moved0[id]
    if q and (math.abs(q[1] - p.f) > 0.5 or math.abs(q[2] - p.s) > 0.5 or math.abs(q[3] - p.up) > 0.5) then movedN = movedN + 1 end
  end
  rec(string.format('restart: a second mission: worker %s, %d things of the demo made again, %d of them moved in two minutes', state(), made, movedN))
  HANDLER.onSimulationStop()
  frames(1)
  local started, stopped, errs = 0, 0, 0
  for k = l0 + 1, #LOG do
    if LOG[k]:find('demo thread: started', 1, true) then started = started + 1 end
    if LOG[k]:find('demo thread: stopped', 1, true) then stopped = stopped + 1 end
    if LOG[k]:find('demo thread: error', 1, true) or LOG[k]:find('frame error', 1, true) or LOG[k]:find('demo: error', 1, true) then errs = errs + 1 end
  end
  rec(string.format('restart: the mission ended with the demo running: worker %s; the thread started %d time(s) and was stopped %d time(s) since the first mission; errors %d', state(), started, stopped, errs))
end
