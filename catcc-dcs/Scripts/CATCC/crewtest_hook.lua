-- CATCC crew test hook (DCS GameGUI hook environment, Lua 5.1). TEST ONLY.
--
-- Loaded by Scripts/Hooks/CATCC-crewtest-hook.lua; does nothing unless Saved Games\DCS\Config\CATCC-test.lua
-- has crewTest = true (deck-test/crew-test/install.ps1 sets it). The question: can code of ours see and
-- command the Supercarrier's deck crew characters? The work is done by the native module
-- (Scripts\CATCC\bin\catcc_crew.dll, source deck-test/crew-test/native/catcc_crew.cpp); this file
--   * installs the F10 menu into the mission (Scripts/CATCC/crewtest.lua) and takes its commands,
--   * lists the people on deck once, when the simulation of each mission has run for 8 s (so flying a
--     mission with the deck crew option off already answers "who is there without it"); if the quick
--     scan finds nobody it goes on to the memory scan by itself,
--   * keeps to the people of the PLAYER'S ship: every carrier in a mission has its own full crew at the
--     same ship coordinates (2026-11-14: two carriers, and "the nearest yellow shirt" was the other
--     ship's, who then walked off his deck towards ours),
--   * runs each command on a target person and then watches him for a while (where he goes, which
--     states he passes through), so the result can be read afterwards,
--   * records, once a second, every state change and movement of everyone on the player's ship, and the
--     jet's position: the native choreography while the jet taxies ends up in the log without anyone asking,
--   * records, twice a second, which signal animation each of them plays (name, length, loop values,
--     blend-space coordinates): follow DCS's own directors once and the log holds their whole vocabulary,
--   * gives the directors' signals as DCS's own directors play them (recorded with the above): blend
--     spaces whose torso angle follows the pilot, attention on taking the jet, pass control on handing
--     it over; and a night mode (light wands, arm pose, the "night_" set),
--   * has an automatic signal test on a person of ours: every signal in turn, day and night, watched
--     through the same readout, so the log says what played as sent,
--   * has a small demo of directors of our own: one or two people of ours bring the jet 12 m ahead
--     with attention / come ahead / left / right / pass control / stop worked out here,
--   * marshals the jet to a catapult picked from the menu: people of ours stationed along a taxi route
--     from PriFly's taxi network (Scripts/CATCC/crewtest_routes.lua), handing the jet from one to the
--     next up to the catapult's start box, where the catapult's own crew takes over,
--   * says what happened on screen and writes everything to Saved Games\DCS\Logs\catcc-crewtest.log
--     (appended, flushed line by line: it survives a crash, and the native module writes its own
--     lines to the same file before and after every call into DCS).
-- Everything runs inside pcall: an error here must never affect DCS.

local writedir = (lfs and lfs.writedir and lfs.writedir()) or ''
local unpack = unpack or table.unpack
local atan2 = math.atan2 or math.atan

do
  local on = false
  local f = loadfile(writedir .. 'Config/CATCC-test.lua')
  if f then
    local ok, t = pcall(f)
    on = ok and type(t) == 'table' and t.crewTest == true
    -- (demoThread = false in Config/CATCC-test.lua: the deck spotting demo on DCS's main thread, as before it had a
    -- thread of its own: Tow.Thr, below)
    if on and t.demoThread == false then CATCC_DEMO_THREAD = false end
  end
  if not on then return end
end

local LOG = writedir .. 'Logs/catcc-crewtest.log'
local STATE = 'server' -- net.dostring_in state that reaches the mission scripting environment

-- (CATCC_WORKER: this file is running a second time, on the deck spotting demo's own thread (crewtest_worker.lua): its
-- log lines and messages go to the main thread, which writes and shows them)
local function logLine(s)
  if CATCC_WORKER then return CATCC_WORKER.log(s) end
  local f = io.open(LOG, 'a')
  if f then
    f:write(os.date('%H:%M:%S'), ' hook    ', s, '\n')
    f:close()
  end
end
local function info(s)
  if CATCC_WORKER then return CATCC_WORKER.info(s) end
  logLine(s)
  if log and log.write then log.write('CATCC-CREW', log.INFO, s) end
end
local function now() return (DCS and DCS.getRealTime and DCS.getRealTime()) or os.clock() end
local function dostring(code) return net.dostring_in(STATE, code) end

-- on screen (20 s) and in the log
-- On-screen messages can be switched off (F10 > Tow > Messages on screen: hide / show): for filming. Hidden, every
-- message still goes to the log ("SAY (not shown) ..."). Back on with every new mission.
-- The in-game panel (Scripts/CATCC/crewtest_ui.lua, the global CATCC_UI once it is loaded) shows every message as its
-- last line, hidden or not.
local quiet = false
-- clear: the message takes the place of what is on the screen (outText's third argument) instead of stacking under it.
local function say(text, secs, clear)
  if CATCC_WORKER then return CATCC_WORKER.say(text, secs, clear) end
  if CATCC_UI and CATCC_UI.said then pcall(CATCC_UI.said, text) end
  if quiet then return info('SAY (not shown) ' .. text) end
  info('SAY ' .. text)
  pcall(dostring, string.format('trigger.action.outText(%q, %d%s)', 'CATCC crew test: ' .. text, secs or 20, clear and ', true' or ''))
end

-- ---------------------------------------------------------------- the native module
local native, nativeWhy
do
  local path = writedir .. 'Scripts\\CATCC\\bin\\catcc_crew.dll'
  local ok, loader, err = pcall(package.loadlib, path, 'luaopen_catcc_crew')
  if ok and loader then
    local ok2, m = pcall(loader)
    if ok2 and type(m) == 'table' then native = m else nativeWhy = 'it did not start: ' .. tostring(m) end
  else
    nativeWhy = tostring(ok and err or loader)
  end
  logLine('================ DCS started; crew test hook loaded ================')
  if native then
    pcall(native.setlog, LOG)
    local ok3, inf = pcall(native.info)
    if ok3 and type(inf) == 'table' then
      info('native module ' .. tostring(inf.version) .. ' loaded')
    end
  else
    info('native module not loaded: ' .. tostring(nativeWhy))
  end
end

-- ---------------------------------------------------------------- state
local missionRunning = false
local installed, lastInstallAt, installWarned, nativeSaid = false, -1e9, false, false
local lastPollAt = 0
local startT, lastAutoTry, autoListed = nil, -1e9, false
local target = 'nearest'
local watch, pending, demo, sigtest, marsh = nil, nil, nil, nil, nil -- marsh: the marshalling along a route, if one runs
local captain -- the plane captain of ours, if one has been called out (commands.captain)
local launchCat -- the catapult this jet is to launch from (the menu's "My catapult": stands in for PriFly's launch plan)
local holding, nightOn = {}, {} -- by handle: the signal he is on (and what he looks at); night set in use
local dumped, symbolsLogged = false, false
local DUR, BS, animInfoDone = {}, {}, false -- animation lengths (s) and blend spaces, by name (loadAnimInfo)
local CUSTOM_CLIP = 'catcc_test_clip' -- the animation clip our own mod adds (crew-test/Mods/tech/CATCC-Crew)
local customClip -- nil: not looked for yet; false: not in the list; else its entry
local frameErrLogged = false

local TARGETS = { 'nearest', 'yellow', 'ours', 'cat', 'model' }
local TARGET_TEXT = {
  nearest = 'the nearest person',
  yellow = 'the nearest yellow shirt',
  ours = 'the nearest person of ours (catcc-..., green shirt)',
  cat = 'the nearest catapult crew member',
  model = 'the plane captain (catcc-m0, the brown shirt)',
}

local function split(s)
  local t = {}
  for part in (s .. '|'):gmatch('(.-)|') do t[#t + 1] = part end
  return t
end

-- where the player's jet and the carrier are this instant (Scripts/CATCC/crewtest.lua, CATCC_CR.ctx)
-- (px, pz: a point of the world, or name: a ship's unit name: the carrier chosen by that, not by where the jet stands:
-- the deck spotting tool's)
local function getCtx(px, pz, name)
  local args = name and string.format('nil, nil, %q', name) or ((px and pz) and string.format('%.3f, %.3f', px, pz) or '')
  local ok, s = pcall(dostring, 'return (CATCC_CR and CATCC_CR.ctx) and CATCC_CR.ctx(' .. args .. ') or "ERR|menu script not installed"')
  if not ok or type(s) ~= 'string' then return nil, tostring(s) end
  local p = split(s)
  if p[1] ~= 'OK' then return nil, p[2] or s end
  local c = { unit = p[2], ship = p[3], s = {} }
  for i = 1, 12 do
    c.s[i] = tonumber(p[3 + i])
    if not c.s[i] then return nil, 'bad context' end
  end
  c.jx, c.jy, c.jz, c.fx, c.fz = tonumber(p[16]), tonumber(p[17]), tonumber(p[18]), tonumber(p[19]), tonumber(p[20])
  if not (c.jx and c.jy and c.jz and c.fx and c.fz) then return nil, 'bad context' end
  return c
end

-- ---------------------------------------------------------------- people
local function kind(p)
  local n = p.name or ''
  if n:find('^yellow') then return 'yellow' end
  if n:find('^brown') then return 'brown' end
  if n:find('^catcc') then return 'ours' end
  return 'cat' -- the catapult crews: shooter, director, white1, white2, green_hbb, green_nw
end

-- What a person of ours is for (2026-11-15): catcc-m0 is the plane captain (a brown shirt), catcc-t0 the
-- tow tractor's driver, everyone else (catcc-c0..: yellow shirts) a flight director.
local function role(p)
  local n = tostring(p.name or '')
  if n == 'catcc-m0' then return 'captain' end
  -- (catcc-t1 .. t7: the deck spotting demo's seven more drivers)
  if n:find('^catcc%-t%d') then return 'driver' end
  -- (catcc-b0 .. b8: the deck spotting demo's brake riders, brown shirts: crewtest_cockpit.lua)
  if n:find('^catcc%-b%d') then return 'rider' end
  return 'director'
end

local function distTo(p, x, z)
  if not (p.x and p.z) then return nil end
  return math.sqrt((p.x - x) ^ 2 + (p.z - z) ^ 2)
end

-- Which of the people are on the player's ship?
--   1. Each man is attached to something (his ship): where that is in the world against where the
--      player's ship is (the same object: within 30 m).
--   2. Failing that, a man's own world position against the ship's (deck crew stand within 180 m of
--      their ship's origin); then, among those, everyone attached to the same thing as most of them,
--      which also leaves out a man from another ship who has walked close.
-- Sets r.mine, r.elsewhere, r.byShip (false if no world position could be read: then everyone counts).
local SHIP_M = 250
local function sortShips(r, ctx)
  r.mine, r.elsewhere, r.byShip = {}, 0, false
  if not ctx then
    r.mine = r.people
    return
  end
  for _, p in ipairs(r.people) do
    if p.wx then p.wd = math.sqrt((p.wx - ctx.s[10]) ^ 2 + (p.wz - ctx.s[12]) ^ 2) end
    if p.pwx and math.sqrt((p.pwx - ctx.s[10]) ^ 2 + (p.pwz - ctx.s[12]) ^ 2) <= 30 then r.mine[#r.mine + 1] = p end
  end
  if #r.mine > 0 then
    r.byShip = 'ship'
    r.elsewhere = #r.people - #r.mine
    return
  end
  local near, parents = {}, {}
  for _, p in ipairs(r.people) do
    if p.wx then
      r.byShip = 'position'
      if p.wd <= SHIP_M then
        near[#near + 1] = p
        local k = p.parent or 0
        parents[k] = (parents[k] or 0) + 1
      end
    end
  end
  if not r.byShip then
    r.mine = r.people
    return
  end
  local best, bn = nil, 0
  for k, n in pairs(parents) do
    if n > bn then best, bn = k, n end
  end
  for _, p in ipairs(near) do
    if (p.parent or 0) == best then r.mine[#r.mine + 1] = p end
  end
  r.elsewhere = #r.people - #r.mine
end

local SRC = { 'crew environment', 'object registry', 'memory scan' }

local function personLine(p, ctx)
  local pos = p.x and string.format('on ship %.2f fwd, %.2f up, %.2f stbd', p.x, p.y, p.z) or ('position unreadable, raw: ' .. tostring(p.rawloc))
  local wld = p.wx and string.format('; world %.1f, %.1f, %.1f (%.0f m from the ship)', p.wx, p.wy, p.wz, p.wd or -1) or '; world position n/a'
  if p.pwx then wld = wld .. string.format('; his ship at %.1f, %.1f, %.1f', p.pwx, p.pwy, p.pwz) end
  local d = ctx and distTo(p, ctx.jx, ctx.jz)
  local routes = p.routes == 1 and 'has routes' or (p.routes == 0 and 'no routes' or 'routes ?')
  return string.format('  %-12s full "%s" class %s id %s state %s, %s, %s, found by %s, layout %s, parent %s; %s%s%s', tostring(p.name), tostring(p.full),
    tostring(p.cls), tostring(p.id), tostring(p.state), p.movable and 'can walk' or 'cannot walk', routes, SRC[p.src] or tostring(p.src),
    tostring(p.layout), string.format('%.0f', p.parent or 0), pos, wld, d and string.format('; %.1f m from the jet in ship coordinates', d) or '')
end

local function logClasses(classes, top)
  table.sort(classes, function(a, b) return a.n > b.n end)
  for i, c in ipairs(classes) do
    if top and i > top then
      logLine(string.format('    ... %d more classes', #classes - top))
      break
    end
    logLine(string.format('    x%-5d %s%s  bases: %s', c.n, c.name, c.person and ' (CHARACTER)' or '', c.bases))
  end
end

-- ---------------------------------------------------------------- the recorder
-- Once a second, everyone on the player's ship is asked for his state and position; a line is logged
-- only when the state changes or he has moved half a metre. With the jet's position every 2 s (when it
-- has moved a metre) the log then holds the native choreography: who walks where, and when, as the jet
-- taxies, and what happens to someone after one of our commands. Reads only.
local recPeople, recNextT, recJetT, recJet = {}, 0, 0, nil

local function recorderSet(r)
  local old = recPeople
  recPeople = {}
  for _, p in ipairs(r.mine) do
    recPeople[p.h] = old[p.h] or { name = tostring(p.full ~= '' and p.full or p.name), st = p.state, x = p.x, z = p.z }
  end
end

local function tickRecorder(t)
  if not native then return end
  -- (each man asked once a second, FOUR MEN A FRAME AT MOST: all thirty in one frame, every second, was a hitch every
  -- second; 2026-11-17, the user: "a persistent stutter throughout the run")
  local asked = 0
  for h, q in pairs(recPeople) do
    if asked >= 4 then break end
    if (q.recAt or 0) <= t then
    q.recAt = t + 1
    asked = asked + 1
    local ok, st, x, _, z = pcall(native.state, h, false)
    if not ok or st == nil then
      recPeople[h] = nil
      logLine(string.format('  rec %-15s gone', q.name))
    else
      local moved = (x and q.x) and math.sqrt((x - q.x) ^ 2 + (z - q.z) ^ 2) or 0
      -- (a tractor's driver, catcc-t0 .. t7, is carried on his seat: where the tractor goes is in the tow's own lines;
      -- eight of them moving wrote eight lines a second for half an hour in the deck spotting demo)
      if tostring(q.name):find('^catcc%-t%d') then moved = 0 end
      if st ~= q.st or moved >= 0.5 then
        logLine(string.format('  rec %-15s state %s at %s', q.name, tostring(st), x and string.format('%.2f fwd %.2f stbd', x, z) or '?'))
        q.st = st
        if x then q.x, q.z = x, z end
      end
    end
    end
  end
  if t >= recJetT then
    recJetT = t + 2
    local ctx = getCtx()
    if ctx and (not recJet or math.sqrt((ctx.jx - recJet.x) ^ 2 + (ctx.jz - recJet.z) ^ 2) >= 1) then
      recJet = { x = ctx.jx, z = ctx.jz }
      logLine(string.format('  rec jet             at %.2f fwd %.2f stbd, nose %.2f %.2f', ctx.jx, ctx.jz, ctx.fx, ctx.fz))
    end
  end
end

-- ---------------------------------------------------------------- what the carrier's ATC says
-- Once a second the ship's own air traffic control is asked (native.deck: woATC's exported getters):
-- can a landing start, can a take-off start, is the deck foul, is the runway open, how many catapults
-- are free, which recovery case. A line is logged when any of it changes. This is how to see what holds
-- a recovery back: on 2026-11-15 the AI flight orbited for as long as the player sat in a hot-start jet
-- on deck, and DCS cleared the waist catapults for it 58 s after he left that slot.
local deckSeen, deckOff, deckT = nil, false, 0

local function deckText(d)
  return string.format('can start landing %s, can start take-off %s, foul deck %s, runway open %s, free catapults %s, recovery case %s', d.canLand and 'YES' or 'no',
    d.canTakeoff and 'YES' or 'no', d.foul and 'YES' or 'no', d.rwOpen and 'yes' or 'NO', tostring(d.freeCats), tostring(d.recoveryCase))
end

local function deckNow()
  if deckOff or not native or not native.deck then return nil end
  local h = next(recPeople)
  if not h then return nil end
  local ok, d, e = pcall(native.deck, h)
  if not ok or type(d) ~= 'table' then
    deckOff = true
    logLine('  deck: the ATC could not be asked (' .. tostring(ok and e or d) .. '): not asked again this mission')
    return nil
  end
  return deckText(d)
end

local function tickDeck(t)
  if t < deckT then return end
  deckT = t + 1
  local s = deckNow()
  if s and s ~= deckSeen then
    logLine('  deck: ' .. s .. (deckSeen and '' or ' (first reading)'))
    deckSeen = s
  end
end

-- Twice a second, what everyone on the player's ship is playing (native.anim: the readout DCS's own
-- debug inspector uses). Logged: a signal starting or ending (an animation with "sign" or "pass" in its
-- name: the idles, walks and turns in between are not), the same signal started again, and a blend
-- space's coordinates moving (at most one line a second per person). Follow DCS's directors to the
-- catapult once with this running and the log holds what they play, when, and with which blend values.
local recAnimT = 0
local function interesting(n) return n:find('sign', 1, true) ~= nil or n:find('pass', 1, true) ~= nil end
local function animText(a)
  return string.format('"%s" (length %.2f, loop %.3g/%.3g/%.3g, blend %.2f %.2f, started %.1f)', tostring(a.name), a.dur or 0, a.l1 or 0, a.l2 or 0, a.l3 or 0,
    a.bx or 0, a.by or 0, a.start or 0)
end

local function tickAnimRec(t)
  if not (native and native.anim) then return end
  -- (each man twice a second, four men a frame at most: see tickRecorder)
  local asked = 0
  for h, q in pairs(recPeople) do
    if asked >= 4 then break end
    if (q.anAt or 0) <= t and (not q.animOff or t >= q.animOff) then
      q.anAt = t + 0.5
      asked = asked + 1
      local ok, a = pcall(native.anim, h)
      if not ok or type(a) ~= 'table' then
        q.animOff = t + 10 -- not readable just now: asked again in 10 s
      else
        local was = q.an
        local sig = interesting(a.name)
        if a.name ~= was then
          if sig or (was and interesting(was)) then
            logLine(string.format('  rec %-15s plays %s%s', q.name, animText(a), was and string.format(' after "%s" for %.1f s', was, t - (q.anT or t)) or ''))
          end
          q.an, q.anT, q.anStart, q.bx, q.by, q.anLog = a.name, t, a.start, a.bx or 0, a.by or 0, t
        elseif sig and t - (q.anLog or 0) >= 1 then
          if a.start ~= q.anStart then
            logLine(string.format('  rec %-15s again %s', q.name, animText(a)))
            q.anStart, q.anLog = a.start, t
          elseif math.abs((a.bx or 0) - q.bx) >= 0.1 or math.abs((a.by or 0) - q.by) >= 0.1 then
            logLine(string.format('  rec %-15s blend %.2f %.2f ("%s")', q.name, a.bx or 0, a.by or 0, a.name))
            q.bx, q.by, q.anLog = a.bx or 0, a.by or 0, t
          end
        end
      end
    end
  end
end

-- Every animation's length and every blend space's axes, once a mission, into the log and into DUR / BS.
local function loadAnimInfo(p)
  if animInfoDone or not (native and native.animinfo and p) then return end
  animInfoDone = true
  local ok, list, err = pcall(native.animinfo, p.h)
  if not ok or type(list) ~= 'table' then return logLine('animation data not readable: ' .. tostring(ok and err or list)) end
  local signs, nbs, bad = {}, 0, 0
  customClip = false
  for _, a in ipairs(list) do
    local n = tostring(a.name)
    if n == CUSTOM_CLIP then customClip = a end
    if a.err ~= 0 then
      bad = bad + 1
    elseif (a.x and a.x ~= '') or n:find('^bs_') or n:find('^night_bs_') then
      BS[n] = a
      nbs = nbs + 1
      logLine(string.format('  blend space %-24s index %d, id %d: x "%s" %.4g..%.4g (default %.4g), y "%s" %.4g..%.4g (default %.4g)', n, a.idx, a.id, a.x or '',
        a.x1 or 0, a.x2 or 0, a.dx or 0, a.y or '', a.y1 or 0, a.y2 or 0, a.dy or 0))
    elseif a.dur and a.dur > 0 then
      DUR[n] = a.dur
      if n:find('^sign') then signs[#signs + 1] = string.format('%s %.2f', n, a.dur) end
    end
  end
  logLine(string.format('animation data: %d names, %d blend spaces, %d unreadable; lengths (s) of the signals:', #list, nbs, bad))
  for i = 1, #signs, 6 do logLine('    ' .. table.concat(signs, ' | ', i, math.min(i + 5, #signs))) end
  -- a clip of our own, put into DCS by a mod (Saved Games\Mods\tech\CATCC-Crew: its animations path mounted, the
  -- clip in the folder of the deck crew's skeleton): is it among the animations these people can play?
  logLine(customClip and string.format('our mod\'s animation clip "%s": IN the list (index %d, length %.2f s)', CUSTOM_CLIP, customClip.idx or -1, customClip.dur or 0)
    or string.format('our mod\'s animation clip "%s": NOT in the list of %d', CUSTOM_CLIP, #list))
  -- The liveries DCS has for the deck crew's figure (2026-11-17: the tow driver wears "blue"), as the mission
  -- editor asks for a type's liveries (loadLiveries.lua): by the crew members' unit_type, and by their model's name.
  for _, entry in ipairs({ 'us carrier shooter', 'carrier_shooter' }) do
    local okl, names = pcall(function()
      local out = {}
      for _, v in ipairs(DCS.getObjectLiveriesNames(entry, nil, 'en') or {}) do out[#out + 1] = tostring(v[1]) end
      return out
    end)
    logLine(string.format('liveries of "%s": %s', entry, okl and (#names > 0 and table.concat(names, ', ') or 'none listed') or ('not readable: ' .. tostring(names))))
  end
end

local function logSymbols()
  if symbolsLogged or not native then return end
  symbolsLogged = true
  local ok, inf = pcall(native.info)
  if not (ok and type(inf) == 'table') then return end
  if #inf.missing == 0 then
    if not CATCC_WORKER then logLine('DCS functions: all found') end
  else
    info('DCS functions NOT found (' .. #inf.missing .. '): ' .. table.concat(inf.missing, '; '))
  end
end

-- the quick scan (crew environments, then the object registry's kind 0x20), sorted by ship
local function doScan(ctx, why, verbose)
  logSymbols()
  local ok, r = pcall(native.scan)
  if not ok or type(r) ~= 'table' then
    info('scan failed: ' .. tostring(r))
    return nil
  end
  sortShips(r, ctx)
  logLine(string.format('scan (%s): %d crew environment(s) holding %d objects (err %d); object registry kind 0x20: %d objects (err %d); %d characters, %d on the player\'s ship%s; names read %d, unreadable %d; objects without type info %d',
    why, r.envs, r.envObjects, r.envErr, r.regCount, r.regErr, #r.people, #r.mine,
    r.byShip and (' (told apart by ' .. (r.byShip == 'ship' and "their ship's position" or 'their own position') .. ')') or ' (NO world positions: ships not told apart)',
    r.strOk, r.strBad, r.noRtti))
  if verbose then
    logClasses(r.classes)
    loadAnimInfo(r.mine[1])
    for _, p in ipairs(r.mine) do logLine(personLine(p, ctx)) end
    if r.elsewhere > 0 then
      logLine(string.format('  (and %d on other ships)', r.elsewhere))
      for _, p in ipairs(r.people) do
        if (p.wd or 0) > SHIP_M and p.wx and (p.x and (math.abs(p.x) > 200 or math.abs(p.z) > 60)) then logLine('  off his ship: ' .. personLine(p, nil)) end
      end
    end
    if not dumped and #r.mine > 0 then
      -- one yellow shirt's and one other character's own memory, once: for working out what else is in there
      dumped = true
      local seen = {}
      for _, p in ipairs(r.mine) do
        local k = kind(p) == 'yellow' and 'yellow' or 'other'
        if not seen[k] then
          seen[k] = true
          for off = 0, 1792, 256 do
            local ok2, hex = pcall(native.dump, p.h, off, 256)
            if ok2 and hex then logLine(string.format('  memory of %s +0x%03x: %s', tostring(p.name), off, hex)) end
          end
        end
      end
    end
  end
  recorderSet(r)
  return r
end

local function summary(r, ctx)
  if #r.people == 0 then
    return string.format('no people found (%d crew environment(s) holding %d objects, %d world objects)', r.envs, r.envObjects, r.regCount)
  end
  local n = { yellow = 0, brown = 0, ours = 0, cat = 0 }
  local near, ours = {}, {}
  for _, p in ipairs(r.mine) do
    n[kind(p)] = n[kind(p)] + 1
    if kind(p) == 'ours' then ours[#ours + 1] = tostring(p.name) end
    local d = ctx and distTo(p, ctx.jx, ctx.jz)
    if d then near[#near + 1] = { p = p, d = d } end
  end
  table.sort(near, function(a, b) return a.d < b.d end)
  table.sort(ours)
  local s = string.format('%d people on your ship: %d yellow, %d brown, %d catapult crew. People of ours: %s.', #r.mine, n.yellow, n.brown, n.cat,
    #ours > 0 and table.concat(ours, ', ') or 'NONE')
  if r.elsewhere > 0 then s = s .. string.format(' (%d more on other ships.)', r.elsewhere) end
  if not r.byShip then s = s .. ' (Ships could not be told apart: no world positions.)' end
  if #near > 0 then
    local parts = {}
    for i = 1, math.min(3, #near) do parts[i] = string.format('%s %.0f m', tostring(near[i].p.name), near[i].d) end
    s = s .. ' Nearest to you: ' .. table.concat(parts, ', ') .. '.'
  else
    s = s .. ' (their positions could not be read: see the log)'
  end
  return s
end

-- the slow scan: the process's own memory
local function memoryScan(ctx)
  logLine('memory scan ...')
  local ok, h = pcall(native.heapscan, 30)
  if not ok or type(h) ~= 'table' then
    info('memory scan failed: ' .. tostring(h))
    return nil
  end
  logLine(string.format('memory scan: %.1f s, %.0f MB read (%.0f MB not in memory, left alone), %d pointers of interest, %d new characters, %d faults, %s',
    h.seconds, h.bytes / 1048576, (h.skipped or 0) / 1048576, h.hits, #h.people, h.faults, h.err == 0 and 'complete' or 'out of time (partial)'))
  logClasses(h.classes, 40)
  for _, p in ipairs(h.people) do logLine(personLine(p, ctx)) end
  return h
end

local function matches(p, mode)
  if mode == 'model' then return p.name == 'catcc-m0' end
  return mode == 'nearest' or mode == kind(p)
end

local function pick(r, ctx, mode)
  local best, bd
  for _, p in ipairs(r.mine) do
    if matches(p, mode or target) then
      local d = distTo(p, ctx.jx, ctx.jz) or 1e9
      if not bd or d < bd then best, bd = p, d end
    end
  end
  return best, bd
end

-- ---------------------------------------------------------------- watching a person after a command
local function startWatch(p, secs, tgt, why)
  local t = now()
  watch = { h = p.h, name = tostring(p.name), untilT = t + secs, nextT = t, t0 = t, tgt = tgt, why = why, path = 0, states = {}, samples = 0 }
  logLine(string.format('watch %s for %d s (%s)', watch.name, secs, why))
end

local function finishWatch(w)
  local parts = { string.format('%s, %d s after "%s":', w.name, math.floor(now() - w.t0 + 0.5), w.why) }
  if w.first and w.last then
    local moved = math.sqrt((w.last.x - w.first.x) ^ 2 + (w.last.z - w.first.z) ^ 2)
    parts[#parts + 1] = string.format('ended %.1f m from where he started (walked %.1f m).', moved, w.path)
    if w.tgt then
      parts[#parts + 1] = string.format('Now %.1f m from the target (was %.1f m).', math.sqrt((w.last.x - w.tgt.x) ^ 2 + (w.last.z - w.tgt.z) ^ 2),
        math.sqrt((w.first.x - w.tgt.x) ^ 2 + (w.first.z - w.tgt.z) ^ 2))
    end
  else
    parts[#parts + 1] = 'his position could not be read.'
  end
  parts[#parts + 1] = 'States (0 standing, 1 moving): ' .. (#w.states > 0 and table.concat(w.states, ' > ') or '?') .. '.'
  if w.nearMin then
    -- (a straight walk goes through the middle; a Hornet is 17 m long and 8 to 11 m across)
    parts[#parts + 1] = string.format('The nearest he came to the middle of your jet: %.1f m (he walked %.1f m; the straight line is %.1f m).', w.nearMin, w.path,
      (w.first and w.tgt) and math.sqrt((w.first.x - w.tgt.x) ^ 2 + (w.first.z - w.tgt.z) ^ 2) or 0)
  end
  say(table.concat(parts, ' '))
end

local function tickWatch(t)
  local w = watch
  if not w or t < w.nextT then return end
  w.nextT = t + 0.5
  local ok, st, x, _, z = pcall(native.state, w.h, false)
  if not ok or st == nil then
    watch = nil
    return say(string.format('%s: lost sight of him (%s)', w.name, tostring(x or st)))
  end
  w.samples = w.samples + 1
  if x and z then
    if not w.first then w.first = { x = x, z = z } end
    if w.last then w.path = w.path + math.sqrt((x - w.last.x) ^ 2 + (z - w.last.z) ^ 2) end
    w.last = { x = x, z = z }
    if w.near then
      local dn = math.sqrt((x - w.near.x) ^ 2 + (z - w.near.z) ^ 2)
      w.nearMin = math.min(w.nearMin or dn, dn)
    end
  end
  local label = tostring(st)
  if label ~= w.lastLabel then
    w.lastLabel = label
    if #w.states < 12 then w.states[#w.states + 1] = label end
    logLine(string.format('  watch %s +%.1f s: state %s at %s', w.name, t - w.t0, label, x and string.format('%.2f fwd %.2f stbd', x, z) or '?'))
  elseif w.samples % 10 == 0 and x then
    logLine(string.format('  watch %s +%.1f s: at %.2f fwd %.2f stbd', w.name, t - w.t0, x, z))
  end
  if t >= w.untilT then
    watch = nil
    finishWatch(w)
  end
end

-- ---------------------------------------------------------------- walk orders
-- A walk order given to a man who is already walking can leave him walking on the spot (2026-11-14:
-- a catapult crew sent back mid-walk; three of the six turned round and stayed there, legs going), or
-- jump him to the new place at once. So a man who is moving gets the new order when he stands (asked
-- four times a second), however long that takes. The latest order for a man replaces an earlier one
-- still waiting.
-- The waiting order keeps only the place on the ship: where the ship is in the world is asked for
-- afresh when the order is given (a carrier at 30 kn has moved 60 m in four seconds, and the module
-- refuses an order whose ship position is stale: that left a crew standing on 2026-11-14).
local walkQueue = {} -- [handle] = { x, z, fx, fz, at = when it was asked for, name }

-- The walk order itself. A man who holds a signal or some other pose is put back to idle first: on
-- 2026-11-15 a catapult director sent off while DCS still had him in a marshalling pose slid across the
-- deck in that pose instead of walking. (Idle, a walk, a turn: left as they are.)
local function giveWalk(h, x, z, fx, fz, s)
  holding[h] = nil
  if native.anim then
    local ok, a = pcall(native.anim, h)
    local n = (ok and type(a) == 'table' and type(a.name) == 'string') and a.name or nil
    if n and (n:find('sign', 1, true) or n:find('pass', 1, true) or not (n:find('idle', 1, true) or n:find('walk', 1, true) or n:find('move', 1, true) or n:find('turn', 1, true))) then
      pcall(native.play, h, 'idle', 0)
      logLine(string.format('  walk: %s was playing "%s": put back to idle before the walk order', tostring(h), n))
    end
  end
  return pcall(native.walk, h, x, z, fx, fz, unpack(s))
end

-- NOBODY WALKS ACROSS A LOWERED ELEVATOR (the user, 2026-11-16: "sometimes they walk back over a lowered elevator and
-- float": our people stay at deck height). A walk is a straight line; one that would cross a platform that is down (or
-- on its way) is taken round its inboard side instead, corner to corner, Walk.round clear of it; a place ON such a
-- platform becomes the nearest place at its inboard side. The legs after the first wait in Walk.legs and are given one
-- at a time, each when he stands at the end of the one before.
--   Walk.blocks()  the platforms nobody may cross now: { { x from, x to, z from, z to, zin = its inboard side's z } }
--                 (set where the elevators are, further down)
-- (one table for all of it: a Lua chunk takes 200 local names and this file has them)
--   Walk.legs  [handle] = { legs = { { x, z, fx, fz }, ... } (still to walk), x, z (the leg he is on), at, name }
local Walk = { round = 1.2, legs = {}, queueT = 0, legsT = 0, blocks = function() return {} end }

-- does the line from a to b pass through the box grown by m? (b: { x from, x to, z from, z to })
function Walk.hits(ax, az, bx, bz, b, m)
  local t0, t1 = 0, 1
  local dx, dz = bx - ax, bz - az
  for _, pq in ipairs({ { -dx, ax - (b[1] - m) }, { dx, (b[2] + m) - ax }, { -dz, az - (b[3] - m) }, { dz, (b[4] + m) - az } }) do
    local p, q = pq[1], pq[2]
    if p == 0 then
      if q < 0 then return false end
    else
      local r = q / p
      if p < 0 then
        if r > t1 then return false end
        if r > t0 then t0 = r end
      else
        if r < t0 then return false end
        if r < t1 then t1 = r end
      end
    end
  end
  return t1 - t0 > 1e-6
end

-- the way from px, pz to x, z clear of every blocked platform: the points to walk to in turn (the last is the place
-- itself, or where it was moved to), and what was done (nil: a straight walk)
function Walk.plan(px, pz, x, z)
  local pts, note = {}, nil
  for _, b in ipairs(Walk.blocks()) do
    if x > b[1] - 0.5 and x < b[2] + 0.5 and z > b[3] - 0.5 and z < b[4] + 0.5 then
      z = b.zin
      note = 'the place is on a lowered elevator: its inboard side instead'
    end
    local m = Walk.round - 0.3
    if Walk.hits(px, pz, x, z, b, m) then
      local ca, cb = { b[1] - Walk.round, b.zin }, { b[2] + Walk.round, b.zin }
      local best, bestLen
      for _, via in ipairs({ { ca }, { cb }, { ca, cb }, { cb, ca } }) do
        local ok, len, lx, lz = true, 0, px, pz
        for i = 1, #via + 1 do
          local v = via[i] or { x, z }
          if Walk.hits(lx, lz, v[1], v[2], b, m) then ok = false end
          len = len + math.sqrt((v[1] - lx) ^ 2 + (v[2] - lz) ^ 2)
          lx, lz = v[1], v[2]
        end
        if ok and (not bestLen or len < bestLen) then best, bestLen = via, len end
      end
      if best then -- (none: he stands on the platform itself: straight off it)
        for _, v in ipairs(best) do pts[#pts + 1] = { v[1], v[2] } end
        note = (note and (note .. '; ') or '') .. 'round a lowered elevator'
      end
    end
  end
  pts[#pts + 1] = { x, z }
  return pts, note
end

-- a walk given to a man who stands at px, pz: its first leg now, the rest kept for later
function Walk.give(h, px, pz, x, z, fx, fz, s, name)
  Walk.legs[h] = nil
  local pts, note = { { x, z } }, nil
  if px and pz then pts, note = Walk.plan(px, pz, x, z) end
  if not note then return giveWalk(h, x, z, fx, fz, s) end
  local legs, lx, lz = {}, px, pz
  for i, p in ipairs(pts) do
    local dx, dz = p[1] - lx, p[2] - lz
    local m = math.sqrt(dx * dx + dz * dz)
    -- (on the way he faces the way he goes; at the end, the way he was told to)
    legs[i] = { x = p[1], z = p[2], fx = (i < #pts and m > 0.01) and dx / m or fx, fz = (i < #pts and m > 0.01) and dz / m or fz }
    lx, lz = p[1], p[2]
  end
  logLine(string.format('  walk: %s to %.1f fwd %.1f stbd: %s: %d leg(s), first to %.1f / %.1f', tostring(name or h), x, z, note, #legs, legs[1].x, legs[1].z))
  local first = table.remove(legs, 1)
  if #legs > 0 then Walk.legs[h] = { legs = legs, x = first.x, z = first.z, at = now(), name = tostring(name or h) } end
  return giveWalk(h, first.x, first.z, first.fx, first.fz, s)
end

local function walkOrder(h, x, z, fx, fz, s, name)
  local ok, st, px, _, pz = pcall(native.state, h, false)
  Walk.legs[h] = nil
  if ok and st ~= nil and st ~= 0 then
    -- No stop order: DCS's stop does not end a walk (2026-11-15: five men told to stop walked on to
    -- where they were going), and a walk order given to a man still walking either jumped him to the
    -- new place at once or left him walking on the spot for good. So he finishes the walk he is on.
    walkQueue[h] = { x = x, z = z, fx = fx, fz = fz, at = now(), name = tostring(name or h) }
    return true, true, 'walking: he finishes this walk first, the new order follows when he stands'
  end
  walkQueue[h] = nil
  -- standing where he is sent already: nothing to do (a walk of no length made men jump about)
  if ok and px and pz and math.sqrt((px - x) ^ 2 + (pz - z) ^ 2) < 0.3 then return true, true, 'he stands there already: no order given' end
  return Walk.give(h, ok and px or nil, ok and pz or nil, x, z, fx, fz, s, name)
end

-- the legs of walks that go round something: the next one when he stands at the end of the one he is on (a man given
-- a walk order still "stands" for a moment: so by where he is, not by his state alone). Standing somewhere else for 6 s
-- (he was stopped, or sent elsewhere by DCS): the rest is planned again from where he stands.
function Walk.tickLegs(t)
  if not native or t < Walk.legsT then return end
  Walk.legsT = t + 0.25
  local ctx
  for h, L in pairs(Walk.legs) do
    local ok, st, px, _, pz = pcall(native.state, h, false)
    if not ok or st == nil then
      Walk.legs[h] = nil
    elseif walkQueue[h] then
      Walk.legs[h] = nil -- (a newer order waits for him: this walk is over)
    elseif st == 0 and px and pz then
      local near = math.sqrt((px - L.x) ^ 2 + (pz - L.z) ^ 2) < 0.8
      if near or t - L.at > 6 then
        ctx = ctx or getCtx()
        if not ctx then return end
        if near then
          local leg = table.remove(L.legs, 1)
          L.x, L.z, L.at = leg.x, leg.z, t
          if #L.legs == 0 then Walk.legs[h] = nil end
          local ok2, res, e = giveWalk(h, leg.x, leg.z, leg.fx, leg.fz, ctx.s)
          logLine(string.format('  walk: %s: next leg, to %.1f fwd %.1f stbd%s: %s', L.name, leg.x, leg.z, Walk.legs[h] and '' or ' (the last)', (ok2 and res) and tostring(e) or ('FAILED: ' .. tostring(ok2 and e or res))))
        else
          local last = L.legs[#L.legs]
          logLine(string.format('  walk: %s stands at %.1f / %.1f, not at the end of his leg (%.1f / %.1f): planned again from there', L.name, px, pz, L.x, L.z))
          Walk.give(h, px, pz, last.x, last.z, last.fx, last.fz, ctx.s, L.name)
        end
      end
    end
  end
end

local function tickWalkQueue(t)
  if not native or t < Walk.queueT then return end
  Walk.queueT = t + 0.25
  local ctx
  for h, q in pairs(walkQueue) do
    local ok, st = pcall(native.state, h, false)
    if not ok or st == nil then
      walkQueue[h] = nil
      logLine(string.format('  walk order for %s dropped: he is gone', q.name))
    elseif st == 0 then
      ctx = ctx or getCtx()
      if not ctx then return end -- no ship position this instant: asked again in a quarter of a second
      walkQueue[h] = nil
      local okp, _, qx, _, qz = pcall(native.state, h, false)
      local ok2, res, e = Walk.give(h, okp and qx or nil, okp and qz or nil, q.x, q.z, q.fx, q.fz, ctx.s, q.name)
      logLine(string.format('  walk order for %s given %.1f s after it was asked for (he stands): to %.1f fwd %.1f stbd: %s', q.name, t - q.at, q.x, q.z,
        (ok2 and res) and tostring(e) or ('FAILED: ' .. tostring(ok2 and e or res))))
    elseif t - q.at > 120 and not q.said then
      q.said = true -- still "moving" two minutes on: he is stuck, and no order is given to a man who is moving
      logLine(string.format('  walk order for %s still waiting after %.0f s: he has not stood since (stuck?)', q.name, t - q.at))
    end
  end
end

-- ---------------------------------------------------------------- commands
local function withTarget(fn)
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'for a command', false)
  if not r then return say('the scan failed (see the log)') end
  local p, d = pick(r, ctx)
  if not p then return say('nobody on your ship matches the target (' .. TARGET_TEXT[target] .. '). ' .. summary(r, ctx)) end
  return fn(p, d, ctx, r)
end

local commands = {}

function commands.list()
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'list', true)
  if not r then return say('the scan failed (see the log)') end
  if #r.people > 0 then return say(summary(r, ctx)) end
  -- nobody the quick way: look through memory (in the next frame, so this message is up while DCS freezes)
  say('quick scan: ' .. summary(r, ctx) .. '. Scanning memory instead: DCS will freeze for a few seconds.')
  pending = { at = now() + 0.3, fn = function() commands.memory(true) end }
end

function commands.memory(auto)
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx = getCtx()
  if not auto and not pending then
    say('scanning memory: DCS will freeze for a few seconds.')
    pending = { at = now() + 0.3, fn = function() commands.memory(true) end }
    return
  end
  local h = memoryScan(ctx)
  if not h then return say('the memory scan failed (see the log)') end
  local r = doScan(ctx, 'after the memory scan', true)
  say(string.format('memory scan (%.0f s, %d new): %s', h.seconds, #h.people, r and summary(r, ctx or nil) or 'scan failed'))
end

-- steps to the next kind of target that someone on the player's ship matches
function commands.target()
  local ctx = native and getCtx()
  local r = ctx and doScan(ctx, 'for a command', false)
  local at = 1
  for i, v in ipairs(TARGETS) do
    if v == target then at = i end
  end
  local p, d
  for step = 1, #TARGETS do
    local mode = TARGETS[(at + step - 1) % #TARGETS + 1]
    if r then p, d = pick(r, ctx, mode) end
    if p or not r then
      target = mode
      break
    end
  end
  say('target is now ' .. TARGET_TEXT[target] .. (p and string.format(': %s, %.0f m from you', tostring(p.name), d) or ': nobody like that found'))
end

-- ---------------------------------------------------------------- the directors' signals
-- What DCS's own deck directors play, recorded by this hook on 2026-11-14 during a native-marshalled
-- taxi from spawn spot 1 to catapult 1:
--   * on taking the jet: "sign_attention_taxi", once (1.33 s);
--   * then the blend spaces "bs_sign_taxi_fwd" / "bs_sign_taxi_left" / "bs_sign_taxi_right" (and
--     "bs_sign_stop"), looped, their one axis "torso_angle" (-45..45) following the jet all the while;
--   * on handing over: "bs_pass_control", once (2 s; axis "angle", -135..135: the way to the next
--     director), then "idle".
-- The turn blend spaces are named for the DIRECTOR'S side: through the jet's right turn the native
-- directors played "bs_sign_taxi_left" (and the user saw "sign_taxifwd_l" as the pilot's right).
-- The angles, fitted on two directors of that taxi (within 2 degrees): angle = the way he faces minus
-- the bearing from him to what he looks at, bearings measured from the bow towards starboard, so
-- positive = it is to his left. The torso looks at a point 4 m ahead of the jet's own position along
-- its nose (the pilot); pass control looks at the next director.
-- The night set (light wands in the hands) has the same names with "night_" in front.
-- A blend space reads its parameter when it is applied and when the animation instance is told to take
-- its parameters again; the native module does the second on every write (native.prop).
local SIGNALS = {
  attention = { name = 'sign_attention_taxi' },
  ahead = { name = 'bs_sign_taxi_fwd', held = true, aim = 'torso_angle', lim = 45 },
  left = { name = 'bs_sign_taxi_right', held = true, aim = 'torso_angle', lim = 45 }, -- the PILOT'S left
  right = { name = 'bs_sign_taxi_left', held = true, aim = 'torso_angle', lim = 45 },
  stop = { name = 'bs_sign_stop', held = true, aim = 'torso_angle', lim = 45 },
  pass = { name = 'bs_pass_control', aim = 'angle', lim = 135 },
}
local PILOT_AHEAD = 4 -- m ahead of the jet's position along its nose: where the directors look

local function wrap180(a) return (a + 180) % 360 - 180 end

-- the angle for a man at x, z facing fx, fz to a target tx, tz (ship coordinates), limited to +-lim
local function aimAngle(x, z, fx, fz, tx, tz, lim)
  local a = wrap180(math.deg(atan2(fz, fx)) - math.deg(atan2(tz - z, tx - x)))
  return math.max(-lim, math.min(lim, a))
end

-- where he stands and the way he faces, if he stands (a walking man's aim is left alone)
local function standing(h)
  local ok, st, x, _, z, _, fx, fz = pcall(native.state, h, false)
  if ok and st == 0 and x and z and fx and fz then return x, z, fx, fz end
end

-- the angle a signal should have now: a fixed one, towards a point on the deck, or towards the pilot
local function aimOf(hd, ctx)
  if hd.angle then return hd.angle end
  local x, z, fx, fz = standing(hd.h)
  if not x then return nil end
  local tx, tz
  if hd.target then
    tx, tz = hd.target.x, hd.target.z
  elseif ctx then
    tx, tz = ctx.jx + PILOT_AHEAD * ctx.fx, ctx.jz + PILOT_AHEAD * ctx.fz
  end
  if not tx then return nil end
  return aimAngle(x, z, fx, fz, tx, tz, hd.lim)
end

-- Gives h the signal `key` (SIGNALS), in his day or night set. opt.target = { x, z }: look there
-- instead of at the pilot; opt.angle: a fixed angle; opt.sweep = seconds: the angle goes across its
-- range and back in that time. The parameter is written BEFORE the animation is applied and kept up
-- to date by tickSignals for as long as he is on the signal. Returns true, the animation's name.
local function sendSignal(h, key, opt, ctx)
  local s = SIGNALS[key]
  opt = opt or {}
  local name = (nightOn[h] and 'night_' or '') .. s.name
  local hd = { h = h, key = key, name = name, prop = s.aim, lim = s.lim, target = opt.target, angle = opt.angle, at = now(), held = s.held, resent = 0, writes = 0,
    keep = opt.keep } -- keep: a one-shot the caller follows up itself (attention, then the signal): no idle in between
  if opt.sweep then hd.sweep, hd.angle = opt.sweep, -s.lim end
  if s.aim and native.prop then
    local a = aimOf(hd, ctx or getCtx())
    if a and pcall(native.prop, h, s.aim, a) then hd.last = a end
  end
  local ok, res, e = pcall(native.play, h, name, s.held and 2 or 1)
  if not (ok and res) then return false, tostring(ok and e or res) end
  holding[h] = hd
  return true, name
end

local function toIdle(h)
  holding[h] = nil
  pcall(native.play, h, 'idle', 0)
end

-- Ten times a second: everyone on a signal of ours keeps looking where he should; a one-shot goes
-- back to idle when it is over (as the native directors do); a held signal that the readout shows
-- replaced by something else is sent again.
local sigNextT = 0
local function tickSignals(t)
  if t < sigNextT or not native then return end
  sigNextT = t + 0.1
  local ctx
  for h, hd in pairs(holding) do
    ctx = ctx or getCtx()
    if hd.prop and native.prop then
      if hd.sweep then
        local k = math.min(1, (t - hd.at) / hd.sweep)
        hd.angle = -hd.lim + 2 * hd.lim * (k < 0.5 and 2 * k or 2 * (1 - k))
      end
      local a = aimOf(hd, ctx)
      if a and (not hd.last or math.abs(a - hd.last) >= 0.5) and pcall(native.prop, h, hd.prop, a) then hd.last, hd.writes = a, hd.writes + 1 end
    end
    if native.anim and t - (hd.checkT or hd.at) >= 0.5 then
      hd.checkT = t
      local ok, a = pcall(native.anim, h)
      if ok and type(a) == 'table' then
        hd.len = a.name == hd.name and a.dur or hd.len
        if hd.held and a.name ~= hd.name then
          hd.resent = hd.resent + 1
          pcall(native.play, h, hd.name, 2)
        end
      end
    end
    if not hd.held and not hd.keep and t - hd.at >= (hd.len or DUR[hd.name] or 2) then toIdle(h) end
  end
end

-- one of the directors' signals (the Signals submenu), looking at the pilot; "pass" takes an angle
function commands.sig(key, arg)
  if not SIGNALS[key] then return end
  withTarget(function(p, d, ctx)
    local ok, name = sendSignal(p.h, key, key == 'pass' and { angle = tonumber(arg) or 90 } or nil, ctx)
    if not ok then return say(string.format('%s: "%s" failed: %s', tostring(p.name), key, tostring(name))) end
    logLine(string.format('command signal: %s <- %s ("%s")', tostring(p.name), key, name))
    say(string.format('%s (%.0f m from you): %s ("%s")%s.', tostring(p.name), d, key, name, SIGNALS[key].held and ', held, his torso following you' or ', once'))
  end)
end

-- a plain animation by name; mode "2": held (the engine's loop flag), else once
function commands.raw(name, mode)
  if not name or name == '' then return end
  local held = tonumber(mode) == 2
  withTarget(function(p, d)
    holding[p.h] = nil
    logLine(string.format('command play: %s <- "%s"%s', tostring(p.name), name, held and ' (held)' or ''))
    local ok, res, e = pcall(native.play, p.h, name, held and 2 or 0)
    if not ok or not res then return say(string.format('%s: playing "%s" failed: %s', tostring(p.name), name, tostring(ok and e or res))) end
    say(string.format('%s (%.0f m from you): "%s", %s.', tostring(p.name), d, name, held and 'held' or 'once'))
  end)
end

-- to a point 16 m ahead of the jet's nose, turned to face the jet
function commands.walk()
  withTarget(function(p, d, ctx)
    local tx, tz = ctx.jx + 16 * ctx.fx, ctx.jz + 16 * ctx.fz
    logLine(string.format('command walk: %s -> %.2f fwd %.2f stbd, to face %.2f %.2f (jet at %.2f fwd %.2f stbd, nose %.3f %.3f)', tostring(p.name), tx, tz,
      -ctx.fx, -ctx.fz, ctx.jx, ctx.jz, ctx.fx, ctx.fz))
    local ok, res, e = walkOrder(p.h, tx, tz, -ctx.fx, -ctx.fz, ctx.s, p.name)
    if not ok or not res then return say(string.format('%s: walk failed: %s', tostring(p.name), tostring(ok and e or res))) end
    logLine('  walk: ' .. tostring(e))
    say(string.format('%s told to walk to a point 16 m ahead of your nose (%.0f m from him) and face you. Watch him.', tostring(p.name), distTo(p, tx, tz) or 0))
    startWatch(p, 45, { x = tx, z = tz }, 'walk')
  end)
end

function commands.stop()
  withTarget(function(p)
    local ok, res, e = pcall(native.stop, p.h)
    if not ok or not res then return say(string.format('%s: stop failed: %s', tostring(p.name), tostring(ok and e or res))) end
    say(tostring(p.name) .. ' told to stop.')
    startWatch(p, 8, nil, 'stop')
  end)
end

-- ---------------------------------------------------------------- night mode
-- The light wands every crew member carries (GroundCrew.lua: two sticks, two lights) shown, the arm
-- held for them, and from then on the "night_" set of signals; off: wands hidden, arm pose off, day set.
-- The arm pose is an "override" animation: DCS keeps it under whatever else the man plays
-- (GroundCrew.lua gives its own crew Night_Stick_ArmPose_L / _R and Holdbar_ArmPose_L / _R this way).
-- Seen 2026-11-14: wands shown without any of this are not held properly, and the override alone, on a
-- man without wands in daylight, shows nothing. Which of "night_stick_armpose" / "_l" / "_r" is right
-- for a director with a wand in each hand is one of the things the signal test shows.
local WANDS = { 'RightStick', 'LeftStick', 'RightLight', 'LeftLight' }
local ARM_POSE = 'night_stick_armpose'

local function setNight(h, on, pose)
  local failed = {}
  for _, n in ipairs(WANDS) do
    local ok, res, e = pcall(native.attach, h, n, on)
    if not (ok and res) then failed[#failed + 1] = n .. ' (' .. tostring(ok and e or res) .. ')' end
  end
  local ok, res, e = pcall(native.override, h, on and (pose or ARM_POSE) or '')
  if not (ok and res) then failed[#failed + 1] = 'arm pose (' .. tostring(ok and e or res) .. ')' end
  nightOn[h] = on or nil
  return failed
end

function commands.night()
  withTarget(function(p, d, ctx)
    local on = not nightOn[p.h]
    local failed = setNight(p.h, on)
    local hd = holding[p.h]
    if hd then sendSignal(p.h, hd.key, { target = hd.target, angle = (not hd.sweep) and hd.angle or nil }, ctx) end -- the same signal, in the other set
    say(string.format('%s (%.0f m from you): night mode %s: light wands %s, arm pose "%s" %s, %s signals from now on%s.', tostring(p.name), d, on and 'ON' or 'OFF',
      on and 'shown' or 'hidden', ARM_POSE, on and 'held' or 'off', on and 'night' or 'day', #failed > 0 and ('; FAILED: ' .. table.concat(failed, ', ')) or ''))
  end)
end

-- ---------------------------------------------------------------- the demo: directors of our own
-- People of ours (nothing native ever tasks them) bring the jet 12 m straight ahead with DCS's own
-- director signals, all of it worked out here from the jet's and their positions in ship coordinates:
--   * the last director walks to a point 25 m ahead of the nose and faces the jet;
--   * with a second person of ours there is a first director too, 12 m ahead and 6 m to the pilot's
--     right, facing the jet. He takes the jet (attention, then come ahead / turn left / turn right by
--     where the 25 m point is off the nose: more than 8 degrees = turn) and, when it has come 4 m,
--     hands it over: pass control, pointing at the last director, then idle;
--   * the last director takes it when the pass is over (attention, then the same signals) and stops
--     it 13 m short of himself.
-- Every held signal follows the pilot with the torso, as the native directors' do (tickSignals).
local DEMO = { ahead = 25, stopAt = 13, turnDeg = 8, firstAhead = 12, firstRight = 6, handAt = 21 }

function commands.demo()
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  if marsh then return say('the marshalling is running: stop it first (F10 > Stop the demo / signal test / marshalling)') end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'for the demo', false)
  local ours = {}
  for _, p in ipairs(r and r.mine or {}) do
    if kind(p) == 'ours' and role(p) ~= 'driver' and role(p) ~= 'rider' and p.x and p.z then ours[#ours + 1] = p end
  end
  if #ours == 0 then return say('the demo needs a person of ours (catcc-...) on your ship: none found (data patch applied?)') end
  loadAnimInfo(ours[1])
  local P = { x = ctx.jx + DEMO.ahead * ctx.fx, z = ctx.jz + DEMO.ahead * ctx.fz }
  table.sort(ours, function(a, b) return distTo(a, P.x, P.z) < distTo(b, P.x, P.z) end)
  local function order(p, x, z, fx, fz)
    local ok, res, e = pcall(native.walk, p.h, x, z, fx, fz, unpack(ctx.s))
    if not ok or not res then return nil, tostring(ok and e or res) end
    logLine(string.format('demo: %s -> %.2f fwd %.2f stbd, to face %.2f %.2f; walk: %s', tostring(p.name), x, z, fx, fz, tostring(e)))
    return { h = p.h, name = tostring(p.name), P = { x = x, z = z }, togo = distTo(p, x, z) or 0 }
  end
  local t = now()
  local d = { P = P, phase = 'walk', t0 = t, nextT = t, sent = 0 }
  local why
  d.last, why = order(ours[1], P.x, P.z, -ctx.fx, -ctx.fz) -- the last director: whoever of ours is nearest to the 25 m point
  if not d.last then return say('demo: the walk order failed: ' .. tostring(why)) end
  if ours[2] then
    local qx = ctx.jx + DEMO.firstAhead * ctx.fx - DEMO.firstRight * ctx.fz -- the pilot's right is (-fz, fx)
    local qz = ctx.jz + DEMO.firstAhead * ctx.fz + DEMO.firstRight * ctx.fx
    local fx, fz = ctx.jx - qx, ctx.jz - qz
    local m = math.sqrt(fx * fx + fz * fz)
    d.first = order(ours[2], qx, qz, fx / m, fz / m)
  end
  watch, sigtest = nil, nil
  demo = d
  if d.first then
    say(string.format('demo: %s is walking to a point %d m ahead of your nose (%.0f m to go) and %s to %d m ahead, %d m to your right. When they are there, taxi ahead: %s takes you first and hands you over to %s, who stops you %d m short of himself.',
      d.last.name, DEMO.ahead, d.last.togo, d.first.name, DEMO.firstAhead, DEMO.firstRight, d.first.name, d.last.name, DEMO.stopAt))
  else
    say(string.format('demo: %s is walking to a point %d m ahead of your nose (he has %.0f m to go). When he is there, taxi towards him and follow his signals: he stops you %d m short of him.',
      d.last.name, DEMO.ahead, d.last.togo, DEMO.stopAt))
  end
end

-- true: he stands on his point, or has stood still somewhere else for 5 s with no walk order waiting (as
-- near as his path finder brought him); false: not yet; nil: he can't be read. A man still walking is
-- never in place, however long he takes: on 2026-11-15 a plane captain with 123 m to walk was taken to
-- be in place after a minute, 24 m short and still walking, and the signal he was given then slid him
-- over the deck in that pose.
local function inPlace(who, t0, t)
  local ok, st, x, _, z = pcall(native.state, who.h, false)
  if not ok or st == nil then return nil end
  who.away = (x and z) and math.sqrt((x - who.P.x) ^ 2 + (z - who.P.z) ^ 2) or 0
  if st ~= 0 or walkQueue[who.h] then
    who.stoodAt = nil
    return false
  end
  if who.away < 1.5 then return true end
  who.stoodAt = who.stoodAt or t
  return t - who.stoodAt >= 5
end

local function demoTake(d, who, t, ctx)
  d.ctl, d.sig, d.attUntil = who, nil, t + 1.4
  local ok, name = sendSignal(who.h, 'attention', { keep = true }, ctx)
  logLine(string.format('  demo: %s takes the jet: attention ("%s")%s', who.name, tostring(name), ok and '' or ' FAILED'))
end

local function tickDemo(t)
  local d = demo
  if not d or t < d.nextT then return end
  d.nextT = t + 0.25
  local ctx = getCtx()
  if not ctx then return end
  if d.phase == 'walk' then
    local a = inPlace(d.last, d.t0, t)
    local b = true
    if d.first then b = inPlace(d.first, d.t0, t) end
    if a == nil or b == nil then
      demo = nil
      return say('demo: lost sight of ' .. ((a == nil) and d.last.name or d.first.name))
    end
    if a and b then
      d.phase = 'direct'
      say(string.format('demo: %s in place (%.1f m from the point, after %.0f s). Taxi %s.', d.first and (d.first.name .. ' and ' .. d.last.name .. ' are') or (d.last.name .. ' is'),
        d.last.away or 0, t - d.t0, d.first and 'ahead' or 'towards him'))
      demoTake(d, d.first or d.last, t, ctx)
    end
    return
  end
  -- where the 25 m point is from the jet: distance, and the angle off the nose (positive: to the right of it)
  local dx, dz = d.P.x - ctx.jx, d.P.z - ctx.jz
  local dist = math.sqrt(dx * dx + dz * dz)
  local ang = math.deg(atan2(ctx.fx * dz - ctx.fz * dx, ctx.fx * dx + ctx.fz * dz))
  if d.first and d.ctl == d.first and dist <= DEMO.handAt then
    local ok, name = sendSignal(d.first.h, 'pass', { target = d.last.P }, ctx)
    logLine(string.format('  demo: %s hands over to %s: pass control ("%s")%s; jet %.1f m from the point', d.first.name, d.last.name, tostring(name), ok and '' or ' FAILED', dist))
    d.ctl, d.sig, d.takeAt = nil, nil, t + 2 -- the next director takes the jet when the pass is over, as the native ones do
    return
  end
  if not d.ctl then
    if t >= d.takeAt then demoTake(d, d.last, t, ctx) end
    return
  end
  if t < d.attUntil then return end
  local want
  if dist <= DEMO.stopAt and d.ctl == d.last then
    want = 'stop'
  elseif ang > DEMO.turnDeg then
    want = 'right'
  elseif ang < -DEMO.turnDeg then
    want = 'left'
  else
    want = 'ahead'
  end
  if want ~= d.sig then
    d.sig, d.sent = want, d.sent + 1
    local ok, name = sendSignal(d.ctl.h, want, nil, ctx)
    logLine(string.format('  demo: %s signals %s ("%s")%s; jet %.1f m from the point, the point %.0f deg off the nose', d.ctl.name, want, tostring(name), ok and '' or ' FAILED', dist, ang))
    if (want == 'left' or want == 'right') and not d.turnSaid then
      d.turnSaid = true
      say(string.format('demo: the point is %.0f degrees to your %s: %s signals turn %s', math.abs(ang), want, d.ctl.name, want))
    end
  end
  if want == 'stop' then
    d.stopT = d.stopT or t
    if t - d.stopT >= 6 then
      demo = nil
      local resent = 0
      for _, who in ipairs({ d.first or false, d.last }) do
        if who then
          resent = resent + ((holding[who.h] and holding[who.h].resent) or 0)
          toIdle(who.h)
        end
      end
      logLine(string.format('  demo: over; %d signals sent; sent again because the readout showed them replaced: %d', d.sent, resent))
      say(string.format('demo over: stop signalled with you %.1f m from %s.', dist, d.last.name))
    end
  else
    d.stopT = nil
  end
end

-- ---------------------------------------------------------------- the signal test
-- A person of ours (or, with none, the current target) comes to 14 m ahead of the nose, faces the jet,
-- and goes through the directors' signals as DCS's own directors play them (SIGNALS), then the night
-- set with the light wands. What he actually plays is read back four times a second (native.anim), so
-- the log says for every step whether it played as sent, and how far the blend angle moved.
local SIGTEST = {
  { 'attention', sig = 'attention', secs = 2.5 },
  { 'come ahead, his torso on you', sig = 'ahead', secs = 5 },
  { 'come ahead, his torso swung from one side to the other', sig = 'ahead', secs = 8, sweep = true },
  { 'turn LEFT (your left)', sig = 'left', secs = 8 },
  { 'turn RIGHT (your right)', sig = 'right', secs = 8 },
  { 'stop', sig = 'stop', secs = 6 },
  { 'pass control, pointing to his left', sig = 'pass', angle = 90, secs = 3 },
  { 'pass control, pointing to his right', sig = 'pass', angle = -90, secs = 3 },
  { 'NIGHT: light wands, standing idle, arm pose "night_stick_armpose"', night = 'night_stick_armpose', secs = 5 },
  { 'NIGHT: arm pose "night_stick_armpose_r"', night = 'night_stick_armpose_r', secs = 4 },
  { 'NIGHT: arm pose "night_stick_armpose_l"', night = 'night_stick_armpose_l', secs = 4 },
  { 'NIGHT: come ahead (arm pose "night_stick_armpose" again)', night = 'night_stick_armpose', sig = 'ahead', secs = 6 },
  { 'NIGHT: turn LEFT (your left)', sig = 'left', secs = 6 },
  { 'NIGHT: stop', sig = 'stop', secs = 5 },
  { 'day again', night = false, secs = 1 },
}

function commands.sigtest()
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  if not (native.anim and native.prop) then return say('the signal test needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
  if marsh then return say('the marshalling is running: stop it first (F10 > Stop the demo / signal test / marshalling)') end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'for the signal test', false)
  local p = r and (pick(r, ctx, 'ours') or pick(r, ctx))
  if not p then return say('the signal test found nobody on your ship to use') end
  loadAnimInfo(p)
  local P = { x = ctx.jx + 14 * ctx.fx, z = ctx.jz + 14 * ctx.fz }
  local t = now()
  watch, demo = nil, nil
  sigtest = { h = p.h, name = tostring(p.name), P = P, phase = 'run', t0 = t, nextT = t, i = 0, res = {} }
  local togo = distTo(p, P.x, P.z) or 0
  if togo > 2 then
    local ok, res, e = pcall(native.walk, p.h, P.x, P.z, -ctx.fx, -ctx.fz, unpack(ctx.s))
    if not ok or not res then
      sigtest = nil
      return say('signal test: his walk order failed: ' .. tostring(ok and e or res))
    end
    logLine('  walk: ' .. tostring(e))
    sigtest.phase = 'walk'
  end
  local total = 0
  for _, step in ipairs(SIGTEST) do total = total + step.secs end
  say(string.format('signal test: %s %s. Then %d steps, about %d s in all: watch him; each one is announced.', sigtest.name,
    togo > 2 and string.format('is walking to 14 m ahead of your nose (%.0f m to go)', togo) or 'is in front of you', #SIGTEST, math.floor(total + 0.5)))
end

local function sigtestBegin(s, t)
  local step = SIGTEST[s.i]
  local st = { t0 = t, untilT = t + step.secs }
  if step.night ~= nil then
    local failed = setNight(s.h, step.night ~= false, step.night or nil)
    if #failed > 0 then st.err = table.concat(failed, ', ') end
    if not step.sig then toIdle(s.h) end
  end
  if step.sig then
    local ok, name = sendSignal(s.h, step.sig, { angle = step.angle, sweep = step.sweep and step.secs or nil })
    if ok then st.name = name else st.err = tostring(name) end
  end
  s.step = st
  logLine(string.format('  sigtest %d: %s%s%s', s.i, step[1], st.name and (' ("' .. st.name .. '")') or '', st.err and (': FAILED ' .. st.err) or ''))
  say(string.format('signal test %d of %d: %s%s', s.i, #SIGTEST, step[1], st.err and ' - could not be done (see the log)' or ''), math.max(3, math.min(12, math.floor(step.secs))))
end

local function sigtestEnd(s)
  local st, step = s.step, SIGTEST[s.i]
  local verdict
  if st.err then
    verdict = 'FAILED (' .. st.err .. ')'
  elseif not step.sig then
    verdict = 'done'
  elseif not st.seen then
    verdict = 'NOT SEEN playing' .. (st.other and (' (he played "' .. st.other .. '")') or '')
  elseif SIGNALS[step.sig].held and st.lastName ~= st.name then
    verdict = 'seen, but REPLACED by "' .. tostring(st.lastName) .. '" before the end'
  else
    verdict = 'played'
  end
  logLine(string.format('  sigtest %d: %s: %s%s', s.i, st.name and ('"' .. st.name .. '"') or step[1], verdict, st.seen and string.format(
    '; first seen +%.2f s; length %.2f, loop %.3g/%.3g/%.3g; blend x %.1f..%.1f; %d parameter write(s), sent again %d time(s)', st.seen, st.dur or 0, st.l1 or 0, st.l2 or 0,
    st.l3 or 0, st.bmin or 0, st.bmax or 0, st.writes or 0, st.resent or 0) or ''))
  s.res[#s.res + 1] = { label = step[1], ok = verdict == 'played' or verdict == 'done', sweep = (step.sweep and st.seen) and { st.bmin or 0, st.bmax or 0 } or nil }
  s.step = nil
end

local function tickSigtest(t)
  local s = sigtest
  if not s or t < s.nextT then return end
  s.nextT = t + 0.25
  if s.phase == 'walk' then
    local ok, st, x, _, z = pcall(native.state, s.h, false)
    if not ok or st == nil then
      sigtest = nil
      return say('signal test: lost sight of him (' .. tostring(x or st) .. ')')
    end
    local away = (x and z) and math.sqrt((x - s.P.x) ^ 2 + (z - s.P.z) ^ 2) or 0
    if (st == 0 and away < 1.5) or t - s.t0 > 60 then s.phase = 'run' end
    return
  end
  local st = s.step
  if st and st.name then
    local hd = holding[s.h]
    if hd then st.writes, st.resent = hd.writes, hd.resent end
    local ok, a = pcall(native.anim, s.h)
    if ok and type(a) == 'table' then
      st.lastName = a.name
      if a.name == st.name then
        st.seen = st.seen or (t - st.t0)
        st.dur, st.l1, st.l2, st.l3 = a.dur, a.l1, a.l2, a.l3
        local bx = a.bx or 0
        st.bmin, st.bmax = math.min(st.bmin or bx, bx), math.max(st.bmax or bx, bx)
      elseif not st.seen then
        st.other = a.name
      end
    end
  end
  if st and t < st.untilT then return end
  if st then sigtestEnd(s) end
  s.i = s.i + 1
  if SIGTEST[s.i] then return sigtestBegin(s, t) end
  -- done: day set, back to his idle, and the result on screen
  sigtest = nil
  if nightOn[s.h] then setNight(s.h, false) end
  toIdle(s.h)
  local bad, sweep = {}, nil
  for _, r in ipairs(s.res) do
    if not r.ok then bad[#bad + 1] = r.label end
    sweep = r.sweep or sweep
  end
  say(string.format('signal test done: %d of %d steps as sent%s.%s', #s.res - #bad, #s.res, #bad > 0 and ('; NOT as sent: ' .. table.concat(bad, '; ')) or '',
    sweep and string.format(' Torso swing: his blend angle went %.0f..%.0f (asked for -45..45).', sweep[1], sweep[2]) or ''), 40)
end

-- ---------------------------------------------------------------- marshalling along a taxi route
-- "Marshal me to catapult N": people of ours bring the jet along a taxi route from PriFly's own taxi
-- network (Scripts/CATCC/crewtest_routes.lua, made from src/components/catcc/prifly/taxiNet.ts: the
-- route PriFly's room would send, here from the spawn spot the jet stands on to the catapult picked)
-- up to the catapult's start box, where the catapult's own crew takes the jet as it always does.
--   * The part of the route before the start box is cut into equal stretches of at most 30 m, one
--     director each (no more than there are people of ours). A director stands 8 m beyond the end of
--     his stretch and 8 m to the side of the route: on the outside of the bend there, on the pilot's
--     left where it runs straight; he faces back along the route, towards where the jet comes from.
--   * Signals: the route point 10 m ahead of the jet's place on the route is looked at from the jet;
--     more than 10 degrees off the nose = turn that way (back to come ahead under 5), else come ahead.
--   * At the end of his stretch a director passes control, pointing at the next one, who takes the jet
--     when the pass is over (attention, then signals), as DCS's own directors do; the last one passes
--     control towards the catapult's director when the jet is in the start box. Then everyone walks
--     back to where he stood.
-- The catapult start boxes are GroundCrew.lua's (ship coordinates: x forward from, to; z starboard from, to).
local CAT_BOX = { { 21, 62, 11, 23.5 }, { 16, 60, -12, 6 }, { -78, -57, -25, -13 }, { -96, -68.5, -36, -27.5 } }
local MARSHAL = { stretch = 30, beyond = 8, side = 8, lookAhead = 10, turnOn = 10, turnOff = 5, maxStart = 3, maxFirstTurn = 60, maxJoin = 40, maxJoinTurn = 110, gearIn = 8 }
-- The bow's catapult control bubble: when it stands up, its collision shape stops a jet's wheels (2026-11-15:
-- the route from a bow spot to catapult 1 ran straight over it and the jet stopped dead against it at 71 m
-- forward, 3.4 m to starboard, nose aft; it took a lot of thrust to climb over). Where it is, from that:
-- about 64 m forward, 3 m to starboard. A route that passes within `r` of it has the bubble lowered until
-- the jet is `clear` metres past. (It also makes a fine chock: worth remembering.)
local BOW_BUBBLE = { x = 64, z = 3, r = 6, clear = 14 }
local bowWhy = {} -- why the bow bubble is to be down: closed (catapults 1 and 2 both closed), route (a route of ours crosses it), hand
local bowBubbleUpdate, shipHandle -- (defined with the bubbles, further down)
local camAfter -- the catapult director the camera stays on after our own directors have handed the jet over
local teleWait -- a parking spot the jet is to be put on once it stands still (tickTeleport)
-- The flight deck's outline as the crew's own navigation has it (GroundCrew.lua deck(): metres, ship
-- coordinates x forward, z to starboard; the island is cut out of it). move_command_world has no deck
-- limit of its own (2026-11-14: men sent to a point off the deck walked off it), so a station is only
-- taken if it and the deck 2 m around it are inside this.
local DECK = {
  { -59.12, -36.5 }, { -119.82, -37.21 }, { -124.27, -20.36 }, { -160.7, -15.91 }, { -163.92, -15.52 }, { -157.65, 22.74 }, { -148.72, 21.28 }, { -143.94, 28.06 },
  { -111.84, 32.05 }, { -111.56, 34.4 }, { -83.76, 37.21 }, { -75.53, 37.21 }, { -75.53, 32.79 }, { -70.54, 32.79 }, { -70.54, 37.21 }, { -64.23, 37.21 },
  { -64.23, 24.69 }, { -36.86, 22.38 }, { -36.86, 37.21 }, { 41.41, 37.21 }, { 69.15, 37.21 }, { 93.06, 19.18 }, { 167.53, 12.21 }, { 167.53, -12.21 },
  { 92.02, -19.2 }, { 63.1, -40.59 }, { 35.69, -40.59 }, { 15.11, -36.51 }, { -55.75, -36.5 }, { -55.75, -39.25 }, { -59.1, -39.25 },
}
-- (2026-11-19: a tow driven in the head asks this eight times every tenth of a second of its way: a fifth of all the
-- time the deck spotting demo took. The answer is the same as before: `exact` is the test as it was; a grid of 2 m
-- cells over the outline is filled in as it is asked (1: no edge of the outline runs through the cell and its
-- middle is inside; 0: none and outside; 2: one does: then the test itself); off the grid is off the deck.)
local insideDeck
do
  local G = { c = 2, x0 = -166, z0 = -42, nx = 168, nz = 41, v = {} }
  local floor = math.floor
  local function exact(x, z)
    local inside, j = false, #DECK
    for i = 1, #DECK do
      local a, b = DECK[i], DECK[j]
      if ((a[2] > z) ~= (b[2] > z)) and (x < (b[1] - a[1]) * (z - a[2]) / (b[2] - a[2]) + a[1]) then inside = not inside end
      j = i
    end
    return inside
  end
  -- does the segment from x1, z1 to x2, z2 touch the box xa..xb, za..zb
  local function segBox(x1, z1, x2, z2, xa, za, xb, zb)
    local t0, t1 = 0, 1
    local function clip(pp, q)
      if pp == 0 then return q >= 0 end
      local r = q / pp
      if pp < 0 then
        if r > t1 then return false end
        if r > t0 then t0 = r end
      else
        if r < t0 then return false end
        if r < t1 then t1 = r end
      end
      return true
    end
    local dx, dz = x2 - x1, z2 - z1
    return clip(-dx, x1 - xa) and clip(dx, xb - x1) and clip(-dz, z1 - za) and clip(dz, zb - z1)
  end
  insideDeck = function(x, z)
    local i, j = floor((x - G.x0) / G.c), floor((z - G.z0) / G.c)
    if i < 0 or j < 0 or i >= G.nx or j >= G.nz then return false end
    local k = j * G.nx + i
    local v = G.v[k]
    if v == nil then
      local xa, za = G.x0 + i * G.c, G.z0 + j * G.c
      local xb, zb = xa + G.c, za + G.c
      v = exact((xa + xb) / 2, (za + zb) / 2) and 1 or 0
      local n = #DECK
      for e = 1, n do
        local a, b = DECK[e], DECK[e % n + 1]
        if segBox(a[1], a[2], b[1], b[2], xa - 0.001, za - 0.001, xb + 0.001, zb + 0.001) then
          v = 2
          break
        end
      end
      G.v[k] = v
    end
    if v == 2 then return exact(x, z) end
    return v == 1
  end
end
local function standable(x, z) return insideDeck(x, z) and insideDeck(x + 2, z) and insideDeck(x - 2, z) and insideDeck(x, z + 2) and insideDeck(x, z - 2) end
-- Parking nose-on to the deck edge: the jet is stopped with its nose wheel 6 ft from the edge (asked for
-- 2026-11-15; the first build stopped it 2 m short of the spot's own point, which left the tail outside
-- the elevator's outline). The edge is the deck outline above, straight on from the route's end; the F/A-18C's
-- nose wheel is 2.99 m ahead of the jet's position (FA-18C_hornet.lua, nose_gear_pos); `lead` is how far the
-- jet still rolls after the stop signal at marshalling speed (0.3 m seen).
local PARK = { noseGear = 2.985, noseFromEdge = 1.83, lead = 0.4, edgeWithin = 25 }
-- how far it is from x, z to the deck's edge along dx, dz (a unit vector), or nil if there is none that way
local function edgeAhead(x, z, dx, dz)
  local best, j = nil, #DECK
  for i = 1, #DECK do
    local a, b = DECK[j], DECK[i]
    local ex, ez = b[1] - a[1], b[2] - a[2]
    local den = dx * ez - dz * ex
    if math.abs(den) > 1e-9 then
      local t = ((a[1] - x) * ez - (a[2] - z) * ex) / den
      local u = ((a[1] - x) * dz - (a[2] - z) * dx) / den
      if t > 1e-6 and u >= 0 and u <= 1 and (not best or t < best) then best = t end
    end
    j = i
  end
  return best
end
local ROUTES -- nil: not loaded yet; false: no file

-- Out of the landing area first (asked for 2026-11-15): a jet that is to be parked and stands in the
-- landing area is first turned square off it and taken straight across until it is clear, and only then
-- joins the way to its spot. The landing area: DCS's own landing strip of the ship (GT.RunWays[1]: through
-- 45 m aft / 10.49 m to port, 9.14 degrees to port of the bow, 25 m wide). Clear: the jet's own position
-- `clear` metres beyond the strip's edge (its tail is 8.5 m behind that). To starboard, where the deck is.
local LA = { cx = -45, cz = -10.49, dx = 0.98731, dz = -0.15877, half = 12.5, clear = 10, aft = -125, fwd = 120, lead = 4 }
local function laExit(ctx)
  local nx, nz = -LA.dz, LA.dx -- to starboard of the landing direction
  local rx, rz = ctx.jx - LA.cx, ctx.jz - LA.cz
  local along, lat = rx * LA.dx + rz * LA.dz, rx * nx + rz * nz
  if math.abs(lat) > LA.half + 2 or along < LA.aft or along > LA.fwd then return nil end
  local out = LA.half + LA.clear - lat
  local x1, z1 = ctx.jx + ctx.fx * LA.lead, ctx.jz + ctx.fz * LA.lead
  local ex, ez = x1 + nx * out, z1 + nz * out
  if not standable(ex, ez) then return nil end
  return { { ctx.jx, ctx.jz }, { x1, z1 }, { ex, ez } }, out
end

local function loadRoutes()
  if ROUTES ~= nil then return ROUTES end
  ROUTES = false
  local f = loadfile(writedir .. 'Scripts/CATCC/crewtest_routes.lua')
  if f then
    local ok, t = pcall(f)
    if ok and type(t) == 'table' then ROUTES = t end
  end
  return ROUTES
end

-- a route is { {x, z}, ... } in ship coordinates; s[i] = the length along it up to point i
local function routeLengths(r)
  local s = { 0 }
  for i = 2, #r do s[i] = s[i - 1] + math.sqrt((r[i][1] - r[i - 1][1]) ^ 2 + (r[i][2] - r[i - 1][2]) ^ 2) end
  return s
end

-- the point at length d along the route and the route's direction there (past either end: the end's)
local function routeAt(r, s, d)
  local n = #r
  local i = 1
  if d >= s[n] then
    i, d = n - 1, s[n]
  else
    d = math.max(0, d)
    -- (the first leg whose end is not short of d, by halving: it was looked for from the route's beginning every time)
    local i1 = n - 1
    while i < i1 do
      local m = math.floor((i + i1) / 2)
      if s[m + 1] < d then i = m + 1 else i1 = m end
    end
  end
  local dx, dz = r[i + 1][1] - r[i][1], r[i + 1][2] - r[i][2]
  local m = math.sqrt(dx * dx + dz * dz)
  local k = m > 0 and (d - s[i]) / m or 0
  return r[i][1] + dx * k, r[i][2] + dz * k, dx / m, dz / m
end

-- the length along the route of its point nearest to x, z, looked for between lengths lo and hi; and how far off that is
-- (2026-11-19: only the legs between lo and hi are looked at, the first of them found by halving (s rises along the
-- route): it looked at every leg of the route at every step of every way driven, in the head and on the deck: a
-- fifth of all the time the deck spotting demo took. The answer is the same.)
local function routeNearest(r, s, x, z, lo, hi)
  local best, bd = lo, 1e9
  local n = #r
  local i0, i1 = 1, n - 1
  while i0 < i1 do
    local m = math.floor((i0 + i1) / 2)
    if s[m + 1] >= lo then i1 = m else i0 = m + 1 end
  end
  local sqrt = math.sqrt
  local bd2 = 1e18
  for i = i0, n - 1 do
    local si = s[i]
    if si > hi then break end
    if s[i + 1] >= lo then
      local a, b = r[i], r[i + 1]
      local ax, az = a[1], a[2]
      local dx, dz = b[1] - ax, b[2] - az
      local l2 = dx * dx + dz * dz
      local l, k = 0, 0
      if l2 > 0 then
        -- the nearest point of this leg, kept to the part of it between lo and hi
        l = sqrt(l2)
        k = ((x - ax) * dx + (z - az) * dz) / l2
        local k1, k0 = (hi - si) / l, (lo - si) / l
        if k1 > 1 then k1 = 1 end
        if k0 < 0 then k0 = 0 end
        if k > k1 then k = k1 end
        if k < k0 then k = k0 end
      end
      local ex, ez = x - ax - dx * k, z - az - dz * k
      local d2 = ex * ex + ez * ez
      if d2 < bd2 then best, bd2 = si + l * k, d2 end
    end
  end
  if bd2 < 1e18 then bd = sqrt(bd2) end
  return best, bd
end

local function inBox(b, x, z) return x >= b[1] and x <= b[2] and z >= b[3] and z <= b[4] end

-- the angle of a point off the jet's nose, degrees, positive to the right
local function offNose(ctx, x, z)
  local dx, dz = x - ctx.jx, z - ctx.jz
  return math.deg(atan2(ctx.fx * dz - ctx.fz * dx, ctx.fx * dx + ctx.fz * dz))
end

-- arg: the catapult (1..4), or with parkArea the deck area to be parked in ("El 2", "Stbd bow", ...): the
-- way there is the parking route of that area's first spot (crewtest_routes.lua, parking), which starts
-- where the roll-out ends; it is joined where it passes nearest, and the last director stops the jet on the spot.
-- hold: the directors walk to their stations and wait there; nobody takes the jet until the hold is
-- lifted (the plane captain's release).
function commands.marshal(arg, parkArea, hold)
  local cat = tonumber(arg)
  if not parkArea and not (cat and CAT_BOX[cat]) then return end
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  if not (native.anim and native.prop) then return say('marshalling needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
  if demo or sigtest or marsh then return say('something of ours is running already: stop it first (F10 > Stop the demo / signal test / marshalling)') end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local routes = loadRoutes()
  if not routes then return say('the taxi routes are missing (Scripts\\CATCC\\crewtest_routes.lua): run crew-test\\install.ps1 with DCS closed') end
  -- The route to take: of the routes to this catapult, the one whose first 15 m pass nearest to the jet
  -- (a jet on its spot, or one that has rolled a few metres); `start` is how far along that route the
  -- jet already is.
  local park
  if parkArea then
    for _, e in ipairs(routes.parking or {}) do
      if e.area == parkArea and type(e.route) == 'table' and #e.route >= 2 then
        park = e
        break
      end
    end
    if not park then return say(string.format('there is no parking route to the %s spots in the routes file', tostring(parkArea))) end
    for _, st in ipairs(routes) do
      if st.spot == park.spot and st.fx then park.x, park.z, park.fx, park.fz = st.x, st.z, st.fx, st.fz end
    end
  end
  local from, route, s, start, fd
  local exitNote = ''
  local exit, exitOut
  if park then exit, exitOut = laExit(ctx) end
  if park and exit then
    -- in the landing area: square off it first, then the way to the spot from wherever that leaves the jet
    local s0 = routeLengths(park.route)
    local ex, ez = exit[3][1], exit[3][2]
    local p1 = routeNearest(park.route, s0, ex, ez, 0, s0[#park.route])
    local r2 = { exit[1], exit[2], exit[3] }
    for i = 1, #park.route do
      if s0[i] > p1 + 3 and math.sqrt((park.route[i][1] - ex) ^ 2 + (park.route[i][2] - ez) ^ 2) > 6 then r2[#r2 + 1] = park.route[i] end
    end
    if #r2 == 3 then r2[4] = park.route[#park.route] end
    from, route, s, start, fd = { spot = park.spot }, r2, routeLengths(r2), 0, 0
    exitNote = string.format(' First OUT OF THE LANDING AREA: a turn to starboard, square off it, %.0f m; then the way to the spot.', exitOut)
    logLine(string.format('marshal: the jet is in the landing area: first leg %.1f fwd %.1f stbd -> %.1f fwd %.1f stbd (%.0f m square off the landing area), then the way to %s from its %.0f m point',
      exit[2][1], exit[2][2], ex, ez, exitOut, tostring(park.name), p1))
  elseif park then
    local s0 = routeLengths(park.route)
    local p0, d = routeNearest(park.route, s0, ctx.jx, ctx.jz, 0, s0[#park.route])
    local ax, az = routeAt(park.route, s0, p0 + MARSHAL.lookAhead)
    local turn = math.abs(offNose(ctx, ax, az))
    if d > MARSHAL.maxJoin or turn > MARSHAL.maxJoinTurn then
      return say(string.format('the way to %s (spot %d) starts where the roll-out ends; it passes %.0f m from you and leads on %.0f degrees off your nose: too far, or behind you (taken within %d m and %d degrees).',
        tostring(park.name), park.spot, d, turn, MARSHAL.maxJoin, MARSHAL.maxJoinTurn))
    end
    from, route, s, start, fd = { spot = park.spot }, park.route, s0, p0, d
  end
  for _, st in ipairs(park and {} or routes) do
    local r0 = st.routes[cat]
    if type(r0) == 'table' and #r0 >= 2 then
      local s0 = routeLengths(r0)
      local p0, d = routeNearest(r0, s0, ctx.jx, ctx.jz, 0, 15)
      if not fd or d < fd then from, route, s, start, fd = st, r0, s0, p0, d end
    end
  end
  if not from then return say(string.format('there is no taxi route to catapult %d in the routes file', cat)) end
  local joined = park ~= nil
  if not park and fd > MARSHAL.maxStart then
    -- Not on a spot (the jet has taxied off, or was never on one): join whichever route to this catapult
    -- suits best, anywhere along it. Best: near, leading on in front of the nose rather than behind it,
    -- and with little left to taxi (so of two roads side by side the one already nearer the catapult).
    local best
    for _, st in ipairs(routes) do
      local r0 = st.routes[cat]
      if type(r0) == 'table' and #r0 >= 2 then
        local s0 = routeLengths(r0)
        local p0, d = routeNearest(r0, s0, ctx.jx, ctx.jz, 0, s0[#r0])
        if d <= MARSHAL.maxJoin then
          local ax, az = routeAt(r0, s0, p0 + MARSHAL.lookAhead)
          local turn = math.abs(offNose(ctx, ax, az))
          local cost = d + turn * 0.15 + (s0[#r0] - p0) * 0.05
          if turn <= MARSHAL.maxJoinTurn and (not best or cost < best.cost) then best = { st = st, r = r0, s = s0, p = p0, d = d, cost = cost } end
        end
      end
    end
    if not best then
      return say(string.format('no taxi route to catapult %d near you: none of the routes passes within %d m of you leading on within %d degrees of your nose (the nearest spot route, from spot %d, passes %.0f m from you).',
        cat, MARSHAL.maxJoin, MARSHAL.maxJoinTurn, from.spot, fd))
    end
    from, route, s, start, fd, joined = best.st, best.r, best.s, best.p, best.d, true
  end
  -- parking: the route goes on straight to the deck edge, and the jet stops with its nose wheel 6 ft short of it
  local parkStop, stationMax
  if park then
    local n = #route
    local dx, dz = route[n][1] - route[n - 1][1], route[n][2] - route[n - 1][2]
    local l = math.sqrt(dx * dx + dz * dz)
    local dE = l > 0 and edgeAhead(route[n][1], route[n][2], dx / l, dz / l) or nil
    if dE and dE <= PARK.edgeWithin then
      local r2 = {}
      for i = 1, n do r2[i] = route[i] end
      r2[n + 1] = { route[n][1] + dx / l * dE, route[n][2] + dz / l * dE }
      stationMax = s[n]
      route, s = r2, routeLengths(r2)
      parkStop = math.max(start + 5, s[n + 1] - PARK.noseFromEdge - PARK.noseGear - PARK.lead)
      logLine(string.format('marshal: %s: the deck edge is %.1f m straight on from the spot: the jet is stopped at %.1f m of the route, its nose wheel %.1f m from the edge', tostring(park.name), dE,
        parkStop + PARK.lead, PARK.noseFromEdge))
    end
  end
  local x4, z4 = routeAt(route, s, start + 4)
  local turn0 = math.abs(offNose(ctx, x4, z4))
  if not joined and turn0 > MARSHAL.maxFirstTurn then
    return say(string.format("the route from spawn spot %d to catapult %d starts %.0f degrees off your nose: you are not parked the way the spot's route leaves it. Turn the jet, or taxi off the spot and ask again.",
      from.spot, cat, turn0))
  end
  -- where the catapult's own crew takes over: the first metre of the route inside its start box
  local total = s[#route]
  local sEnd = total
  for d = 0, math.floor(total) do
    local x, z = routeAt(route, s, d)
    if cat and inBox(CAT_BOX[cat], x, z) then
      sEnd = d
      break
    end
  end
  if park then sEnd = parkStop or (total - 2) end -- to 6 ft from the edge (or, with no edge ahead, the spot itself): the last director stops the jet there
  local span = sEnd - start -- what our crew has: from where the jet is to the start box (or the spot)
  if span < 5 then
    if park then return say(string.format('you are within 5 m of %s already', tostring(park.name))) end
    return say(string.format("you are in catapult %d's start box already (or within 5 m of it): the catapult's own crew takes you from where you stand.", cat))
  end
  local r = doScan(ctx, 'for the marshalling', false)
  local ours, catDir = {}, nil
  for _, p in ipairs(r and r.mine or {}) do
    if kind(p) == 'ours' and role(p) ~= 'driver' and role(p) ~= 'rider' and p.x and p.z and not (captain and captain.h == p.h) then ours[#ours + 1] = p end -- (the plane captain stays with the jet)
    if cat and tostring(p.full) == cat .. ': director' and p.x and p.z then catDir = { x = p.x, z = p.z, h = p.h, name = cat .. ': director' } end
  end
  do -- the yellow shirts direct; the brown shirt only if there is no yellow shirt at all
    local dirs = {}
    for _, q in ipairs(ours) do
      if role(q) == 'director' then dirs[#dirs + 1] = q end
    end
    if #dirs > 0 then ours = dirs end
  end
  if #ours == 0 then return say('marshalling needs people of ours (catcc-...) on your ship: none found (data patch applied?)') end
  loadAnimInfo(ours[1])
  -- the stretches and where their directors stand
  local n = math.max(1, math.min(#ours, math.ceil(span / MARSHAL.stretch)))
  local team = {}
  for k = 1, n do
    local sTo = start + span * k / n
    local sAt = math.min(sTo + MARSHAL.beyond, stationMax or 1e9) -- (parking: nobody stands beyond the spot, between the nose and the edge)
    local x, z, dx, dz = routeAt(route, s, sAt)
    local _, _, ax, az = routeAt(route, s, sAt - 10)
    local _, _, bx, bz = routeAt(route, s, sAt + 10)
    local bend = ax * bz - az * bx -- positive: the route turns right there
    local side = bend < -0.05 and 1 or -1 -- he stands on the outside of the bend (the pilot's right is (-dz, dx)); straight: the pilot's left
    -- ... if there is deck there: else the other side, else closer in (catapult 4's line runs along the deck edge)
    local px, pz
    for _, try in ipairs({ { side, MARSHAL.side }, { -side, MARSHAL.side }, { side, 5 }, { -side, 5 } }) do
      local qx, qz = x - try[1] * try[2] * dz, z + try[1] * try[2] * dx
      if standable(qx, qz) then
        px, pz, side = qx, qz, try[1]
        break
      end
    end
    if not px then
      px, pz = x - side * MARSHAL.side * dz, z + side * MARSHAL.side * dx
      logLine(string.format('marshal: no place on deck found for the director of stretch %d: left at %.1f fwd %.1f stbd', k, px, pz))
    end
    local cx, cz = routeAt(route, s, math.max(0, sAt - 15))
    local fx, fz = cx - px, cz - pz
    local m = math.sqrt(fx * fx + fz * fz)
    team[k] = { sFrom = start + span * (k - 1) / n, sTo = sTo, P = { x = px, z = pz }, fx = fx / m, fz = fz / m, left = side < 0 }
  end
  -- who goes where: for each station in turn, whoever of ours is nearest and still free
  local t = now()
  local m = { cat = cat, park = park, spot = from.spot, route = route, s = s, sEnd = sEnd, total = total, team = team, phase = 'walk', t0 = t, nextT = t, prog = start, k = 1,
    sent = 0, maxOff = 0, catDir = catDir, hold = hold or nil }
  -- does the way ahead cross the bow bubble? Then it is lowered now and raised when the jet is past it.
  local bubbleSaid = ''
  for d = math.floor(start), math.floor(total) do
    local x, z = routeAt(route, s, d)
    if math.sqrt((x - BOW_BUBBLE.x) ^ 2 + (z - BOW_BUBBLE.z) ^ 2) <= BOW_BUBBLE.r then
      m.bubble = m.bubble or { sIn = d }
      m.bubble.sOut = d
    end
  end
  if m.bubble then
    bowWhy.route = true
    bubbleSaid = ' ' .. bowBubbleUpdate(shipHandle())
    logLine(string.format('marshal: the route crosses the bow bubble between %.0f and %.0f m: lowered until the jet is at %.0f m', m.bubble.sIn, m.bubble.sOut, m.bubble.sOut + BOW_BUBBLE.clear))
  end
  camAfter, teleWait = nil, nil
  local names = {}
  for k = 1, n do
    local who, bi, bd = team[k], nil, nil
    for i, p in ipairs(ours) do
      local d = distTo(p, who.P.x, who.P.z)
      if not bd or d < bd then bi, bd = i, d end
    end
    local p = table.remove(ours, bi)
    who.h, who.name, who.home = p.h, tostring(p.name), { x = p.x, z = p.z }
    names[k] = who.name
    local ok, res, e = walkOrder(p.h, who.P.x, who.P.z, who.fx, who.fz, ctx.s, p.name)
    if not ok or not res then return say(string.format('marshalling: the walk order for %s failed: %s', who.name, tostring(ok and e or res))) end
    logLine(string.format('marshal: %s takes the stretch %.0f..%.0f m: stands at %.1f fwd %.1f stbd (%s of the route), facing %.2f %.2f; walk: %s', who.name, who.sFrom, who.sTo,
      who.P.x, who.P.z, who.left and 'left' or 'right', who.fx, who.fz, tostring(e)))
  end
  watch = nil
  marsh = m
  if park then
    logLine(string.format('marshal: to park on %s (spot %d): route of %d points, %.0f m; the jet is %.1f m along it (%.1f m off it); %d director(s)', tostring(park.name), park.spot, #route,
      total, start, fd, n))
    do -- the route itself, for whoever reads the log (and the tests)
      local pts = {}
      for i, q in ipairs(route) do pts[i] = string.format('%.2f,%.2f', q[1], q[2]) end
      logLine('marshal: route ' .. table.concat(pts, ' '))
    end
    return say(string.format('marshalling to %s (spot %d): %.0f m to go. %s walking to %s. When %s is in place he takes you: follow the signals; the last director stops you on the spot.%s',
      tostring(park.name), park.spot, total - start, table.concat(names, ', '), n > 1 and 'their stations' or 'his station', names[1], bubbleSaid .. exitNote))
  end
  logLine(string.format('marshal: spawn spot %d to catapult %d: route of %d points, %.0f m; the jet is %.1f m along it (%.1f m off it); the catapult start box begins at %.0f m; %d director(s); catapult director %s',
    from.spot, cat, #route, total, start, fd, sEnd, n, catDir and string.format('at %.1f fwd %.1f stbd', catDir.x, catDir.z) or 'not found'))
  say(string.format("marshalling to catapult %d: %.0f m to go on the route from spawn spot %d; our crew has the first %.0f m, then the catapult's own crew. %s walking to %s. %s%s%s",
    cat, total - start, from.spot, span, table.concat(names, ', '), n > 1 and 'their stations' or 'his station',
    hold and 'They wait there: nobody takes you until your plane captain releases you.' or string.format('When %s is in place he takes you: follow the signals.', names[1]),
    joined and string.format(' (You are not on a spot: that route is joined where it passes %.0f m from you.)', fd) or '', bubbleSaid))
end

-- to a parking spot of a deck area (the menu's "Marshal me to a parking spot")
function commands.park(area) return commands.marshal(nil, area) end

-- everyone of the team back to idle, and walking back to where he stood
local function marshalHome(m, ctx)
  if m.bubble and bowWhy.route then -- (ended before the jet was past the bubble: it comes up again unless something else keeps it down)
    bowWhy.route = nil
    bowBubbleUpdate(shipHandle())
  end
  for _, who in ipairs(m.team) do
    if who.h then
      toIdle(who.h)
      if ctx then walkOrder(who.h, who.home.x, who.home.z, 0, 0, ctx.s, who.name) end
    end
  end
end

local function marshalTake(m, who, t, ctx)
  m.ctl, m.sig, m.attUntil = who, nil, t + 1.4
  local ok, name = sendSignal(who.h, 'attention', { keep = true }, ctx)
  logLine(string.format('  marshal: %s takes the jet at %.0f m: attention ("%s")%s', who.name, m.prog, tostring(name), ok and '' or ' FAILED'))
end

local function tickMarshal(t)
  local m = marsh
  if not m or t < m.nextT then return end
  m.nextT = t + 0.25
  local ctx = getCtx()
  if not ctx then return end
  if m.phase == 'done' then -- the last pass is over: everyone home
    if t >= m.doneAt then
      marsh = nil
      marshalHome(m, ctx)
    end
    return
  end
  -- where the jet is on the route (forwards only), and how far off it
  local prog, off = routeNearest(m.route, m.s, ctx.jx, ctx.jz, m.prog - 3, m.prog + 25)
  m.prog = math.max(m.prog, prog)
  -- who has reached his station (asked every tick until he has; "there" stays true)
  for _, who in ipairs(m.team) do
    if not who.there then
      local a = inPlace(who, t, t)
      if a == nil then
        marsh = nil
        return say('marshalling: lost sight of ' .. who.name)
      end
      if a then
        who.there = true
        logLine(string.format('  marshal: %s is at his station (%.1f m off it) after %.0f s', who.name, who.away or 0, t - m.t0))
      end
    end
  end
  if m.phase == 'walk' then
    if m.hold or not m.team[1].there then return end
    m.phase = 'direct'
    say(string.format('marshalling: %s is in place (after %.0f s). Taxi: follow the signals.', m.team[1].name, t - m.t0))
    marshalTake(m, m.team[1], t, ctx)
    return
  end
  m.maxOff = math.max(m.maxOff, off)
  if m.bubble and bowWhy.route and m.prog >= m.bubble.sOut + BOW_BUBBLE.clear then
    bowWhy.route = nil
    logLine(string.format('  marshal: the jet is past the bow bubble (at %.0f m): %s', m.prog, bowBubbleUpdate(shipHandle())))
  end
  -- In the catapult's start box, far enough for the gear to be in it (the catapult's crew takes a jet
  -- whose gear is in the box: the nose gear is about 5.5 m ahead of the jet's position, the main gear
  -- just behind it), or at the end of our part: the catapult's own crew has the jet.
  if m.park then
    -- parking: at the end of the route the director who has the jet stops it; five seconds on, everyone goes home
    if m.prog >= m.sEnd then
      local who = m.ctl or m.team[m.k]
      local ok, name = sendSignal(who.h, 'stop', nil, ctx)
      logLine(string.format('  marshal: %s stops the jet on %s ("%s")%s; jet at %.0f m of the route, %.1f m off it', who.name, tostring(m.park.name), tostring(name), ok and '' or ' FAILED', m.prog, off))
      logLine(string.format('  marshal: over after %.0f s; %d signal changes; furthest off the route %.1f m', t - m.t0, m.sent, m.maxOff))
      say(string.format('marshalling over: you are on %s (you were at most %.1f m off the route).%s', tostring(m.park.name), m.maxOff,
        m.park.fx and ' Hold the brakes: when you stand still you are put square on the spot.' or ''))
      -- the spot itself and the way a jet spawned on it faces: the jet is put there when it stands still (tickTeleport)
      if m.park.fx then teleWait = { x = m.park.x, z = m.park.z, fx = m.park.fx, fz = m.park.fz, name = tostring(m.park.name), at = t } end
      m.phase, m.doneAt, m.ctl = 'done', t + 5, nil
      return
    end
  end
  local box = m.cat and CAT_BOX[m.cat]
  local gearIn = box and inBox(box, ctx.jx + 5.5 * ctx.fx, ctx.jz + 5.5 * ctx.fz) and inBox(box, ctx.jx - 1 * ctx.fx, ctx.jz - 1 * ctx.fz)
  if not m.park and (gearIn or m.prog >= m.sEnd + MARSHAL.gearIn) then
    local who = m.ctl or m.team[m.k]
    local ok, name = sendSignal(who.h, 'pass', m.catDir and { target = m.catDir } or { angle = 0 }, ctx)
    logLine(string.format("  marshal: %s passes control to catapult %d's crew (\"%s\")%s; jet at %.0f m of the route, %.1f m off it", who.name, m.cat, tostring(name), ok and '' or ' FAILED', m.prog, off))
    logLine(string.format('  marshal: over after %.0f s; %d signal changes; furthest off the route %.1f m', t - m.t0, m.sent, m.maxOff))
    say(string.format("marshalling over: catapult %d's own crew has you (you were at most %.1f m off the route).", m.cat, m.maxOff))
    -- (the camera stays on the catapult's own director for the hook-up: two minutes, or until the jet has left the deck)
    if m.catDir and m.catDir.h then camAfter = { h = m.catDir.h, name = m.catDir.name, untilT = t + 120, jy = ctx.jy } end
    m.phase, m.doneAt, m.ctl = 'done', t + 2, nil
    return
  end
  -- the end of a stretch: pass control to the next director
  if m.ctl and m.k < #m.team and m.prog >= m.ctl.sTo then
    local nxt = m.team[m.k + 1]
    local ok, name = sendSignal(m.ctl.h, 'pass', { target = nxt.P }, ctx)
    logLine(string.format('  marshal: %s hands over to %s at %.0f m: pass control ("%s")%s', m.ctl.name, nxt.name, m.prog, tostring(name), ok and '' or ' FAILED'))
    m.k, m.ctl, m.sig, m.takeAt = m.k + 1, nil, nil, t + 2 -- the next one takes the jet when the pass is over
    return
  end
  if not m.ctl then
    if t >= (m.takeAt or 0) then
      local who = m.team[m.k]
      if who.there then
        marshalTake(m, who, t, ctx)
      elseif not who.lateSaid then
        who.lateSaid = true
        logLine(string.format('  marshal: %s is not at his station yet (%.1f m to go): nobody signals until he is', who.name, who.away or -1))
      end
    end
    return
  end
  if t < m.attUntil then return end
  -- the signal: where the route goes 10 m ahead, seen from the jet
  local lx, lz = routeAt(m.route, m.s, m.prog + MARSHAL.lookAhead)
  local ang = offNose(ctx, lx, lz)
  local lim = (m.sig == 'left' or m.sig == 'right') and MARSHAL.turnOff or MARSHAL.turnOn
  local want = ang > lim and 'right' or (ang < -lim and 'left' or 'ahead')
  if want ~= m.sig then
    m.sig, m.sent = want, m.sent + 1
    local ok, name = sendSignal(m.ctl.h, want, nil, ctx)
    logLine(string.format('  marshal: %s signals %s ("%s")%s; jet at %.0f m of the route, %.1f m off it; the route ahead %.0f deg off the nose', m.ctl.name, want, tostring(name),
      ok and '' or ' FAILED', m.prog, off, ang))
  end
end

-- ---------------------------------------------------------------- the catapult crews' own orders
-- DCS's catapult crews (one behaviour tree each, USS_Nimitz/scripts/common.xml) wait on three orders:
--   free the catapult: with no aircraft assigned, the six walk their "free_cat" routes and the crew is
--     then not ready to be given an aircraft (the catapult is out of use);
--   take the catapult: they walk their "occupy_cat" routes back and are ready again;
--   operation allowed: with an aircraft in the start box, they wait while it is false.
-- Flight.dll exports the functions that give them (wCarrierCrew::request_free_catapult(bool),
-- set_operation_allowed(bool), reset_orders()); the native module calls them. What each really does,
-- and whether DCS's own logic (which frees the waist catapults for a landing aircraft) undoes it, is
-- what these menu items are for: the recorder logs where every crew member walks.
-- A crew is matched to its catapult by its start box (GroundCrew.lua's, CAT_BOX above).
local function catCrews(r)
  local p = r and r.mine[1]
  if not p then return nil, 'nobody found on your ship to ask through' end
  if not native.catcrews then return nil, 'this needs the newer native module: run crew-test\\install.ps1 with DCS closed' end
  local ok, t, e = pcall(native.catcrews, p.h)
  if not ok or type(t) ~= 'table' then return nil, tostring(ok and e or t) end
  t.h, t.byCat = p.h, {}
  for _, c in ipairs(t.crews) do
    if c.ok and c.x1 then
      for k, b in ipairs(CAT_BOX) do
        if math.abs(c.x1 - b[1]) < 1 and math.abs(c.x2 - b[2]) < 1 and math.abs(c.z1 - b[3]) < 1 and math.abs(c.z2 - b[4]) < 1 then c.cat, t.byCat[k] = k, c end
      end
    end
  end
  return t
end

local function withCrews(fn)
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local r = doScan(ctx, 'for a catapult crew command', false)
  local t, why = catCrews(r)
  if not t then return say('catapult crews: ' .. tostring(why)) end
  return fn(t, ctx, r)
end

local function onOff(v) return v == nil and '?' or (v and 'ON' or 'off') end

-- The character code's own switches (AnimatorLogic::debug_settings, four bytes; native.catcrews gives
-- them as "0101"): [2] a walker takes the velocity the collision avoidance worked out, [3] a walker asks
-- his path finder for a way to the target. With [3] off (as found 2026-11-14) a walk order is the
-- straight line, whatever the crew environment's own two switches say.
local function dbgOn(d, i) return type(d) == 'string' and d:sub(i + 1, i + 1) == '1' end
local function switchesText(avoid, pathAvoid, d)
  return string.format("crew environment: avoid collisions %s, path avoids collisions %s; character code: take the avoidance's velocity %s, use the path finder %s", onOff(avoid),
    onOff(pathAvoid), type(d) == 'string' and onOff(dbgOn(d, 2)) or '?', type(d) == 'string' and onOff(dbgOn(d, 3)) or '?')
end

-- What runs every frame for the catapult crews (tickCats): set by any catapult command.
--   catAsk   a handle on the ship to ask through, and each catapult's crew number
--   catHold  [cat] = the free order is given again every frame (run 2026-11-14: given once, the crew
--            walked off and came straight back, three times out of three)
--   ordSeen  [cat] = the crew's order bytes as last read (native.orderpeek: the places a setter was
--            seen to change), so a change made by DCS itself is logged with its time
--   crewHome [handle] = where a catapult crew member stood, and faced, before we walked him away
local catAsk, catHold, ordSeen, crewHome, allowedOff = nil, {}, {}, {}, {}

local function catsReset() catAsk, catHold, ordSeen, crewHome, allowedOff = nil, {}, {}, {}, {} end

local function rememberCrews(t)
  catAsk = { h = t.h, byCat = {} }
  for k, c in pairs(t.byCat) do catAsk.byCat[k] = c.i end
end

function commands.cats()
  withCrews(function(t)
    rememberCrews(t)
    for _, c in ipairs(t.crews) do
      local s = c.ok and (c.x1 and string.format('crew %d: start box x %.1f..%.1f, z %.1f..%.1f = catapult %s', c.i, c.x1, c.x2, c.z1, c.z2, tostring(c.cat or '?'))
        or string.format('crew %d: start box unreadable', c.i)) or string.format('crew %d: not a catapult crew', c.i)
      logLine('  ' .. s)
    end
    -- The order bytes' places are found from what a setter changes. If none are known yet, each order is
    -- switched and switched straight back on one crew (catapult 1's) inside this one call: its behaviour
    -- tree does not run in between, so the crew never sees it. From then on tickCats logs every change
    -- DCS itself makes to any catapult's orders (it frees the waist catapults for each landing aircraft).
    local c1 = t.byCat[1] or t.byCat[2]
    if c1 and native.orderpeek then
      local okp, txt = pcall(native.orderpeek, t.h, c1.i)
      if okp and txt == '' then
        local _, _, a = pcall(native.catorder, t.h, c1.i, 'allowed', false)
        pcall(native.catorder, t.h, c1.i, 'allowed', true, true)
        local _, _, f = pcall(native.catorder, t.h, c1.i, 'free', true)
        pcall(native.catorder, t.h, c1.i, 'free', false, true)
        logLine(string.format('  order bytes looked for on crew %d (each order switched and switched straight back): operation allowed off changed: %s; free changed: %s', c1.i,
          (type(a) == 'string' and a ~= '') and a or 'nothing found', (type(f) == 'string' and f ~= '') and f or 'nothing found'))
      end
    end
    local known, held, off = {}, {}, {}
    for k = 1, 4 do
      known[#known + 1] = t.byCat[k] and tostring(k) or nil
      held[#held + 1] = catHold[k] and tostring(k) or nil
      off[#off + 1] = allowedOff[k] and tostring(k) or nil
      if t.byCat[k] and native.orderpeek then
        local ok, txt = pcall(native.orderpeek, t.h, t.byCat[k].i)
        logLine(string.format('  catapult %d order bytes: %s', k, (ok and txt and txt ~= '') and txt or 'no places known yet (give one catapult an order first)'))
      end
    end
    local atc = deckNow()
    if atc then logLine('  deck: ' .. atc .. ' (asked for the report)') end
    say(string.format('catapult crews on your ship: %d (catapults %s recognised by their start boxes). Free order held on: %s. Operation allowed switched off by us on: %s. Switches: %s.%s',
      t.count, #known > 0 and table.concat(known, ', ') or 'none', #held > 0 and table.concat(held, ', ') or 'none', #off > 0 and table.concat(off, ', ') or 'none',
      switchesText(t.avoid, t.pathAvoid, t.debug), atc and (" The carrier's ATC: " .. atc .. '.') or ''))
  end)
end

-- what: "close" (operation allowed off, then the free order every frame: the crew clears and, with
-- director-test.ps1 -CatGate in DCS's crew tree, stays off whatever DCS orders), "open" (operation
-- allowed on, take the catapult; ends the hold), "free" (request_free_catapult true, once), "hold" (the
-- same, then again every frame until "take"), "take" (request_free_catapult false; ends a hold),
-- "allowoff" / "allowon" (set_operation_allowed false / true), "reset" (reset_orders); cat: 1..4
local CAT_ORDER = {
  close = { 'free', true, 'CLOSED: operation allowed off, and told to free the catapult (given again every frame until "Open it"). They should walk off and STAY off, through landings too, and leave a jet in the start box alone' },
  open = { 'free', false, 'OPEN: operation allowed on, told to take the catapult' },
  free = { 'free', true, 'told to FREE the catapult, once (on 2026-11-14 the crew walked off and came straight back)' },
  hold = { 'free', true, 'told to FREE the catapult, and the order is now given again every frame until "take it" (do they walk off and STAY off?)' },
  take = { 'free', false, 'told to TAKE the catapult' },
  allowoff = { 'allowed', false, 'operation allowed set to FALSE. Taxi into its start box: its crew should leave you alone' },
  allowon = { 'allowed', true, 'operation allowed set to TRUE: its crew should work a jet in its start box' },
  reset = { 'reset', false, 'orders reset' },
  -- wCarrierCrew::reset_LA: the crew's own "no aircraft" (what it does to a jet already on the shuttle is for the eye)
  abort = { 'dropjet', false, 'told to LET GO of its aircraft, the catapult CLOSED (Open it: the same menu)' },
}

-- The carrier's catapult control bubbles. DCS has its own command for them (woShip::setBubbleCommand,
-- exported by Transport.dll; the native module calls it), and the ship's own code moves them from it:
-- command 2 takes the bubble's model argument up to 1, command 0 or 1 takes it down to 0; the ship
-- definition lists two bubbles (GT.animation_arguments.bubbles = {138, 139}).
--   Run of 2026-11-15: both arguments stood at 1 with both bubbles UP, so the argument at 1 is the
--   bubble raised and command 2 raises it (the first build had this the wrong way round: its "down" sent
--   command 2 to a bubble that was up already). DCS gives these commands itself: the waist bubble went
--   down for a landing aircraft and came up when it had left the landing area.
--   Which is which (run of 2026-11-15, 07:30): index 0 (model argument 138) is the BOW's, index 1 (139)
--   the WAIST's (the second build had them the other way round: a route over the bow bubble lowered the
--   waist's). DCS gives the WAIST bubble its command again every frame (up while launching, down for a
--   landing); the bow's it leaves alone once set.
--   A bubble we want down is KEPT down: four times a second the command the ship holds is read
--   (native.shipcmds) and given again if DCS has changed it.
--   The rules: with catapults 1 and 2 both CLOSED the bow bubble goes down, and while a route of ours
--   crosses it; it comes up when neither holds any more.
local BUBBLE = { bow = 0, waist = 1, down = 1, up = 2 }
local BUBBLE_STATE = { [-1] = 'no such bubble', [0] = 'up (argument at 1)', [1] = 'down (argument at 0)', [2] = 'moving' }
local catClosed, bowDown = {}, false
local bubbleKeep, elevKeep = {}, {} -- [index from 0] = { cmd, n = times given again }: commands of ours that are kept
local cmdSeen, cmdT = nil, 0        -- the ship's commands as last read (tickShipCmds)

-- someone on the player's ship to ask through (the recorder's people), or nil
function shipHandle() return (next(recPeople)) end

local function bubbleSet(h, idx, cmd)
  if not native.bubble then return nil, 'this needs the newer native module: run crew-test\\install.ps1 with DCS closed' end
  if not h then return nil, 'nobody found on your ship to ask through yet' end
  local ok, st, e = pcall(native.bubble, h, idx, cmd)
  if not ok or st == nil then return nil, tostring(ok and e or st) end
  return st
end

-- The bow bubble follows the reasons for it to be down (bowWhy); returns what to say ('' if nothing changed).
function bowBubbleUpdate(h)
  local want = next(bowWhy) ~= nil
  if want == bowDown then return '' end
  local st, why = bubbleSet(h, BUBBLE.bow, want and BUBBLE.down or BUBBLE.up)
  if not st then
    logLine('bow bubble: the command failed: ' .. tostring(why))
    return '(The bow bubble could not be commanded: ' .. tostring(why) .. '.)'
  end
  bowDown = want
  bubbleKeep[BUBBLE.bow] = want and { cmd = BUBBLE.down, n = 0 } or nil
  local whys = {}
  for k in pairs(bowWhy) do whys[#whys + 1] = k end
  table.sort(whys)
  logLine(string.format('bow bubble: %s: bubble %d <- command %d; state now: %s', want and ('down for: ' .. table.concat(whys, ', ')) or 'nothing keeps it down any more', BUBBLE.bow + 1,
    want and BUBBLE.down or BUBBLE.up, BUBBLE_STATE[st] or tostring(st)))
  return want and 'The bow bubble is told to go DOWN.' or 'The bow bubble is told to come UP again.'
end

-- after a catapult was closed or opened: the bow bubble follows catapults 1 and 2
local function bowBubbleRule(h)
  bowWhy.closed = (catClosed[1] == true and catClosed[2] == true) or nil
  local said = bowBubbleUpdate(h)
  return said ~= '' and (' ' .. (bowWhy.closed and 'Catapults 1 and 2 are both closed. ' or '') .. said) or ''
end

-- Four times a second: the commands the ship holds for its bubbles and elevators. A change we did not
-- make is DCS's own (its landing and launch logic, its elevator control): logged with the time. A
-- command of ours that is kept (a bubble down, an elevator down) is given again when DCS has changed it.
local function tickShipCmds(t)
  if t < cmdT or not native or not native.shipcmds then return end
  cmdT = t + 0.25
  local h = shipHandle()
  if not h then return end
  local ok, c = pcall(native.shipcmds, h)
  if not ok or type(c) ~= 'table' then return end
  -- (a command of ours that is kept is shown as ours, with a star: DCS's own, which we overwrite four times
  -- a second, would otherwise fill the log)
  local bt, et = {}, {}
  for i = 1, 2 do bt[i] = bubbleKeep[i - 1] and (bubbleKeep[i - 1].cmd .. '*') or tostring(c.bubble and c.bubble[i] or '?') end
  for i = 1, 4 do et[i] = elevKeep[i - 1] and (elevKeep[i - 1].cmd .. '*') or tostring(c.elevator and c.elevator[i] or '?') end
  local txt = string.format('bubbles %s; elevators %s', table.concat(bt, ' '), table.concat(et, ' '))
  if txt ~= cmdSeen then
    -- (while the demo runs on its own thread, that thread's copy of this says it: it knows which are kept)
    if not (CATCC_THR and CATCC_THR.live) then logLine(string.format('  ship commands: %s%s', txt, cmdSeen and ('   was: ' .. cmdSeen) or ' (first reading; a bubble: 2 up, 0 or 1 down; an elevator: 1 down, 2 up, 0 none; a star: kept by us)')) end
    cmdSeen = txt
  end
  for idx, k in pairs(bubbleKeep) do
    if c.bubble and c.bubble[idx + 1] and c.bubble[idx + 1] ~= k.cmd then
      k.n = k.n + 1
      pcall(native.bubble, h, idx, k.cmd, true)
      if k.n <= 3 or k.n % 500 == 0 then logLine(string.format('  bubble %d: the ship held command %d, ours is %d: given again (%d times so far)', idx + 1, c.bubble[idx + 1], k.cmd, k.n)) end
    end
  end
  for idx, k in pairs(elevKeep) do
    if c.elevator and c.elevator[idx + 1] and c.elevator[idx + 1] ~= k.cmd then
      k.n = k.n + 1
      pcall(native.elevator, h, idx, k.cmd, true)
      if k.n <= 3 or k.n % 500 == 0 then logLine(string.format('  elevator %d: the ship held command %d, ours is %d: given again (%d times so far)', idx + 1, c.elevator[idx + 1], k.cmd, k.n)) end
    end
  end
end

-- by hand: which = "1" / "2" (the bubble), cmd = "down" / "up"; or which = "report"
function commands.bubble(which, cmd)
  withCrews(function(t)
    if which == 'report' then
      local parts = {}
      for i = 0, 1 do
        local st, why = bubbleSet(t.h, i, nil)
        parts[#parts + 1] = string.format('%s bubble: %s', i == BUBBLE.bow and 'bow' or 'waist', st and (BUBBLE_STATE[st] or tostring(st)) or ('could not be read: ' .. tostring(why)))
      end
      logLine('command bubble report: ' .. table.concat(parts, '; '))
      return say(table.concat(parts, '; ') .. '.')
    end
    local idx = (which == 'bow' and BUBBLE.bow) or (which == 'waist' and BUBBLE.waist) or nil
    local c = (cmd == 'down' or cmd == 'up') and BUBBLE[cmd] or nil
    if not idx or not c then return say('unknown bubble command') end
    if idx == BUBBLE.bow then
      -- the bow's goes through its reasons: by hand down is one more; by hand up clears them all
      if cmd == 'down' then bowWhy.hand = true else bowWhy = {} end
      local said = bowBubbleUpdate(t.h)
      logLine(string.format('command bubble: the bow bubble by hand %s: %s', cmd, said ~= '' and said or 'it is told so already'))
      return say(string.format('the bow bubble told to go %s%s.', cmd == 'down' and 'DOWN, and kept down' or 'UP', said == '' and ' (it was told so already)' or ''))
    end
    local st, why = bubbleSet(t.h, idx, c)
    if not st then return say(string.format('the waist bubble: the command failed: %s', tostring(why))) end
    bubbleKeep[idx] = cmd == 'down' and { cmd = c, n = 0 } or nil
    logLine(string.format('command bubble: the waist bubble (bubble %d) <- command %d (%s); state now: %s', idx + 1, c, cmd, BUBBLE_STATE[st] or tostring(st)))
    say(cmd == 'down' and 'the waist bubble told to go DOWN, and kept down (DCS raises it again by itself while launching: ours is given again).'
      or 'the waist bubble told to go UP (DCS lowers it again by itself for a landing).')
  end)
end

function commands.catorder(what, catArg)
  local cat = tonumber(catArg)
  local o = CAT_ORDER[what or '']
  if not o then return say('unknown catapult order ' .. tostring(what)) end
  withCrews(function(t)
    local c = cat and t.byCat[cat]
    if not c then return say(string.format("catapult %s's crew was not found (F10 > Catapult crews > Report)", tostring(catArg))) end
    if what == 'close' or what == 'open' then
      local okA, resA, eA = pcall(native.catorder, t.h, c.i, 'allowed', what == 'open')
      if not okA or not resA then return say(string.format("catapult %d's crew: the operation allowed order failed: %s", cat, tostring(okA and eA or resA))) end
      allowedOff[cat] = (what == 'close') or nil
    end
    local ok, res, chg = pcall(native.catorder, t.h, c.i, o[1], o[2])
    if not ok or not res then return say(string.format("catapult %d's crew: the order failed: %s", cat, tostring(ok and chg or res))) end
    rememberCrews(t)
    local ended = ''
    if o[1] == 'dropjet' then
      -- (2026-11-15: the crew's own "no aircraft" alone changed nothing that could be seen with the jet in
      -- the shuttle.) So the abort is now three things: the crew told to let go, the catapult closed (its
      -- crew walks off and stays off), and the jet itself moved 20 m straight back off the shuttle (the
      -- aircraft's own ForcePosition, which put the jet on a parking spot the same day).
      pcall(native.catorder, t.h, c.i, 'allowed', false)
      pcall(native.catorder, t.h, c.i, 'free', true)
      allowedOff[cat], catClosed[cat] = true, true
      catHold[cat] = { i = c.i, n = 0, undone = 0 }
      ended = ' ' .. bowBubbleRule(t.h)
      local ctx = getCtx()
      local id = (Export and Export.LoGetPlayerPlaneId) and select(2, pcall(Export.LoGetPlayerPlaneId)) or nil
      if ctx and type(id) == 'number' and native.forcepos and inBox({ CAT_BOX[cat][1] - 10, CAT_BOX[cat][2] + 95, CAT_BOX[cat][3] - 12, CAT_BOX[cat][4] + 12 }, ctx.jx, ctx.jz) then
        local bx, bz = ctx.jx - 20 * ctx.fx, ctx.jz - 20 * ctx.fz
        if standable(bx, bz) then
          local sh = ctx.s
          local okF, resF, eF = pcall(native.forcepos, id, ctx.fx * sh[1] + ctx.fz * sh[7], ctx.fx * sh[2] + ctx.fz * sh[8], ctx.fx * sh[3] + ctx.fz * sh[9], sh[4], sh[5], sh[6],
            ctx.fx * sh[7] - ctx.fz * sh[1], ctx.fx * sh[8] - ctx.fz * sh[2], ctx.fx * sh[9] - ctx.fz * sh[3],
            sh[10] + bx * sh[1] + ctx.jy * sh[4] + bz * sh[7], sh[11] + bx * sh[2] + ctx.jy * sh[5] + bz * sh[8], sh[12] + bx * sh[3] + ctx.jy * sh[6] + bz * sh[9])
          logLine(string.format('  abort: the jet moved 20 m straight back, from %.1f fwd %.1f stbd to %.1f fwd %.1f stbd: %s', ctx.jx, ctx.jz, bx, bz, (okF and resF) and 'called' or ('FAILED: ' .. tostring(okF and eF or resF))))
          ended = ended .. ((okF and resF) and ' You are moved 20 m straight back, off the shuttle.' or ' Moving the jet back failed.')
        else
          ended = ended .. ' (No deck 20 m behind you: the jet is left where it is.)'
        end
      else
        ended = ended .. ' (You are not on that catapult: the jet is left where it is.)'
      end
    elseif o[1] ~= 'allowed' then
      local hd = catHold[cat]
      local holds = what == 'hold' or what == 'close'
      if hd and not holds then ended = string.format(' The hold is ended: the free order was given %d times.', hd.n) end
      catHold[cat] = holds and { i = c.i, n = 0, undone = 0 } or nil
    else
      allowedOff[cat] = (not o[2]) or nil
    end
    ordSeen[cat] = nil -- the next frame logs the order bytes afresh
    local bubble = ''
    if what == 'close' or what == 'open' then
      catClosed[cat] = (what == 'close') or nil
      bubble = bowBubbleRule(t.h)
    end
    logLine(string.format('command catorder: catapult %d (crew %d) <- %s; bytes the call changed 0 <-> 1: %s.%s', cat, c.i, what, (type(chg) == 'string' and chg ~= '') and chg or 'none found', ended))
    say(string.format("catapult %d's crew: %s.%s%s", cat, o[3], ended, bubble))
  end)
end
-- Every frame: the order bytes of each catapult's crew are read (a change since the frame before is
-- DCS's own doing, or the crew's own behaviour tree's: logged, at most 6 lines a second per catapult),
-- then a held free order is given again.
local function tickCats(t)
  if not native or not catAsk or not native.orderpeek then return end
  for cat = 1, 4 do
    local i = catAsk.byCat[cat]
    if i then
      local ok, txt = pcall(native.orderpeek, catAsk.h, i)
      if not ok or txt == nil then
        logLine('  catapult orders: the man asked through is gone; the order watch and any hold have stopped (give a catapult order again)')
        catAsk, catHold = nil, {}
        return
      end
      local s = ordSeen[cat]
      if not s then
        s = { logT = t, logN = 0, skipped = 0 }
        ordSeen[cat] = s
      end
      if txt ~= s.txt then
        if t - s.logT >= 1 then
          if s.skipped > 0 then logLine(string.format('  orders, catapult %d: %d more changes in that second, not logged', cat, s.skipped)) end
          s.logT, s.logN, s.skipped = t, 0, 0
        end
        if s.logN < 6 then
          s.logN = s.logN + 1
          logLine(string.format('  orders, catapult %d (crew %d): %s%s', cat, i, txt ~= '' and txt or '(no places known yet)', s.txt and ('   was: ' .. s.txt) or ''))
        else
          s.skipped = s.skipped + 1
        end
      end
      local hd = catHold[cat]
      if hd then
        local ok2, res = pcall(native.catorder, catAsk.h, i, 'free', true, true)
        if ok2 and res then
          hd.n = hd.n + 1
          local ok3, after = pcall(native.orderpeek, catAsk.h, i)
          if ok3 and after then
            if after ~= txt then hd.undone = hd.undone + 1 end
            txt = after
          end
        end
      end
      s.txt = txt
    end
  end
end

-- A catapult's crew walked somewhere else, and back, by our own walk orders (move_command_world: the
-- same order every test of ours has used), not by DCS's free / take routes: can PriFly put a catapult's
-- crew anywhere on the deck? Each member's place and facing are noted first. The places they are sent
-- to: six spots 2 m apart, on the deck (checked against its outline in the tests):
--   catapult 1: starboard side abeam its start box      catapult 3: starboard side, forward of the island's aft end
--   catapult 2: the port bow edge                       catapult 4: starboard side aft
local CREW_AWAY = { { 46, 29 }, { 50, -32 }, { -30, 29 }, { -100, 25 } } -- [cat] = x forward, z starboard of the first spot
local function awaySpot(cat, k) -- k 1..6: two rows of three
  local b = CREW_AWAY[cat]
  return b[1] + ((k - 1) % 3) * 2, b[2] + (k > 3 and 2 or 0)
end

local function crewMembers(r, crewNo)
  local out = {}
  for _, p in ipairs(r.mine) do
    local n = tostring(p.full or ''):match('^(%d+): ')
    if tonumber(n) == crewNo and kind(p) == 'cat' and p.movable and p.x and p.y then out[#out + 1] = p end
  end
  table.sort(out, function(a, b) return tostring(a.name) < tostring(b.name) end)
  return out
end

function commands.crewaway(catArg)
  local cat = tonumber(catArg)
  withCrews(function(t, ctx, r)
    local c = cat and t.byCat[cat]
    if not c then return say(string.format("catapult %s's crew was not found (F10 > Catapult crews > Report)", tostring(catArg))) end
    rememberCrews(t)
    local sent, left, k = {}, {}, 0
    local members, deckY = crewMembers(r, c.i), -1e9
    for _, p in ipairs(members) do deckY = math.max(deckY, p.y) end
    for _, p in ipairs(members) do
      if p.y < deckY - 0.5 then
        left[#left + 1] = tostring(p.name) -- not on the flight deck (catapult 4's white2 stands on the catwalk, 1.3 m lower): left where he is
      else
        k = k + 1
        if not crewHome[p.h] then
          local ok, _, x, _, z, _, fx, fz = pcall(native.state, p.h, true)
          crewHome[p.h] = { x = (ok and x) or p.x, z = (ok and z) or p.z, fx = (ok and fx) or 0, fz = (ok and fz) or 0, name = tostring(p.name), cat = cat }
        end
        local tx, tz = awaySpot(cat, k)
        local ok, res, e = walkOrder(p.h, tx, tz, 0, 0, ctx.s, p.name)
        logLine(string.format('command crewaway: catapult %d %s from %.1f fwd %.1f stbd to %.1f fwd %.1f stbd: %s', cat, tostring(p.name), p.x, p.z, tx, tz,
          (ok and res) and tostring(e) or ('FAILED: ' .. tostring(ok and e or res))))
        if ok and res then sent[#sent + 1] = tostring(p.name) end
      end
    end
    if #sent == 0 then return say(string.format("catapult %d's crew: nobody could be sent (see the log)", cat)) end
    say(string.format("catapult %d's crew sent to %.0f m fwd, %.0f m stbd by our own walk orders: %s.%s Do they go, and stay there? (The log records where each walks.)", cat,
      CREW_AWAY[cat][1], CREW_AWAY[cat][2], table.concat(sent, ', '), #left > 0 and (' Left where he is (not on the flight deck): ' .. table.concat(left, ', ') .. '.') or ''))
  end)
end

function commands.crewback(catArg)
  local cat = tonumber(catArg)
  withCrews(function(t, ctx, r)
    local c = cat and t.byCat[cat]
    if not c then return say(string.format("catapult %s's crew was not found (F10 > Catapult crews > Report)", tostring(catArg))) end
    local sent = {}
    for _, p in ipairs(crewMembers(r, c.i)) do
      local hm = crewHome[p.h]
      if hm then
        local ok, res, e = walkOrder(p.h, hm.x, hm.z, hm.fx, hm.fz, ctx.s, p.name)
        logLine(string.format('command crewback: catapult %d %s to %.1f fwd %.1f stbd, to face %.2f %.2f: %s', cat, tostring(p.name), hm.x, hm.z, hm.fx, hm.fz,
          (ok and res) and tostring(e) or ('FAILED: ' .. tostring(ok and e or res))))
        -- (his place is kept: it is where he stood before we first sent him anywhere, whatever happens to this order)
        if ok and res then sent[#sent + 1] = tostring(p.name) end
      end
    end
    if #sent == 0 then return say(string.format("catapult %d's crew: nobody of it was sent away by us", cat)) end
    say(string.format("catapult %d's crew sent back to where they stood: %s.", cat, table.concat(sent, ', ')))
  end)
end

-- The switches that decide whether a walker goes round things. which:
--   "path"  path finding on: the environment's "path avoids collisions" (it then keeps its navigation
--           grid filled with the objects on deck) and the character code's "use the path finder"
--   "vel"   the avoidance's velocity on: the environment's "avoid collisions" and the character code's
--           "take the avoidance's velocity"
--   "none"  all four off, as DCS had them (deck crew option off, 2026-11-14)
--   "report" nothing changed
function commands.avoid(which)
  withCrews(function(t)
    if not native.envflags or not native.debugset then return say('this needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
    local a, p, d2, d3 = -1, -1, nil, nil
    if which == 'path' then
      p, d3 = 1, 1
    elseif which == 'vel' then
      a, d2 = 1, 1
    elseif which == 'none' then
      a, p, d2, d3 = 0, 0, 0, 0
    elseif which ~= 'report' then
      return say('unknown switch ' .. tostring(which))
    end
    local ok, av, pa = pcall(native.envflags, t.h, a, p)
    if not ok or av == nil then return say('collision avoidance: the environment switches could not be set: ' .. tostring(pa or av)) end
    if d2 then pcall(native.debugset, 2, d2) end
    if d3 then pcall(native.debugset, 3, d3) end
    local ok2, b0, b1, b2, b3 = pcall(native.debugset)
    local d = (ok2 and b0) and string.format('%d%d%d%d', b0, b1, b2, b3) or nil
    local text = switchesText(av, pa, d)
    logLine(string.format('command avoid %s: %s (the four bytes: %s)', tostring(which), text, tostring(d)))
    say(text .. (which == 'report' and '.' or '. Wait 10 s (the navigation grid is refilled on a timer), then "Target: walk > To the far side of my jet".'))
  end)
end

-- The carrier's four elevators by hand: DCS's own command (woShip::setElevatorCommand, the call the
-- BetteraircraftCarrier mod makes). which = "1".."4", cmd = "down" / "up"; or which = "report".
--   What the commands do, from the ship's own code (Transport.dll) and the run of 2026-11-15:
--   command 1 lowers: the fence at the deck edge comes up, the platform goes down, and at the bottom the
--     hangar door behind it opens (the door is one of the elevator's own model arguments:
--     GT.animation_arguments.elevators_doors) and the lower fence goes down;
--   command 2 raises: the same backwards (door shut first); it also stops a lowering under way;
--   command 0 leaves everything where it is.
--   Given once, command 1 took the platform down and at the bottom it came straight back up: DCS's own
--   elevator control (the ATC's, for AI aircraft struck below) had told it to. So "down" is KEPT here
--   (tickShipCmds gives it again whenever the ship holds another command) until "up".
local ELEV_STATE = { [-1] = 'no such elevator', [0] = 'up (argument at 0)', [1] = 'down (argument at 1)', [2] = 'moving' }
local ELEV_CMD = { down = 1, up = 2 }
-- The hangar door opens from the moment the elevator is told to go down (asked for 2026-11-15), not only
-- when the platform has reached the bottom as DCS's own sequence has it. The door is one of the ship's
-- model arguments (GT.animation_arguments.elevators_doors = {47, 48, 53, 54}, the same on every Nimitz
-- class ship of the module; 0 shut, 1 open), and while the platform is on its way down DCS's sequence
-- leaves it alone: so the hook moves it itself, every frame, at DCS's own door speed (open in 6 s),
-- through the ship's own list of model arguments (native.shiparg). When the platform is down DCS finds
-- the door open already and goes on to the lower fence. Going up is left as DCS has it (door shut first).
-- What is drawn on this PC only: another player's PC opens the door when its own copy of this runs.
--   Going UP (2026-11-15: "the doors don't need to close before the elevator can ascend"): DCS's own
--   sequence for "raise" is lower fence up, door SHUT, platform up, deck-edge fence down. Here the door is
--   held open (written back to open every frame: DCS's sequence then never gets past its door step) and
--   the hook moves the platform and the deck-edge fence itself, at DCS's own speeds (platform 17 s, a fence
--   4 s), once the lower fence is up. The door then stays open until "Shut the hangar doors", which lets
--   DCS's sequence finish (door shut).
-- The elevators' model arguments, per elevator 1..4 (GT.animation_arguments of the ship's definition):
local ELEV_DOOR = { args = { 47, 48, 53, 54 }, secs = 6, plat = { 57, 58, 59, 60 }, top = { 27, 29, 31, 33 }, bottom = { 28, 30, 32, 34 }, platSecs = 17, fenceSecs = 4 }
local doorOpen = {} -- [elevator index from 0] = { arg, t = when it was last moved }: a door being opened
local elevRise = {} -- [elevator index from 0] = { t, t0, phase }: an elevator we are raising, and whose door we hold open

-- a door of ours is let go (its elevator is told to come up): what DCS did to it meanwhile, for the log
function ELEV_DOOR.letGo(idx)
  local d = doorOpen[idx]
  doorOpen[idx] = nil
  if d and d.frames then
    logLine(string.format('  elevator %d: its hangar door was ours for %d frames; DCS moved it back in %d of them%s', idx + 1, d.frames, d.back or 0,
      (d.back or 0) > 0 and string.format(', by %.3f a frame on average', d.by / d.back) or ''))
  end
end

local function tickDoors(t)
  if not (next(doorOpen) or next(elevRise)) or not native or not native.shiparg then return end
  local h = shipHandle()
  if not h then return end
  local function arg(n, v)
    local ok, r = pcall(native.shiparg, h, n, v)
    return (ok and type(r) == 'number') and r or nil
  end
  -- THE DOOR OF AN ELEVATOR THAT IS KEPT DOWN: opened on the hook's own count (d.pos: 0 shut .. 1 open, 6 s for the
  -- whole of it, on the clock the elevator was sent down on) and written every frame in which the model has it
  -- anywhere else, for as long as the elevator is kept down. (The user's run of 2026-11-18, 22:23: "They mostly stay
  -- closed the entire time, only jittering open slightly over and over, but never fully opening": the log has the door
  -- open 6 s after the FIRST lowering of each elevator and never again: until then each frame added its share to
  -- what the model had, and from the second lowering on DCS put the door back every frame, so it never got anywhere.
  -- What DCS does to it is counted and said when the door is let go: d.back frames, d.by in all.)
  for idx, d in pairs(doorOpen) do
    local v = arg(d.arg)
    local tt = t
    if d.clock then
      local okm, c = pcall(d.clock)
      tt = (okm and tonumber(c)) or d.t
    end
    if not v then
      doorOpen[idx] = nil
      logLine(string.format('  elevator %d: the hangar door (model argument %d) cannot be read: left to DCS', idx + 1, d.arg))
    else
      d.pos = d.pos or v
      d.frames = (d.frames or 0) + 1
      if d.wrote and v < d.wrote - 0.0005 then d.back, d.by = (d.back or 0) + 1, (d.by or 0) + (d.wrote - v) end
      if d.pos < 1 then d.pos = math.min(1, math.max(d.pos, v) + math.max(0, tt - d.t) / ELEV_DOOR.secs) end
      d.t = tt
      if v < d.pos - 0.0005 then
        arg(d.arg, d.pos)
        d.wrote = d.pos
      else
        d.wrote = nil
      end
      if d.pos >= 1 and not d.said then
        d.said = true
        logLine(string.format('  elevator %d: the hangar door is open (%.0f s after the elevator was told to go down)%s', idx + 1, tt - d.t0,
          (d.back or 0) > 0 and string.format('; DCS moved it back in %d of %d frames meanwhile, by %.3f a frame on average', d.back, d.frames, d.by / d.back) or ''))
      end
    end
  end
  for idx, r in pairs(elevRise) do
    local t = t
    if r.model then
      -- (the mission's clock; r.clock: the tow's (Tow.now, which stands under active pause too: the demo's elevators))
      local okm, v = pcall(function() return r.clock and r.clock() or DCS.getModelTime() end)
      t = (okm and tonumber(v)) or r.t
    end
    local dt = math.max(0, t - r.t)
    r.t = t
    local i = idx + 1
    local door, bottom, plat, top = arg(ELEV_DOOR.args[i]), arg(ELEV_DOOR.bottom[i]), arg(ELEV_DOOR.plat[i]), arg(ELEV_DOOR.top[i])
    if not (door and bottom and plat and top) then
      elevRise[idx] = nil
      logLine(string.format('  elevator %d: its model arguments cannot be read: the raising is left to DCS', i))
    else
      -- (THE DOOR IS NO LONGER HELD OPEN (the user, 2026-11-18, after the run: "Hangar doors remain open after all aircraft
      -- have been spotted. Some also seem to jitter constantly as if DCS's default behaviour is trying to override them
      -- being open": it was: DCS's own raise shuts the door a little every frame, and this wrote it open again every
      -- frame, for as long as the platform stayed up). DCS shuts it (6 s) WHILE the platform is raised here: the rise
      -- does not wait for it, which is what was asked for on 2026-11-15, and nothing fights over the door.)
      -- (EACH PART ON THE HOOK'S OWN COUNT (r.at: where the hook has it), and written only where the model is behind that:
      -- now that DCS's own raise is no longer stopped at its door, it raises the platform too, and each frame's share
      -- was added to what DCS had already done: the user's run of 2026-11-18, 22:23: "at the flight deck after 10 s"
      -- where the platform alone takes 17)
      if r.phase ~= 'up' and dt > 0 then
        r.at = r.at or {}
        if bottom < 0.999 then
          r.at.b = math.min(1, math.max(r.at.b or bottom, bottom) + dt / ELEV_DOOR.fenceSecs)
          if bottom < r.at.b then arg(ELEV_DOOR.bottom[i], r.at.b) end
        elseif plat > 0.001 then
          r.at.p = math.max(0, (r.at.p or plat) - dt / ELEV_DOOR.platSecs)
          if plat > r.at.p then arg(ELEV_DOOR.plat[i], r.at.p) end
        elseif top > 0.001 then
          r.at.t = math.max(0, (r.at.t or top) - dt / ELEV_DOOR.fenceSecs)
          if top > r.at.t then arg(ELEV_DOOR.top[i], r.at.t) end
        else
          r.phase = 'up'
          logLine(string.format('  elevator %d: at the flight deck after %.0f s (its hangar door %s)', i, t - r.t0, door < 0.01 and 'shut' or string.format('%.0f %% open', door * 100)))
        end
      end
    end
  end
end

-- Nobody of ours rides an elevator down (2026-11-15: our people stay at deck height, so they hung in the
-- air over a lowered platform). Anyone of ours standing on the platform is walked off it, inboard, and
-- the elevator is lowered when the last of them is clear (or after `wait` seconds whatever). The
-- platforms, in ship coordinates { x from, x to, z from, z to }: from the deck outline and the spots
-- drawn on them (about 27 m along the deck edge, 16 m deep), with a margin.
local ELEV_BOX = { { 15.5, 42.5, 20, 40 }, { -31.5, -4.5, 20, 40 }, { -111.5, -83.8, 20, 40 }, { -117.5, -90, -40, -20 } }
local ELEV_CLEAR = { inboard = 15, step = 1.5, wait = 40 }
local elevWait = {} -- [elevator 1..4] = { t0, people = { { h, name } } }: lowered when they are off it
function commands.elevator(which, cmd, cleared)
  withCrews(function(t)
    if not native.elevator then return say('this needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
    if which == 'report' then
      local parts = {}
      for i = 0, 3 do
        local ok, st, e = pcall(native.elevator, t.h, i)
        parts[#parts + 1] = string.format('elevator %d: %s', i + 1, (ok and st ~= nil) and (ELEV_STATE[st] or tostring(st)) or ('could not be read: ' .. tostring(ok and e or st)))
      end
      logLine('command elevator report: ' .. table.concat(parts, '; '))
      return say(table.concat(parts, '; ') .. '.')
    end
    if which == 'shut' then
      -- the doors we hold open are let go: DCS's own "raise" sequence shuts them
      local n = 0
      for idx in pairs(elevRise) do
        n = n + 1
        elevRise[idx] = nil
        pcall(native.elevator, t.h, idx, ELEV_CMD.up)
      end
      logLine(string.format('command elevator shut: %d hangar door(s) let go', n))
      return say(n > 0 and string.format('%d hangar door(s) let go: DCS shuts them.', n) or 'no hangar door is being held open by us.')
    end
    local idx, c = tonumber(which), ELEV_CMD[cmd or '']
    if not (idx and idx >= 1 and idx <= 4 and c) then return say('unknown elevator command') end
    if cmd == 'up' then elevWait[idx] = nil end
    if cmd == 'down' and not cleared then
      local ctx = getCtx()
      local r = ctx and doScan(ctx, 'for the elevator', false)
      local on = {}
      for _, q in ipairs(r and r.mine or {}) do
        if kind(q) == 'ours' and q.x and q.z and inBox(ELEV_BOX[idx], q.x, q.z) then on[#on + 1] = q end
      end
      if #on > 0 then
        local side, names, people = idx == 4 and -1 or 1, {}, {}
        for k, q in ipairs(on) do
          local zTo = side * (ELEV_CLEAR.inboard - ELEV_CLEAR.step * (k - 1))
          holding[q.h] = nil
          walkOrder(q.h, q.x, zTo, 0, side, ctx.s, q.name)
          names[k], people[k] = tostring(q.name), { h = q.h, name = tostring(q.name) }
          logLine(string.format('  elevator %d: %s stands on it (%.1f fwd %.1f stbd): walked off to %.1f fwd %.1f stbd', idx, tostring(q.name), q.x, q.z, q.x, zTo))
        end
        elevWait[idx] = { t0 = now(), people = people }
        return say(string.format('elevator %d: %s of ours on it (%s): walking off first. It goes down when they are clear.', idx, #on == 1 and 'one' or tostring(#on), table.concat(names, ', ')))
      end
    end
    local ok, st, e = pcall(native.elevator, t.h, idx - 1, c)
    if not ok or st == nil then return say(string.format('elevator %d: the command failed: %s', idx, tostring(ok and e or st))) end
    elevKeep[idx - 1] = cmd == 'down' and { cmd = c, n = 0 } or nil
    ELEV_DOOR.letGo(idx - 1)
    doorOpen[idx - 1] = (cmd == 'down' and native.shiparg) and { arg = ELEV_DOOR.args[idx], t = now(), t0 = now() } or nil
    elevRise[idx - 1] = (cmd == 'up' and native.shiparg) and { t = now(), t0 = now() } or nil
    logLine(string.format('command elevator: elevator %d <- command %d (%s); state now: %s%s', idx, c, cmd, ELEV_STATE[st] or tostring(st),
      doorOpen[idx - 1] and string.format('; its hangar door (model argument %d) opens from now', ELEV_DOOR.args[idx]) or ''))
    say(cmd == 'down' and string.format('elevator %d told to go DOWN, and kept down; the hangar door behind it starts to open now. Does it stay down?', idx)
      or string.format('elevator %d told to come UP%s.', idx, elevRise[idx - 1] and ': the platform is raised here; DCS shuts its hangar door meanwhile' or ''))
  end)
end

local elevWaitT = 0
local function tickElevWait(t)
  if t < elevWaitT or not native then return end
  elevWaitT = t + 0.25
  for idx, w in pairs(elevWait) do
    local left = 0
    for _, q in ipairs(w.people) do
      local ok, st, x, _, z = pcall(native.state, q.h, false)
      if ok and st ~= nil and x and z and inBox(ELEV_BOX[idx], x, z) then left = left + 1 end
    end
    if left == 0 or t - w.t0 > ELEV_CLEAR.wait then
      elevWait[idx] = nil
      logLine(string.format('  elevator %d: %s after %.0f s: lowered now', idx, left == 0 and 'everyone of ours is off it' or (left .. ' of ours still on it'), t - w.t0))
      commands.elevator(idx, 'down', true)
    end
  end
end

-- the platforms nobody may walk across now: an elevator we hold down, one waiting to go down (its people walking off),
-- one on its way up. (z: the starboard ones' inboard side is their low-z side, elevator 4's its high-z side)
Walk.blocks = function()
  local out = {}
  for idx = 1, 4 do
    if elevKeep[idx - 1] or elevWait[idx] or elevRise[idx - 1] then
      local b = ELEV_BOX[idx]
      out[#out + 1] = { b[1], b[2], b[3], b[4], zin = idx == 4 and (b[4] + Walk.round) or (b[3] - Walk.round), idx = idx }
    end
  end
  return out
end

-- ---------------------------------------------------------------- the plane captain
-- One of ours as the jet's plane captain, start to taxi (a first version; every step is a menu item,
-- standing in for what PriFly and the jet itself will trigger):
--   come     he walks out to a point 11 m ahead of the nose and 3.5 m to the pilot's left (the right, or
--            straight ahead, if there is no deck there), faces the jet and, once he STANDS there, signals
--            "hold brakes"
--   cat      "My catapult: N": the catapult this jet launches from (PriFly's launch plan will say)
--   start    the engine signals: "run up engine" held 6 s and a thumbs-up, for the pilot's RIGHT engine
--            then the left (the animations are named for the signaller's own side, as the turn signals
--            are: "_l" is the pilot's right; 2026-11-15, the first build had them the other way round).
--            With a catapult set, the directors walk out to their stations along the route as the first
--            engine signal is given, and wait there.
--   release  (PriFly's release) "release brakes" (no "unfold wings": that is the catapult's shooter's,
--            on the line-up); then, with a catapult set, he passes control to the first director, who
--            takes the jet; without one he salutes. Then he walks back to where he stood.
--   home     he walks back at once
-- The signals are the deck crew's own animations (sign_setbrakes, sign_runupengine_r / _l, sign_ok_r / _l,
-- sign_releasebrakes, sign_salut); a one-shot's length is the animation's own.
local CAPTAIN = { ahead = 11, side = 3.5, runUp = 6 }

local function captainPlay(c, name, mode)
  local full = name
  if nightOn[c.h] and DUR['night_' .. name] then full = 'night_' .. name end -- (not every signal has a night version)
  holding[c.h] = nil
  local ok, res, e = pcall(native.play, c.h, full, mode)
  logLine(string.format('  captain: %s plays "%s" (%s)%s', c.name, full, mode == 2 and 'held' or 'once', (ok and res) and '' or (' FAILED: ' .. tostring(ok and e or res))))
  return DUR[full] or 3
end

-- the steps of a sequence: { animation, held seconds or false for a one-shot }
local function captainRun(c, steps, t, after)
  c.steps, c.step, c.stepUntil, c.after = steps, 0, t, after
end

function commands.captain(what, arg)
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local t = now()
  if what == 'come' then
    if captain then return say(string.format('%s is your plane captain already (F10 > Plane captain > Send him home ends it)', captain.name)) end
    if demo or sigtest or marsh then return say('something of ours is running already: stop it first (F10 > Stop the demo / signal test / marshalling)') end
    local r = doScan(ctx, 'for the plane captain', false)
    local best, bd, bs
    for _, p in ipairs(r and r.mine or {}) do
      local d = (kind(p) == 'ours' and role(p) ~= 'driver' and role(p) ~= 'rider') and distTo(p, ctx.jx, ctx.jz)
      if d then
        local sc = role(p) == 'captain' and d - 1e6 or d -- the brown shirt, wherever he stands; else the nearest of ours
        if not bs or sc < bs then best, bd, bs = p, d, sc end
      end
    end
    if not best then return say('a plane captain needs people of ours (catcc-...) on your ship: none found') end
    loadAnimInfo(best)
    -- the pilot's left of the nose is (fz, -fx)
    local px, pz
    for _, side in ipairs({ CAPTAIN.side, -CAPTAIN.side, 0 }) do
      local qx, qz = ctx.jx + CAPTAIN.ahead * ctx.fx + side * ctx.fz, ctx.jz + CAPTAIN.ahead * ctx.fz - side * ctx.fx
      if standable(qx, qz) then
        px, pz = qx, qz
        break
      end
    end
    if not px then return say('there is no deck 11 m ahead of your nose for a plane captain to stand on') end
    local ok, res, e = walkOrder(best.h, px, pz, -ctx.fx, -ctx.fz, ctx.s, best.name)
    if not ok or not res then return say(string.format('plane captain: the walk order for %s failed: %s', tostring(best.name), tostring(ok and e or res))) end
    captain = { h = best.h, name = tostring(best.name), home = { x = best.x, z = best.z }, P = { x = px, z = pz }, phase = 'walk', t0 = t }
    logLine(string.format('command captain come: %s from %.1f fwd %.1f stbd to %.1f fwd %.1f stbd (the jet at %.1f fwd %.1f stbd, nose %.2f %.2f): %s', captain.name, best.x, best.z, px, pz,
      ctx.jx, ctx.jz, ctx.fx, ctx.fz, tostring(e)))
    return say(string.format('%s is your plane captain: walking out to you (%.0f m). When he is in place he signals "hold brakes".', captain.name, bd))
  end
  if what == 'cat' then
    local cat = tonumber(arg)
    if not (cat and CAT_BOX[cat]) then return say('unknown catapult ' .. tostring(arg)) end
    launchCat = cat
    logLine(string.format('command captain cat: this jet launches from catapult %d', cat))
    return say(string.format('your catapult is %d: the directors walk out to the route there when the engine start signals begin, and take you when the plane captain releases you.', cat))
  end
  local c = captain
  if not c then return say('you have no plane captain yet (F10 > Plane captain > Come to my jet)') end
  if what == 'home' then
    captain = nil
    toIdle(c.h)
    walkOrder(c.h, c.home.x, c.home.z, 0, 0, ctx.s, c.name)
    return say(c.name .. ' walks back to where he stood.')
  end
  if c.phase == 'walk' then return say(c.name .. ' is still on his way to you') end
  if what == 'start' then
    captainRun(c, { { 'sign_runupengine_l', CAPTAIN.runUp }, { 'sign_ok_l', false }, { 'sign_runupengine_r', CAPTAIN.runUp }, { 'sign_ok_r', false } }, t)
    say(c.name .. ': engine start signals (your right engine, thumbs-up, your left engine, thumbs-up).')
    -- the directors set out now, so that they are in place when the jet is ready
    if launchCat and not (demo or sigtest or marsh) then commands.marshal(tostring(launchCat), nil, true) end
    return
  end
  if what == 'release' then
    local cat = tonumber(arg) or launchCat
    if cat and not (marsh and marsh.hold and marsh.cat == cat) and (demo or sigtest or marsh) then
      return say('something of ours is running already: stop it first (F10 > Stop the demo / signal test / marshalling)')
    end
    captainRun(c, { { 'sign_releasebrakes', false } }, t, cat and { cat = cat } or { salute = true })
    return say(string.format('%s: released. Release brakes%s.', c.name, cat and string.format(', then our directors take you to catapult %d', cat) or ', then his salute'))
  end
  say('unknown plane captain command ' .. tostring(what))
end

local function tickCaptain(t)
  local c = captain
  if not c or not native then return end
  if c.phase == 'walk' then
    local a = inPlace(c, c.t0, t)
    if a == nil then
      captain = nil
      return say('plane captain: lost sight of ' .. c.name)
    end
    if not a then return end
    c.phase = 'there'
    logLine(string.format('  captain: %s is in place (%.1f m off his point) after %.0f s', c.name, c.away or 0, t - c.t0))
    captainRun(c, { { 'sign_setbrakes', false } }, t)
    say(string.format('%s is in place: hold brakes. F10 > Plane captain: engine start signals, then release.', c.name))
  end
  if not c.steps or t < c.stepUntil then return end
  c.step = c.step + 1
  local s = c.steps[c.step]
  if s then
    local len = captainPlay(c, s[1], s[2] and 2 or 1)
    c.stepUntil = t + (s[2] or len)
    return
  end
  -- the sequence is over
  local after = c.after
  c.steps, c.after = nil, nil
  local ctx = getCtx()
  toIdle(c.h)
  if c.leaving then -- the pass or the salute is done: home
    captain = nil
    if ctx then walkOrder(c.h, c.home.x, c.home.z, 0, 0, ctx.s, c.name) end
    logLine(string.format('  captain: %s walks back to where he stood', c.name))
    return
  end
  if not after then return end
  if after.cat then
    -- the directors: waiting at their stations since the engine start, or sent out now
    if not marsh then commands.marshal(tostring(after.cat)) end
    if marsh and marsh.cat == after.cat then marsh.hold = nil end
    if marsh and marsh.team[1] then
      sendSignal(c.h, 'pass', { target = marsh.team[1].P }, ctx)
      logLine(string.format('  captain: %s passes control to %s', c.name, tostring(marsh.team[1].name)))
    end
  else
    captainPlay(c, 'sign_salut', 1)
  end
  c.steps, c.step, c.stepUntil, c.leaving = {}, 0, t + 3, true -- three seconds for the pass / the salute, then home
end

-- ---------------------------------------------------------------- the cockpit camera follows the director
-- While the jet is being marshalled the cockpit view turns by itself to whoever is signalling: the
-- director who has the jet (or the next one, standing at his station, between a pass and a take), the
-- plane captain while he stands at the nose, and after our last director has handed over, the catapult's
-- own director for the hook-up. On by itself; "Our crew > Camera follows the director: on / off" switches it.
--   How: the export interface's LoSetCommand with view command 2007 (in DCS's own list: camera rotate
--   left / right) and the camera's own direction read back every time (LoGetCameraPosition). What the
--   command's value MEANS is not written down anywhere we can read, and the first build guessed wrong: it
--   took the value for an angle to go to and sent it twenty times a second; on 2026-11-15 the view swung
--   round to its stop behind the jet (172 degrees) and stayed there. The value is an amount to turn BY
--   (as mouse movement is). So now nothing is assumed:
--     1. a first, very small value is sent once and the camera's turn measured (too small to see: sent
--        again four times larger, up to 0.5; no answer at all: said, and the camera is left alone);
--     2. then a zero is sent, and then the same small value again: a camera that stays where it is on
--        the zero and turns as much again on the repeat takes the value as a turn (degrees per unit
--        measured); one that goes to straight ahead on the zero and back to the same place on the repeat
--        takes it as an angle;
--     3. from then on the camera is steered by the ERROR: every tick, the angle between where the camera
--        looks and where the signaller is, and a value that takes out a third of it; within 0.6 degrees
--        nothing is sent. The degrees per unit are kept up to date from every turn the camera makes.
--   Only left / right is driven: up / down and zoom stay as the pilot has them. Only in the cockpit: the
--   camera has to be within 9 m of the jet (an outside view is left alone).
--   Smoothness (2026-11-15: the first working build stepped the view twenty times a second, a third of
--   the error at a time, stop and go at 0.6 degrees: correct, but a judder that was hard to look at in
--   turns). Now: every frame; the angle to the signaller is worked out in SHIP coordinates only (the
--   pilot's seat from the jet's place on the ship, the man's place on the ship: no mixing of two readings
--   of where the ship is in the world, which at 25 knots are a frame apart); the camera closes on him with
--   a time constant (0.2 s) and at no more than 80 degrees a second; nothing is sent within 0.05 degrees.
local CAM = { cmd = 2007, tick = 0.05, maxAz = 150, near = 9, seat = 3.5, probe = 0.002, probeMax = 0.5, seen = 0.15, tau = 0.2, rate = 80, dead = 0.05, smooth = 0.25 }
local camOn = true -- (kept over missions: the pilot's choice)
-- mode: nil not known yet, 'turn' (the value turns the camera: g degrees per unit) or 'angle' (the value is
-- where it looks: k degrees per unit); both kept for the session once found
local cam = { mode = nil, g = nil, k = nil, id = nil, nextT = 0, who = nil, logT = 0, dead = false, fed = 0, last = 0 }

local function camSend(v)
  if Export and Export.LoSetCommand then
    pcall(Export.LoSetCommand, CAM.cmd, v)
  else
    pcall(net.dostring_in, 'export', string.format('LoSetCommand(%d, %.5f)', CAM.cmd, v))
  end
end

-- who the camera should be on now: his handle and name, or nil
local function camTarget(t, ctx)
  local m = marsh
  if m and m.phase ~= 'done' then
    if m.ctl then return m.ctl.h, m.ctl.name end
    local nxt = m.team[m.k]
    if nxt and nxt.there and not m.hold then return nxt.h, nxt.name end
  end
  if demo and demo.ctl then return demo.ctl.h, demo.ctl.name end
  local c = captain
  if c and c.phase == 'there' and not c.leaving then return c.h, c.name end
  if camAfter then
    if t > camAfter.untilT or (ctx and ctx.jy > camAfter.jy + 3) then
      camAfter = nil
    else
      return camAfter.h, camAfter.name
    end
  end
end

local function tickCamera(t)
  if not camOn or cam.dead or not native then return end
  if not (marsh or captain or camAfter or demo) then
    cam.who = nil
    return
  end
  local ctx = getCtx()
  if not ctx then return end
  local h, name = camTarget(t, ctx)
  if not h then
    cam.who = nil
    return
  end
  if not (Export and Export.LoGetCameraPosition) then
    cam.dead = true
    return logLine('camera: the export interface has no LoGetCameraPosition here: the camera cannot be followed')
  end
  local okc, cp = pcall(Export.LoGetCameraPosition)
  local oks, st, x, y, z = pcall(native.state, h, false)
  if not (okc and type(cp) == 'table' and cp.p and cp.x and oks and st ~= nil and x and z) then return end
  local s = ctx.s
  local function world(f, u, r) return s[10] + f * s[1] + u * s[4] + r * s[7], s[11] + f * s[2] + u * s[5] + r * s[8], s[12] + f * s[3] + u * s[6] + r * s[9] end
  local jx, jy, jz = world(ctx.jx, ctx.jy, ctx.jz)
  if math.sqrt((cp.p.x - jx) ^ 2 + (cp.p.y - jy) ^ 2 + (cp.p.z - jz) ^ 2) > CAM.near then -- not in the cockpit: left alone
    cam.who = nil
    return
  end
  -- where he is, seen from the pilot's seat: degrees off the nose, positive to the right (ship coordinates)
  local ex, ez = ctx.jx + CAM.seat * ctx.fx, ctx.jz + CAM.seat * ctx.fz
  local want = math.deg(atan2(ctx.fx * (z - ez) - ctx.fz * (x - ex), ctx.fx * (x - ex) + ctx.fz * (z - ez)))
  -- where the camera looks: its own direction against the nose's (directions only)
  local nx, nz = ctx.fx * s[1] + ctx.fz * s[7], ctx.fx * s[3] + ctx.fz * s[9]
  local have = wrap180(math.deg(atan2(cp.x.z, cp.x.x)) - math.deg(atan2(nz, nx)))
  want = math.max(-CAM.maxAz, math.min(CAM.maxAz, want))
  if cam.who ~= h then
    cam.who, cam.fed = h, 0
    logLine(string.format('camera: on %s, %.0f deg off the nose; the camera looks %.0f deg off it; %s', tostring(name), want, have,
      cam.mode == 'turn' and string.format('the view command turns it %.0f deg a unit', cam.g) or (cam.mode == 'angle' and string.format('the view command is an angle, %.0f deg a unit', cam.k)
        or 'what the view command does is found out first')))
  end
  local err = wrap180(want - have)
  -- 1 and 2: what the command does (once a session)
  if not cam.mode then
    local id = cam.id
    if not id then
      if math.abs(err) < 2 then return end -- (looking at him already: nothing to find out with)
      id = { p = CAM.probe * (err < 0 and -1 or 1), step = 1 }
      cam.id = id
    end
    if id.step == 1 then
      id.have0, id.t, id.step = have, t, 2
      return camSend(id.p)
    end
    if t - id.t < 2 * CAM.tick then return end
    if id.step == 2 then
      id.s1 = wrap180(have - id.have0)
      if math.abs(id.s1) < CAM.seen then
        -- (no turn to see: the other way first, in case the camera stands against its stop on this side; then four times larger)
        if not id.flipped then
          id.p, id.flipped, id.step = -id.p, true, 1
          return
        end
        id.flipped = false
        if math.abs(id.p) * 4 > CAM.probeMax then
          cam.dead, cam.id = true, nil
          logLine(string.format('camera: the view did not answer command %d (values up to %.3f turned it %.2f deg): following is off', CAM.cmd, math.abs(id.p), id.s1))
          return say('the cockpit camera did not answer the view command: it is not being turned for you (see the log).')
        end
        id.p, id.step = -id.p * 4, 1
        return
      end
      id.have1, id.t, id.step = have, t, 3
      return camSend(0)
    end
    if id.step == 3 then
      id.have2, id.t, id.step = have, t, 4
      return camSend(id.p)
    end
    local s2, s3 = wrap180(id.have2 - id.have1), wrap180(have - id.have2)
    if math.abs(s2) < 0.35 * math.abs(id.s1) and math.abs(s3 - id.s1) < 0.5 * math.abs(id.s1) then
      cam.mode, cam.g = 'turn', (id.s1 + s3) / (2 * id.p)
      logLine(string.format('camera: the view command TURNS the camera: the value %.4f turned it %.2f deg, a zero left it there (%.2f), the value again turned it %.2f: %.0f deg a unit', id.p,
        id.s1, s2, s3, cam.g))
    elseif math.abs(id.have2) <= 0.05 + 0.3 * math.abs(id.have1) and math.abs(have - id.have1) <= 0.05 + 0.2 * math.abs(id.have1) and math.abs(id.have1 / id.p) >= 5 then
      cam.mode, cam.k = 'angle', id.have1 / id.p
      logLine(string.format('camera: the view command is an ANGLE: the value %.4f put it %.2f deg off the nose, a zero put it at %.2f, the value again at %.2f: %.0f deg a unit', id.p,
        id.have1, id.have2, have, cam.k))
    else
      cam.dead = true
      logLine(string.format('camera: what command %d does could not be made out (the value %.4f turned it %.2f deg, a zero then %.2f, the value again %.2f): following is off', CAM.cmd, id.p,
        id.s1, s2, s3))
      say('the cockpit camera could not be steered (see the log): it is left alone.')
    end
    cam.id, cam.last = nil, 0
    return
  end
  -- 3: steering
  local v
  local dt = math.min(0.1, math.max(0.001, t - (cam.sentT or (t - CAM.tick))))
  if cam.mode == 'turn' then
    if math.abs(err) < CAM.dead then
      v = 0
      if cam.last ~= 0 then camSend(0) end -- (once, when he comes into view: a value that kept turning the camera would stop here)
    else
      local step = err * (1 - math.exp(-dt / CAM.tau))
      local cap = CAM.rate * dt
      v = math.max(-cap, math.min(cap, step)) / cam.g
      camSend(v)
    end
  else
    local goal = math.max(-1, math.min(1, want / cam.k))
    v = cam.last + (goal - cam.last) * math.min(1, dt / CAM.smooth)
    if math.abs(err) >= CAM.dead or math.abs(goal - v) > 1e-4 then camSend(v) end
  end
  cam.last, cam.sentT = v, t
  cam.fed = cam.fed + 1
  if t - cam.logT >= 5 then
    cam.logT = t
    logLine(string.format('  camera: %s %.0f deg off the nose, the camera at %.0f, value %.5f, %.0f deg a unit (%s)', tostring(name), want, have, v, cam.g or cam.k, cam.mode))
  end
end

function commands.camfollow()
  camOn = not camOn
  cam.dead, cam.who, cam.id = false, nil, nil
  if not camOn and cam.mode == 'turn' and cam.last ~= 0 then camSend(0) end
  cam.last = 0
  logLine('command camfollow: ' .. (camOn and 'on' or 'off'))
  say(camOn and 'the cockpit camera follows whoever is signalling to you (left / right only), whenever you are being marshalled.'
    or 'the cockpit camera is left alone.')
end

-- ---------------------------------------------------------------- put square on a parking spot
-- After the last director has stopped the jet on a parking spot (or from the menu, for the spot nearest
-- to the jet), the jet is put exactly on the spot, facing the way a jet spawned there faces: the spot's
-- place and heading from the routes file, at the height the jet stands at now. DCS's own call does it:
-- the carrier's ATC has a teleport for an aircraft (woATC::teleport_aircraft, given the new position and
-- axes in world coordinates and the aircraft's object id). EXPERIMENTAL: what that call does to a player's
-- jet is what the first run shows; where the jet is two seconds later is logged and said.
--   Run of 2026-11-15: the ATC's teleport returned and the jet had not moved. So when that leaves the jet
--   where it is, a second call is tried: the aircraft's own MovingObject::ForcePosition (WorldGeneral.dll's
--   virtual, called through the aircraft's own table: native.forcepos), with the same position; and the
--   result of that is said too.
local TELE = { still = 2, moved = 0.15, give = 40, maxFar = 30 }
local teleDone -- { x, z, fx, fz, name, at, how, id, pose }: a move just made, to be checked

local function teleportTo(ctx, sp)
  if not native.teleport then return nil, 'this needs the newer native module: run crew-test\\install.ps1 with DCS closed' end
  local h = shipHandle()
  if not h then -- (nobody listed yet this mission: look now)
    doScan(ctx, 'for the teleport', false)
    h = shipHandle()
  end
  if not h then return nil, 'nobody found on your ship to ask through' end
  local id = (Export and Export.LoGetPlayerPlaneId) and select(2, pcall(Export.LoGetPlayerPlaneId)) or nil
  if type(id) ~= 'number' then return nil, "your aircraft's object id could not be read (no LoGetPlayerPlaneId)" end
  local s = ctx.s
  local m = math.sqrt(sp.fx * sp.fx + sp.fz * sp.fz)
  local fx, fz = sp.fx / m, sp.fz / m
  -- the jet's axes in the world: nose = fx forward + fz starboard of the ship; up = the ship's; right = nose x up
  local ax = { fx * s[1] + fz * s[7], fx * s[2] + fz * s[8], fx * s[3] + fz * s[9] }
  local ay = { s[4], s[5], s[6] }
  local az = { fx * s[7] - fz * s[1], fx * s[8] - fz * s[2], fx * s[9] - fz * s[3] }
  local px, py, pz = s[10] + sp.x * s[1] + ctx.jy * s[4] + sp.z * s[7], s[11] + sp.x * s[2] + ctx.jy * s[5] + sp.z * s[8], s[12] + sp.x * s[3] + ctx.jy * s[6] + sp.z * s[9]
  logLine(string.format('teleport: object %d to %s: %.2f fwd %.2f stbd on the ship, nose %.2f %.2f (the jet is at %.2f fwd %.2f stbd, nose %.2f %.2f); world %.1f, %.1f, %.1f', id, sp.name,
    sp.x, sp.z, fx, fz, ctx.jx, ctx.jz, ctx.fx, ctx.fz, px, py, pz))
  local pose = { ax[1], ax[2], ax[3], ay[1], ay[2], ay[3], az[1], az[2], az[3], px, py, pz }
  local ok, res, e = pcall(native.teleport, h, id, unpack(pose))
  if not ok or not res then return nil, tostring(ok and e or res) end
  teleDone = { x = sp.x, z = sp.z, fx = fx, fz = fz, name = sp.name, at = now(), how = "the ATC's teleport", id = id, sp = sp }
  return true
end

local function tickTeleport(t)
  local d = teleDone
  if d and t - d.at >= 2 then
    teleDone = nil
    local ctx = getCtx()
    if not ctx then
      logLine('teleport: two seconds on the jet cannot be found on the carrier any more')
      return say('teleport: two seconds on, your jet cannot be found on the carrier (see the log).')
    end
    local off = math.sqrt((ctx.jx - d.x) ^ 2 + (ctx.jz - d.z) ^ 2)
    local turn = math.abs(math.deg(atan2(d.fx * ctx.fz - d.fz * ctx.fx, d.fx * ctx.fx + d.fz * ctx.fz)))
    logLine(string.format('teleport (%s): two seconds on the jet is at %.2f fwd %.2f stbd, nose %.2f %.2f: %.1f m from the spot, %.0f deg off its heading', d.how, ctx.jx, ctx.jz, ctx.fx, ctx.fz, off, turn))
    if not (off < 1 and turn < 5) and not d.second and native.forcepos then
      -- the second way: the aircraft's own ForcePosition, to the same place (worked out afresh: the ship has moved on)
      local s, sp = ctx.s, d.sp
      local fx, fz = d.fx, d.fz
      local ok, res, e = pcall(native.forcepos, d.id, fx * s[1] + fz * s[7], fx * s[2] + fz * s[8], fx * s[3] + fz * s[9], s[4], s[5], s[6],
        fx * s[7] - fz * s[1], fx * s[8] - fz * s[2], fx * s[9] - fz * s[3], s[10] + sp.x * s[1] + ctx.jy * s[4] + sp.z * s[7], s[11] + sp.x * s[2] + ctx.jy * s[5] + sp.z * s[8],
        s[12] + sp.x * s[3] + ctx.jy * s[6] + sp.z * s[9])
      logLine(string.format("teleport: the ATC's teleport left the jet where it was: the aircraft's own ForcePosition tried: %s", (ok and res) and ('called (class ' .. tostring(e) .. ')') or
        ('FAILED: ' .. tostring(ok and e or res))))
      if ok and res then
        teleDone = { x = d.x, z = d.z, fx = d.fx, fz = d.fz, name = d.name, at = t, how = "the aircraft's own ForcePosition", id = d.id, sp = sp, second = true }
        return
      end
    end
    return say(string.format('teleport to %s (%s): you are now %.1f m from the spot and %.0f degrees off its heading%s.', d.name, d.how, off, turn,
      (off < 1 and turn < 5) and ': on it' or ' (it did not put you there)'))
  end
  local w = teleWait
  if not w then return end
  local ctx = getCtx()
  if not ctx then return end
  if t - w.at > TELE.give then
    teleWait = nil
    return logLine('teleport: the jet did not stand still within 40 s of the stop signal: not put on the spot')
  end
  if not w.px or math.sqrt((ctx.jx - w.px) ^ 2 + (ctx.jz - w.pz) ^ 2) > TELE.moved then
    w.px, w.pz, w.since = ctx.jx, ctx.jz, t
    return
  end
  if t - w.since < TELE.still then return end
  teleWait = nil
  local ok, why = teleportTo(ctx, w)
  if not ok then
    logLine('teleport: ' .. tostring(why))
    say('you could not be put square on the spot: ' .. tostring(why))
  end
end

-- from the menu: onto the deck spot nearest to the jet
function commands.teleport()
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  local ctx, err = getCtx()
  if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  local routes = loadRoutes()
  if not routes then return say('the taxi routes are missing (Scripts\\CATCC\\crewtest_routes.lua): run crew-test\\install.ps1 with DCS closed') end
  local best, bd
  for _, st in ipairs(routes) do
    if st.fx and st.x and st.z then
      local d = math.sqrt((st.x - ctx.jx) ^ 2 + (st.z - ctx.jz) ^ 2)
      if not bd or d < bd then best, bd = st, d end
    end
  end
  if not best then return say('the routes file has no spot headings (an older file): run crew-test\\install.ps1 with DCS closed') end
  if bd > TELE.maxFar then return say(string.format('the nearest deck spot (%s) is %.0f m away: taxi to within %d m of a spot first', tostring(best.name), bd, TELE.maxFar)) end
  local ok, why = teleportTo(ctx, { x = best.x, z = best.z, fx = best.fx, fz = best.fz, name = tostring(best.name) })
  if not ok then return say('teleport: ' .. tostring(why)) end
  say(string.format('teleport: you are being put on %s (spot %d, %.1f m away), facing the way a jet spawned there faces.', tostring(best.name), best.spot, bd))
end

-- The target walks to the point on the far side of the jet from where he stands: the straight line goes
-- through the jet. Watched for 60 s; the closing message says how near he came to the jet's centre.
-- ---------------------------------------------------------------- towing, and the axle finder (crewtest-15 to -17)
-- A tow tractor with a driver and a tow bar pulls the player's jet, by itself, from the lowered elevator into
-- the hangar. What each thing is:
--   the tractor  a static object (DCS's own AS32-31A), made once a mission by the mission script
--                (CATCC_CR.statics), NOT linked to the ship (a linked static stands on the flight deck; an
--                unlinked one lies on the sea bed), and put where it belongs every frame by the native
--                module through the object's own position setter (native.staticpos). The BetteraircraftCarrier
--                mod shows its hangar tug the same way. (A static keeps its place as single-precision world
--                numbers: far from the map's origin they step by a centimetre or so, which shows as a faint
--                shimmer against the jet on a ship under way.)
--   the tow bar  a static of a type of our own (our mod's Database file: "CATCC_Towbar"), drawn with a model of
--                our own: the 15 ft ALBAR 15 (crew-test/model/towbar.py; the first build was the 9 ft bar, far too small). Its origin is the tow ring's centre
--                (on the tractor's pintle); its x axis runs along the bar to the middle between its two AXLE
--                PINS, which point inboard from its heads and go into the ends of the nose wheel's hollow
--                axle. Its two arms turn on pivots at the ring head: they open and close to fit the axle
--                (ONE model argument, TOW.bar.arg: 0 closed .. 0.5 wide open with the chain slack; 0.5 .. 1
--                closing again with the tensioning chain taut: Tow.armArg). Placed every frame rigid, pitched
--                from the ring's height to the pins'.
--   the driver   catcc-t0, one of ours, put on the tractor's seat every frame (native.place) in the pilot
--                figure's seated pose, which the deck crew can play. First run in DCS (2026-11-15): the pose
--                was played, the placing reported no error, and nobody was on the tractor: native.place went
--                through AnimatedCharacterBase::set_origin alone, which only stores a pose nothing reads
--                for a man who stands (he stayed on the flight deck). From crewtest-16 it also writes his
--                own pose on the ship (what local_position() returns). UNTRIED: that, and where the seated
--                pose's origin is on the man (F10 > Tow > Driver seat moves him 10 cm at a time).
--   the jet      moved every frame by the aircraft's own ForcePosition (native.forcepos, as the teleport).
-- The joints, as the real bar has them (the user, 2026-11-15): the ring on the tractor's pintle is free in
-- yaw; the pins in the axle make the bar rigid in yaw and roll on the aircraft and free only in pitch: the
-- bar's heading IS the nose wheel's heading (the nose wheel castors; nose wheel steering off). So the nose
-- wheel rolls along the bar: its point follows the hitch as a trailer's axle does, at the bar's length; the
-- jet follows the nose wheel with its main wheels dragged behind, and the angle between the bar and the jet's
-- nose is the nose wheel's steering angle: shown on the jet's own nose wheel (its model argument TOW.steerArg,
-- written every frame through native.objarg; UNTRIED: the argument's number, its scale, and whether the
-- aircraft's own code writes over it: the log says), and the largest angle of the tow is reported.
-- The sequence (asked for 2026-11-15):
--   arrive   the tractor drives from where it waits in the hangar with the bar on its pintle, closed, trailing
--            on the bar's own little wheels; it comes round in front of the jet and stops on the jet's nose
--            line, facing away from it, the bar trailing towards the nose
--   unhitch  the ring comes off the pintle and is set down on its foot
--   open     the bar's arms are swung wide open
--   carry    the bar is taken back to the nose gear (rolled on its wheels, as the crew would) and lifted to the
--            axle, an arm either side of the nose wheels, straight ahead of them
--   clamp    the tensioning chain is tightened: the arms close until the pins are in the axle's ends
--   lift     the ring end is lifted to the hitch's height: the bar pitches about the axle
--   backup   the tractor backs onto the ring (hooked up), a pause, and the pull: straight on to the hangar's
--            port lane and along it to the parking place, where it stops
-- "Unhook", in the order the user gave (2026-11-16): OFF THE TRACTOR (the ring lifted off the pintle and set down; the
-- tractor moves 1.2 m up to make room), OFF THE AIRCRAFT (the chain let go, the arms open and the pins out of the axle;
-- the head end set down on the bar's own wheels; the bar rolled forward clear of the nose wheels, up to the tractor; its
-- arms closed), BACK ON THE TRACTOR (the ring lifted onto the pintle), AWAY (8 m on, the bar trailing).
-- Everything is drawn on this PC only (another player's PC shows the tractor when its own copy of this runs).
-- The tractor (DCS's AS32-31A model, read: its collision shell runs from 3.01 m behind its position to 1.80 m
-- ahead, 1.01 m high): the hitch is taken at its rear end, `hitch` behind its position, `hitchUp` above the
-- floor. As in the photographs, the tractor's rear sits under the jet's radome when hooked up.
-- The jet's nose wheel axle (F/A-18C): `noseGear` ahead of the jet's own position and `axleDown` below it;
-- `gearUp` is the jet's own position above the deck it stands on. FOUND IN DCS WITH THE AXLE FINDER (the user,
-- 2026-11-15, spawn spot at 151 m forward on the flight deck): the axle's middle is 3.005 m ahead and 0.257 m
-- above the deck (the marker at 0.26 m, "down about 3 mm"); the jet's position stood 21.975 m above the ship's
-- origin there, the flight deck being 20.149 m: 1.826 m. (Before: 2.985 m from FA-18C_hornet.lua's nose gear
-- position, and 0.265 m.) `axleLen` from end to end: 0.605 m, SET BY THE USER WITH THE FINDER'S END PLATES
-- (2026-11-16: "I've updated the width. It was already pretty close"; 0.58 before, from the collision model's
-- tyres); a pin goes `pinIn` into each end. THE AXLE FINDER (F10 > Tow > Axle finder) stands a marker at these numbers
-- under the player's jet and moves it; the numbers it ends with are logged, and the tow uses them as they stand.
local TOW = {
  -- (THE USER, 2026-11-19, after the day's runs: "I'm comfortable increasing all tug speeds by 2x (including during
  -- forward turns) and 1.5x while pushing an aircraft backward and turning ... the ramp up and down to and from those
  -- top speeds (which should be gradual)": speed 1.4 -> 2.8, backSpeed 0.7 -> 1.05, fastTow 2.1 -> 4.2, fastSolo 4.2 ->
  -- 8.4, a straight push 1.05 -> 2.1 (`straight` 1.5 -> 2.0); accel 0.5 -> 0.7, brake 0.8 -> 1.1 (my numbers: with the
  -- old ones the top speeds were hardly reached). simSpeed: the pace of what is driven IN THE HEAD, as it was: its
  -- steps of a tenth of a second are then the same 14 cm, and it answers as before.)
  -- (simAccel, simBrake: with them: a plan that was only just possible (a push whose bar comes within a degree of
  -- folding) is then the plan it was: the rig: with 0.7 / 1.1 in the head the one clear way to Stbd 1 (now Fantail 4) was refused)
  speed = 2.8, simSpeed = 1.4, simAccel = 0.5, simBrake = 0.8, backSpeed = 1.05, accel = 0.7, turnR = 4.0, look = 3.0,
  -- (the pintle hook as the tractor's model has it, as32-31a.edm read 2026-11-15: 2.85 to 3.00 m behind the tractor's
  -- position, 0.22 to 0.39 m above the floor, on the centre line. Before: 3.05 / 0.45, guessed, and in DCS the ring
  -- hung above and short of the hook)
  hitch = 2.93, hitchUp = 0.30,
  -- (the tractor has the same pintle hook at its FRONT: 1.65 to 1.80 m ahead of its position, 0.22 to 0.39 m up. Not
  -- used yet: the user, 2026-11-15: "in some situations it could be good to use the forward attachment instead of the
  -- rear": pushing a jet back into a spot nose-out, say. The tractor then drives towards the jet, hitchFront ahead of
  -- its position where `hitch` is behind it)
  hitchFront = 1.73,
  -- (axleLen: the nose tyres' outer faces, FA-18C_Collision.edm's two WHEEL_F shells: each 0.173 m wide, 0.115 to
  -- 0.289 m either side of the centre line. The bar's heads go OUTSIDE the tyres, their pins inwards into the axle's
  -- ends: the pins' tips 0.25 m either side, the heads' inboard faces 0.30 m. Before: 0.46, guessed, and in DCS the
  -- heads sat inside the wheels)
  noseGear = 3.005, axleDown = 1.569, axleLen = 0.605, pinIn = 0.04,
  mainGear = 2.438, gearUp = 1.826, hangarBelow = 14,
  -- the bar: what crew-test/model/towbar.py prints for the hook (a test keeps these the same as the model)
  bar = { pivotX = 0.3333, armZ0 = 0.05458, pinU = 3.8577, pinW = 0.1042, a0 = 0.017170, thetaMax = 0.091651, wheelUp = 0.1250, ringRest = 0.1529, arg = 10 },
  carrySpeed = 0.8, step = 1.5, liftT = 2.0, -- the crew's pace
  -- the nose wheel's steering on the jet's model: argument 2 (seen to turn the wheels in DCS, 2026-11-15), the angle
  -- of a value of 1 (90 degrees: FA-18C_Collision.edm's nose gear node turns that far at +1 and -1; 75 was assumed
  -- before), and its sense (-1: + on the model is to the LEFT; the first run, with +1, turned them the wrong way)
  steerArg = 2, steerDeg = 90, steerSign = -1,
  -- the wheels' turning (Tow.wheelsShow). The tractor (as32-31a.edm): rear wheels 0.385 m in radius (the front ones
  -- 0.266: one argument turns them all at one rate, so the front ones turn too slowly for their size), wheelbase
  -- 1.685 m, the front wheels steer 31 degrees at an argument of 1. The jet: its nose wheels roll on the radius
  -- the axle finder found (0.257 m), its main wheels (0.78 m across) on 0.37 m, 3.12 m apart
  -- (FA-18C_Collision.edm: 1.55 m either side)
  tugWheelArg = 8, tugSteerArg = 9, tugPitchArg = 20, tugWheelR = 0.385, tugBase = 1.685, tugSteerDeg = 31,
  jetWheelArgs = { nose = 101, left = 103, right = 102 }, noseWheelR = 0.257, mainWheelR = 0.37, track = 3.12,
  -- the driver's seat (the tractor's model: the steering wheel is on the left, 0.40 to 0.76 m off the centre line,
  -- 0.10 to 0.35 m ahead of the tractor's position; the seat cushion behind it 0.65 m up, from 0.15 to 0.55 m behind
  -- the position; the seat back's top 0.90 m up). Where the seated pose's own origin is on the man is not known:
  -- F10 > Tow > Driver seat moves him
  seat = { fwd = -0.40, left = 0.58, up = 0.65 },
  clearBar = 1.2, -- unhooking: how far the tractor moves up, and the open bar is then rolled after it, its heads clear of the nose wheels
  ahead = 8, uTurn = 8, pause = 1.5, clearNose = 6, -- (clearNose: the U-turn's line point beyond the hook-up place, clear of the radome)
  home = { x = 36, z = -9.5, hx = -1, hz = 0 }, -- where the tractor waits: a hangar parking place (the forward one)
  spot = { x = 8.25, z = -8, fx = -1, fz = 0, name = 'the hangar, port lane (8 m forward, 8 m to port), nose aft' },
  seatAnim = 'f18_0_init',
  -- the same pose, its legs and arms keyed to this tractor's pedals and steering wheel (crew-test/DRIVER-POSE.md): in
  -- the mod only after install.ps1 -DriverPose on (Tow.sit); what it is solved for is `seat` above: change one,
  -- change POSE['seat'] in crew-test/model/driver_pose.py too (a test holds them together) and install again
  seatPose = 'catcc_drv_seat',
  -- a demo tow whose push cannot begin where its pull ended asks again this often (s), for this long (s) (Tow.tickOne)
  pushRetry = 2, pushWait = 90,
  -- ON THE FLIGHT DECK (Tow.Fd). towR: the tightest the tractor turns with a jet on the bar (its own is turnR): the
  -- nose wheel then stays within about 57 degrees of straight (bar 4.4 m behind a hitch 2.93 m behind the tractor's
  -- own point, the jet's wheelbase 5.44 m); steerMax / kinkMax: a tow whose plan turns the nose wheel, or folds the
  -- bar against the tractor, further than this is not driven. catShort: the nose wheel is left this far short of the
  -- catapult's shuttle.
  -- deckHome: where the tractor waits on the flight deck: the pocket between the island's aft end and elevator 3
  -- (74 m aft, 27 m to starboard: clear of the artery, the island, the radar mast and every spot; what DCS itself
  -- stands there has not been looked at).
  towR = 7.5, steerMax = 75, kinkMax = 85, catShort = 2.0,
  -- on a catapult the jet is left within catTurn degrees of the track and its nose wheel within catOff metres of its
  -- line; catLineUp: the taxi way first asked for makes no sharp turn this near the shuttle (Tow.Fd.planCat)
  catTurn = 1.0, catOff = 0.10, catLineUp = 30,
  -- the push into a spot (Tow.Fd.back): the nose wheel is steered no further than backSteer and its turn changes no
  -- faster than backRate (curvature a metre); the main wheels' way is aimed backLook ahead; its bend into the spot is
  -- on backR at most and backRmin at least; passClear: a line across a spot's front is this far ahead of where the
  -- main wheels will stand (the noses of the jets either side reach 11 m ahead of theirs, and the jet in tow is
  -- 5.7 m to its wing tip). pivotOk: a push in which the tractor itself turns more than this (degrees a metre of
  -- its own travel; its tightest real turn, 2.8 m, is 21) is driven only if no other way is gentler. roadFar: with
  -- the spot's corner on the taxi road further than this ahead of it, the lines across its front are tried first
  -- (a push all the way from the road is a long one).
  -- (backRate: 0.35 threw the tractor's tail about; at 0.06 the bend no longer fits the tighter spots. 2026-11-16)
  backSteer = 62, backRate = 0.12, backLook = 2.0, backR = 6, backRmin = 3.0, passClear = 18, pivotOk = 30, roadFar = 30,
  -- backOut: before its way to an aircraft the tractor backs straight out this far, the first that lets it turn onto
  -- its way (Tow.Fd.arrival)
  backOut = { 0, 4, 8, 12 },
  -- the tow's clock (tickTow): a frame's model time is driven in steps of stepT at most, and counts maxFrame at most
  stepT = 0.1, maxFrame = 6,
  -- ON A STRAIGHT (Tow.speeds; `speed`, 1.4 m/s, stays the pace of a turn and of everything in the hangar): the
  -- tractor by itself up to fastSolo, with an aircraft on the bar up to fastTow; brake: how hard it slows for a bend.
  -- (3 m/s is 6 knots, 2 m/s 4 knots: my numbers; the user asked only for "a bit faster" on a major artery.)
  -- (THE USER, 2026-11-18, after the run of the whole demo: "Tugs should be able to drive 1.5x faster with aircraft in tow
  -- whenever they are not turning. Tugs should be able to drive up to 3.0x faster with no aircraft in tow if not in a
  -- congested area (i.e. driving under an aircraft wing)": fastTow 2.1 (it was 2.0, and on the flight deck only: now in
  -- the hangar too); `straight`: the push's pace, as a multiple of backSpeed, where neither the aircraft nor the
  -- tractor turns over the next 4 m; fastSolo 4.2 (it was 3.0), kept down to `speed` where the tractor's own cap says
  -- so (d.cap: the demo's: within 2.5 m of an aircraft's outline))
  fastSolo = 8.4, fastTow = 4.2, straight = 2.0, brake = 1.1,
  -- THE TRACTOR'S TURN IN FRONT OF THE AIRCRAFT (Tow.Fd.arrival), measured from the hook-up place along the nose line:
  -- its turn comes no nearer than `near`; the turn is on radius R (its tightest is turnR, 4); after it, `run` straight
  -- ahead on the nose line, where it stops and the bar is taken off; lead: the straight before the turn.
  arr = { near = 3, R = 5, run = 3, lead = 8 },
  -- TWO AIRCRAFT TOUCH (Tow.Fd.shape, Tow.Fd.check): an F/A-18C taken as four rounded bars: its nose, its body, its
  -- wing (folded or spread) and its tailplane; `touch`: the room kept between two aircraft; tugTouch: between the
  -- tractor and the wheels of an aircraft it is not hooked to (it goes under a nose or a wing). (0.5 and 0.3 at
  -- first: on the full deck nearly every tow was then "not clear": the taxi roads pass the parked noses that close.)
  touch = 0.1, tugTouch = 0.1,
  deckHome = { x = -74, z = 27, hx = 0, hz = -1 },
}
local tow -- the tow in hand: see Tow.begin
local towIds, towRetry, towFail = nil, 0, nil -- the two statics' object ids; when to ask again; what last went wrong
local Tow = { Prof = {} } -- (Tow.ax: the axle finder, once its marker has been shown: { on }; Tow.Prof: what the hook costs a frame, see frame())

-- where the jet and the ship are, asked once a frame however many things want it. ship: that carrier, by name (a
-- tow of a parked aircraft is on the deck tool's carrier, which need not be the one the player's jet stands on)
function Tow.ctx(t, ship)
  if ship then
    if Tow.sctxT ~= t or Tow.sctxS ~= ship then Tow.sctxT, Tow.sctxS, Tow.sctxV = t, ship, getCtx(nil, nil, ship) end
    return Tow.sctxV
  end
  if Tow.ctxT ~= t then Tow.ctxT, Tow.ctxV = t, getCtx() end
  return Tow.ctxV
end

-- A TOW OF A PARKED AIRCRAFT (w.subj) has no pilot to talk to: what the tow says to "you" is said of "it"
function Tow.words(w, text)
  if not (w and w.subj) then return text end
  for _, r in ipairs({
    { ' Nose wheel steering OFF; parking brake on until it is hooked up.', '' },
    { 'hooked up. Brakes OFF and hands off: you are pulled in', 'hooked up: it is pulled in' },
    { ' Set the parking brake, then F10 > Tow > Unhook.', ' The tractor unhooks by itself.' },
    { ': hands off.', '.' },
    { 'in front of you', 'in front of the aircraft' },
    { 'pushes you back', 'pushes it back' },
    { 'You are ', 'It is ' }, { 'you are ', 'it is ' }, { 'your nose', 'its nose' },
  }) do
    local from = 1
    while true do
      local i, j = text:find(r[1], from, true)
      if not i then break end
      text = text:sub(1, i - 1) .. r[2] .. text:sub(j + 1)
      from = i + #r[2]
    end
  end
  return text
end

-- 12 world numbers for something at x, y, z of the ship, facing fx, fz (its axes: forward, up, right)
function Tow.pose(s, x, y, z, fx, fz)
  return { fx * s[1] + fz * s[7], fx * s[2] + fz * s[8], fx * s[3] + fz * s[9], s[4], s[5], s[6], fx * s[7] - fz * s[1], fx * s[8] - fz * s[2], fx * s[9] - fz * s[3],
    s[10] + x * s[1] + y * s[4] + z * s[7], s[11] + x * s[2] + y * s[5] + z * s[8], s[12] + x * s[3] + y * s[6] + z * s[9] }
end

-- the same for something whose axes are given (ship coordinates: x forward, y up, z to starboard)
function Tow.pose3(s, p, X, Y, Z)
  local function w(v) return v[1] * s[1] + v[2] * s[4] + v[3] * s[7], v[1] * s[2] + v[2] * s[5] + v[3] * s[8], v[1] * s[3] + v[2] * s[6] + v[3] * s[9] end
  local o = {}
  for _, v in ipairs({ X, Y, Z }) do
    local a, b, c = w(v)
    o[#o + 1], o[#o + 2], o[#o + 3] = a, b, c
  end
  local a, b, c = w(p)
  o[10], o[11], o[12] = s[10] + a, s[11] + b, s[12] + c
  return o
end

function Tow.unit(x, z)
  local m = math.sqrt(x * x + z * z)
  if m < 1e-6 then return 1, 0, 0 end
  return x / m, z / m, m
end

-- HOW FAST THE WAY ALLOWS (2026-11-17, the user: "the tug could probably drive a bit faster when transiting a major
-- artery"). d.speed is the pace of a turn (the tightest the tractor makes: d.turnR or TOW.turnR); d.fast, if set, the
-- most on a straight. In between, by how the way bends: speed x sqrt(radius / tightest radius) (the same sideways
-- push as the tightest turn at d.speed). Worked out once for a way, for every metre of it (d.vlim): a corner of more
-- than 15 degrees counts as the tightest turn from 4 m before it to 4 m past it (the tractor rounds it on its own
-- radius); then, going backwards, no faster anywhere than it can still brake from (TOW.brake) for what follows.
function Tow.speeds(d)
  local p, s = d.path, d.s
  local n = #p
  local len = s[n]
  local m = math.floor(len) + 2
  local v = {}
  for j = 1, m do v[j] = d.fast end
  -- (d.cap(x, z): the most it may drive there, or nil: a tractor by itself among aircraft)
  if d.cap then
    for j = 1, m do
      local x, z = routeAt(p, s, math.min(len, j - 1))
      local c = d.cap(x, z)
      if c and c < v[j] then v[j] = c end
    end
  end
  local rmin = d.turnR or TOW.turnR
  for i = 2, n - 1 do
    local ax, az = p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]
    local bx, bz = p[i + 1][1] - p[i][1], p[i + 1][2] - p[i][2]
    local la, lb = math.sqrt(ax * ax + az * az), math.sqrt(bx * bx + bz * bz)
    if la > 1e-6 and lb > 1e-6 then
      local th = math.abs(atan2(ax * bz - az * bx, ax * bx + az * bz))
      if th > 1e-4 then
        local lim, reachM = d.fast, 2
        if th > math.rad(15) then
          lim, reachM = d.speed, 4
        else
          local r = 0.5 * (la + lb) / th
          lim = math.max(d.speed, math.min(d.fast, d.speed * math.sqrt(r / rmin)))
        end
        if lim < d.fast then
          for j = math.max(1, math.floor(s[i] - reachM) + 1), math.min(m, math.floor(s[i] + reachM) + 2) do
            if lim < v[j] then v[j] = lim end
          end
        end
      end
    end
  end
  for j = m - 1, 1, -1 do
    local cap = math.sqrt(v[j + 1] ^ 2 + 2 * TOW.brake)
    if cap < v[j] then v[j] = cap end
  end
  d.vlim, d.vfor = v, p
end

-- the tractor driven on along its path for dt seconds; true when it has reached the end
function Tow.drive(d, dt)
  local total = d.s[#d.path]
  local near = routeNearest(d.path, d.s, d.x, d.z, d.at - 1, d.at + 6)
  if near > d.at then d.at = near end
  local remain = total - d.at
  if remain <= 0.15 then
    d.v = 0
    return true
  end
  local vmax = d.speed
  if d.fast and d.fast > d.speed then
    if d.vfor ~= d.path then Tow.speeds(d) end
    local j = math.floor(d.at) + 1
    local a, b = d.vlim[j] or d.speed, d.vlim[j + 1] or d.speed
    vmax = a + (b - a) * (d.at - (j - 1))
    -- (and no faster than the turn it is making this instant allows: off its way, coming onto it)
    if d.kv and d.kv < vmax then vmax = d.kv end
    if vmax < d.speed then vmax = d.speed end
  end
  local acc, brk = d.acc or TOW.accel, d.brk or TOW.brake
  local want = math.min(vmax, math.sqrt(2 * acc * remain) + 0.05)
  -- (d.hold: the deck spotting demo's: it gives way to another tractor: it brakes to a stand where it is, on its way,
  -- and goes on when the hold is taken off)
  if d.hold then
    d.v = math.max(0, d.v - brk * dt)
  elseif d.v > want then
    d.v = math.max(want, d.v - brk * dt)
    if not d.fast then d.v = want end
  else
    d.v = math.min(want, d.v + acc * dt)
  end
  local lx, lz, ldx, ldz = routeAt(d.path, d.s, math.min(total, d.at + TOW.look))
  if remain < TOW.look then lx, lz = lx + ldx * (TOW.look - remain), lz + ldz * (TOW.look - remain) end -- past the end: on along the last leg
  local ax, az = lx - d.x, lz - d.z
  local al = math.sqrt(ax * ax + az * az)
  local ang = (math.atan2 or math.atan)(d.hx * az - d.hz * ax, d.hx * ax + d.hz * az) -- to the aim point, + to the right
  local curv = al > 0.01 and 2 * math.sin(ang) / al or 0
  local turnR = d.turnR or TOW.turnR -- (with a jet on the bar on the flight deck: TOW.towR)
  curv = math.max(-1 / turnR, math.min(1 / turnR, curv))
  if d.fast then d.kv = d.speed * math.sqrt(1 / (turnR * math.max(math.abs(curv), 1e-4))) end
  local c, sn = math.cos(d.v * dt * curv), math.sin(d.v * dt * curv)
  d.hx, d.hz = d.hx * c - d.hz * sn, d.hx * sn + d.hz * c
  d.x, d.z = d.x + d.hx * d.v * dt, d.z + d.hz * d.v * dt
  return false
end

-- statics of ours made (once a mission) by the mission script. spec: "name=type;name=type"; at: { forward, starboard }:
-- made LINKED to the ship, at that place of its deck. Their object ids in that order (false: that one could not be
-- made), and the script's note; or nil, why
function Tow.statics(spec, at, ship)
  local ok, r = pcall(dostring, 'return (CATCC_CR and CATCC_CR.statics) and CATCC_CR.statics(' .. string.format('%q', spec) .. (at and string.format(', %.3f, %.3f', at[1], at[2]) or (ship and ', nil, nil' or ''))
    .. (ship and string.format(', %q', ship) or '')
    .. ') or "ERR|the menu script cannot make statics: run crew-test\\\\install.ps1 with DCS closed"')
  local p = (ok and type(r) == 'string') and split(r) or { 'ERR', tostring(r) }
  if p[1] ~= 'OK' then return nil, tostring(p[2]) end
  local ids, n = {}, select(2, spec:gsub('=', '='))
  for i = 1, n do
    local id = tonumber(p[1 + i])
    ids[i] = (id and id ~= 0) and id or false
  end
  return ids, (p[2 + n] and p[2 + n] ~= '') and p[2 + n] or nil
end

-- the ship's own frame as the 12 numbers of a pose (for something that is the ship's child)
Tow.OWN = { 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0 }

-- the tractor and the bar: { tug = id, bar = id or nil, tugOwn, barOwn }
-- THE SHIMMER AND ITS CURE (2026-11-15). A static made by itself holds its place as single-precision WORLD numbers
-- (steps of 1.6 cm where this mission is), re-given every frame beside a ship doing 30 knots: the tractor and the bar
-- shimmered against the deck and the jet (the user: "the only issue"). A static LINKED to a ship is the ship's CHILD
-- (edObjects.dll: viObjectNode::Parent; lLandObject keeps its pose in its parent's frame and its SetPos stores what it
-- is given there): drawn with the ship, as the axle finder's marker was (steady to the millimetre). So the two are
-- now made linked, and placed in the ship's own frame (Tow.OWN: metres forward, up, to starboard; any height).
-- tugOwn / barOwn: that object has a parent (native.staticinfo) and is placed so; else in the world, as before.
-- ship: the carrier they are made on, by name, when that is not the one the player's jet stands on (a tow of a parked
-- aircraft: the deck tool's carrier). Made once a mission, they stay that ship's.
function Tow.ids(ship)
  if towIds then
    if ship and towIds.ship and towIds.ship ~= ship then return nil, 'the tractor was made on ' .. tostring(towIds.ship) .. ' in this mission and stays there (this is ' .. tostring(ship) .. ')' end
    return towIds
  end
  if now() < towRetry then return nil, towFail end
  towRetry = now() + 2
  local ids, note = Tow.statics('catcc-tug=AS32-31A;catcc-towbar=CATCC_Towbar', { TOW.home.x, TOW.home.z }, ship)
  if not ids or not ids[1] then
    towFail = ids and ('the tractor could not be made' .. (note and (': ' .. note) or '')) or tostring(note)
    logLine('tow: no tractor: ' .. towFail)
    return nil, towFail
  end
  towIds = { tug = ids[1], bar = ids[2] or nil, ship = ship }
  logLine(string.format('tow: statics made: tractor object %d, tow bar %s%s', ids[1], towIds.bar and ('object ' .. towIds.bar) or 'NONE (the bar type of our mod is missing?)',
    note and (' (' .. note .. ')') or ''))
  for _, k in ipairs({ 'tug', 'bar' }) do
    local id = towIds[k]
    if id then
      local ok, cls, kind, parent = pcall(function() return native.staticinfo(id) end)
      local own = ok and type(parent) == 'string'
      towIds[k .. 'Own'] = own or nil
      logLine(string.format('tow: the %s (object %d): %s', k == 'tug' and 'tractor' or 'bar', id,
        own and ('the ship\'s child (its parent: ' .. parent .. '): placed in the ship\'s own frame')
        or ('NO PARENT (' .. (native.staticinfo and (ok and 'not linked' or tostring(cls)) or 'an older native module') .. '): placed in the world, where it shimmers against a ship under way')))
    end
  end
  return towIds
end

-- The bar's geometry (crew-test/model/towbar.py): with its arms open by theta (radians beyond closed), its axle
-- pins' tips are `along` from the ring's centre and `half` either side of its centre line
function Tow.pins(theta)
  local b = TOW.bar
  local a = b.a0 + theta
  return b.pivotX + b.pinU * math.cos(a) + b.pinW * math.sin(a), b.armZ0 + b.pinU * math.sin(a) - b.pinW * math.cos(a)
end

-- the opening at which the pins' tips are `half` from the centre line (as far as the bar opens, at most)
function Tow.thetaFor(half)
  local lo, hi = 0, TOW.bar.thetaMax
  for _ = 1, 40 do
    local mid = (lo + hi) / 2
    local _, z = Tow.pins(mid)
    if z < half then lo = mid else hi = mid end
  end
  return (lo + hi) / 2
end

-- the bar's model argument for an opening: free (0 closed .. 0.5 wide open, the chain slack) or clamped (0.5 wide
-- open .. 1 closed, the chain taut)
function Tow.armArg(theta, clamped)
  local k = math.max(0, math.min(1, theta / TOW.bar.thetaMax))
  return clamped and (1 - 0.5 * k) or (0.5 * k)
end

-- the bar's length on the flat, from the ring to the axle pins, as it stands now (its opening, its two ends' heights)
function Tow.flat(w)
  local along = Tow.pins(w.theta)
  return math.sqrt(along * along - (w.lugUp - w.ringUp) ^ 2)
end

-- the axle's height above the floor the jet stands on; the opening at which the pins are in the axle's ends
function Tow.axleUp() return TOW.gearUp - TOW.axleDown end
function Tow.thetaIn() return Tow.thetaFor(math.max(0.01, TOW.axleLen / 2 - TOW.pinIn)) end

-- THE DRIVERS' HEAD (Scripts/CATCC/crewtest_head.lua; crew-test/DRIVER-HEAD.md): where a driver looks: over his right
-- shoulder while his tractor backs, towards the point of his way Tow.Head.CFG.ahead metres on while it drives, round
-- about now and then. Tow.Head is nil when the file is not there; a driver whose head cannot be turned (Tow.Head.seat:
-- no blend space of ours among his animations, an older native module) sits in TOW.seatAnim as before.
do
  local f = loadfile(writedir .. 'Scripts/CATCC/crewtest_head.lua')
  local ok, m = pcall(function() return f and f() end)
  Tow.Head = (ok and type(m) == 'table') and m or nil
end
-- THE BRAKE RIDERS (Scripts/CATCC/crewtest_cockpit.lua; crew-test/BRAKE-RIDER.md): brown shirts in the cockpit of an
-- aircraft the demo tows. Tow.Cockpit is nil when the file is not there: the demo's tows go without them.
do
  local f = loadfile(writedir .. 'Scripts/CATCC/crewtest_cockpit.lua')
  local ok, m = pcall(function() return f and f() end)
  Tow.Cockpit = (ok and type(m) == 'table') and m or nil
end

-- THE DRIVERS' LIMBS (crew-test/DRIVER-POSE.md). A driver whose head does not turn sits in the seated pose of ours
-- with his feet at the pedals and his hands on the steering wheel (TOW.seatPose) when it is among his animations
-- (install.ps1 -DriverPose on), else in the pilot's own (TOW.seatAnim) as before. (One whose head turns sits in the
-- blend space: its five poses are made with the same limbs by the same switch.) Returns the pose now played; nil and
-- why when neither could be.
function Tow.sit(native, h)
  local ok, res = pcall(native.play, h, TOW.seatPose, 2)
  if ok and res then return TOW.seatPose end
  local ok2, res2, e2 = pcall(native.play, h, TOW.seatAnim, 2)
  if ok2 and res2 then return TOW.seatAnim end
  return nil, tostring(ok2 and e2 or res2)
end

-- everything put where it is this frame
-- THE FRONT HITCH (w.front; the user, 2026-11-15: "in some situations it could be good to use the forward attachment
-- instead of the rear"; 2026-11-17, of the packed hangar: "It's also permissible for a tug to ... push an aircraft with
-- its other connection point"). The tractor then FACES the aircraft, its front pintle (TOW.hitchFront ahead of its
-- position) in the bar's ring. Everything the tow works with stays as it is: w.d is the tractor as if it stood the
-- other way round on the same ground with its rear pintle there (its own point TOW.hitch beyond the ring, pointing
-- away from the aircraft): the two take up the same ground, to the centimetre (2.93 - 1.73 = 1.2: the tractor's
-- ends are 2.1 m ahead of and 3.3 m behind its point). Only what is DRAWN is the real one: Tow.real.
function Tow.real(w)
  local d = w.d
  if not w.front then return d.x, d.z, d.hx, d.hz end
  local f = TOW.hitch - TOW.hitchFront
  return d.x - d.hx * f, d.z - d.hz * f, -d.hx, -d.hz
end

function Tow.apply(w, ctx, dt)
  local s = ctx.s
  local d = w.d
  local towIds = w.ids or towIds -- (a tow of the demo's has its own tractor and bar; the player's tows share the one pair)
  local rx, rz, rhx, rhz = Tow.real(w)
  local ok, res, e, rk, took, flags = pcall(native.staticpos, towIds.tug, unpack(Tow.pose(towIds.tugOwn and Tow.OWN or s, rx, w.floor, rz, rhx, rhz)))
  if not (ok and res) then return nil, 'the tractor could not be placed: ' .. tostring(ok and e or res) end
  if not w.tugSeen and not w.quiet then
    w.tugSeen = true
    logLine(string.format('tow: the tractor is placed (class %s, register kind %s; %s; its flag word %s)', tostring(e), tostring(rk),
      took == nil and 'whether it took the place is not known' or (took and 'it says it is there' or 'IT IS NOT WHERE IT WAS PUT'), tostring(flags)))
    if took == false then say('the tow tractor did not take the place it was given: DCS leaves this object where it is (the log has its flag word).') end
  end
  -- the hitch at the tractor's rear
  local hx, hz = d.x - d.hx * TOW.hitch, d.z - d.hz * TOW.hitch
  if w.bar == 'tug' or w.bar == 'both' then
    -- on the pintle: the bar's pin end follows the hitch as a trailer's axle does ((ux, uz): from the pin end to the
    -- ring); on its own wheels behind the tractor, or on the nose wheel's axle when towing
    w.ringUp, w.lugUp = TOW.hitchUp, w.bar == 'tug' and TOW.bar.wheelUp or Tow.axleUp()
    local ux, uz = Tow.unit(hx - w.lx, hz - w.lz)
    local fl = Tow.flat(w)
    w.ux, w.uz, w.lx, w.lz = ux, uz, hx - ux * fl, hz - uz * fl
  end
  if towIds.bar and not w.barBad then
    local fl = Tow.flat(w)
    local pb = Tow.barPose(towIds.barOwn and Tow.OWN or s, w.lx + w.ux * fl, w.floor + w.ringUp, w.lz + w.uz * fl, w.lx, w.floor + w.lugUp, w.lz)
    local okb, resb, eb = pcall(native.staticpos, towIds.bar, unpack(pb))
    if not (okb and resb) then
      w.barBad = true
      logLine('tow: the bar could not be placed (the tow goes on without it): ' .. tostring(okb and eb or resb))
    else
      Tow.armShow(w)
    end
  end
  if w.driver and not w.driverBad then
    local okd, resd, ed = pcall(native.place, w.driver.h, rx + rhx * TOW.seat.fwd + rhz * TOW.seat.left, w.floor + TOW.seat.up, rz + rhz * TOW.seat.fwd - rhx * TOW.seat.left, rhx, rhz)
    if not (okd and resd) then
      w.driverBad = true
      logLine('tow: the driver could not be put on the seat (the tow goes on without him): ' .. tostring(okd and ed or resd))
    elseif not w.driverSaid and not w.quiet then
      -- (ed: how he was placed, from the native module: "origin + pose" when his own pose on the ship was written too)
      w.driverSaid = true
      logLine(string.format('tow: the driver is put on the seat (%s): %.2f m forward, %.2f m left, %.2f m up of the tractor\'s position', tostring(ed or 'origin only: an older native module'),
        TOW.seat.fwd, TOW.seat.left, TOW.seat.up))
    end
    if w.driver.head and Tow.Head then
      -- his head (Tow.Head): the real tractor's place and facing, and the point of its way it drives towards
      local ax, az
      if d.path and d.s and d.at then ax, az = routeAt(d.path, d.s, math.min(d.s[#d.path], d.at + Tow.Head.CFG.ahead)) end
      -- (an aircraft on the bar that goes tail first: pushed back: he looks where IT goes: a point 12 m beyond its
      -- main wheels along its tail. Told from how the aircraft moved since the last frame (it is moved below), kept
      -- through a stop; not once it is pulled nose first, or off the bar)
      local px, pz
      if w.bar == 'both' and w.jx and w.jfx then
        if w.headJx and dt and dt > 0 then
          local back = -((w.jx - w.headJx) * w.jfx + (w.jz - w.headJz) * w.jfz) / dt
          if back > 0.1 then w.headPush = true elseif back < -0.1 then w.headPush = false end
        end
        w.headJx, w.headJz = w.jx, w.jz
        if w.headPush then px, pz = w.mx - w.jfx * 12, w.mz - w.jfz * 12 end
      else
        w.headJx, w.headJz, w.headPush = nil, nil, nil
      end
      Tow.Head.drive(native, w.driver, dt, rx, rz, rhx, rhz, ax, az, px, pz)
    end
  end
  if w.bar == 'both' then
    -- the jet: its nose wheel where the bar's pin end is, its main wheels dragged behind that
    local fx, fz = Tow.unit(w.lx - w.mx, w.lz - w.mz)
    w.mx, w.mz = w.lx - fx * (TOW.noseGear + TOW.mainGear), w.lz - fz * (TOW.noseGear + TOW.mainGear)
    w.jx, w.jz, w.jfx, w.jfz = w.lx - fx * TOW.noseGear, w.lz - fz * TOW.noseGear, fx, fz
    if w.subj then
      -- a parked aircraft (a static, the ship's child as the tractor is): through its own position setter, in the
      -- ship's own frame; where it now stands is kept on its deck entry (the click and the mark find it there)
      local okj, resj, ej, _, took = pcall(native.staticpos, w.subj.id, unpack(Tow.pose(w.subj.own and Tow.OWN or s, w.jx, w.jy, w.jz, fx, fz)))
      if not (okj and resj) then return nil, 'the aircraft in tow could not be moved: ' .. tostring(okj and ej or resj) end
      if not w.subjSeen and not w.quiet then
        w.subjSeen = true
        logLine(string.format('tow: the aircraft in tow is placed (object %d, class %s; %s; %s)', w.subj.id, tostring(ej), w.subj.own and 'in the ship\'s own frame' or 'in the world',
          took == nil and 'whether it took the place is not known' or (took and 'it says it is there' or 'IT IS NOT WHERE IT WAS PUT')))
        if took == false then say('the aircraft in tow did not take the place it was given: DCS leaves this object where it is.') end
      end
      w.subj.e.at = { x = w.jx, z = w.jz, hdg = math.deg(atan2(fz, fx)) % 360, where = (w.phase == 'arrived' and 'at ' or 'in tow to ') .. tostring(w.dest.short or w.dest.name) }
    else
      local okj, resj, ej = pcall(native.forcepos, w.jet, unpack(Tow.pose(s, w.jx, w.jy, w.jz, fx, fz)))
      if not (okj and resj) then return nil, 'the jet could not be moved: ' .. tostring(okj and ej or resj) end
    end
  end
  if w.bar == 'gear' or w.bar == 'both' then
    -- on the nose gear the bar's heading is the nose wheel's: its steering angle, from the jet's nose, + to the right
    local steer = math.deg((math.atan2 or math.atan)(w.jfx * w.uz - w.jfz * w.ux, w.jfx * w.ux + w.jfz * w.uz))
    w.steer = steer
    if math.abs(steer) > math.abs(w.maxSteer or 0) then w.maxSteer = steer end
    Tow.steerShow(w, steer)
  end
  Tow.wheelsShow(w, dt or 0)
  return true
end

-- The wheels, turned on the models (the arguments the user gave, 2026-11-15; their ranges and senses read from
-- DCS's own models, as32-31a.edm and FA-18C_Collision.edm):
--   the tractor   8: every wheel, one turn a unit, rising = rolling forward; 9: steering, +1 = 31 degrees to the LEFT
--                 (the steering wheel turns with it); 20: pitch about the rear axle, +1 = nose up (1 cm)
--   the jet       101 nose wheels, 103 left main wheel, 102 right main wheel: one turn a unit, rising = rolling forward
-- Everything comes from what moved since the frame before, whichever way it was moved: the tractor's own travel along
-- its heading (backing counts backwards), its turn for that travel (the steering a tractor of its wheelbase needs
-- for it), its change of speed (the pitch); the jet's nose wheel point along the bar, each main wheel along the
-- jet's nose (the outer one turns further in a turn). Written every frame; the first write is logged.
function Tow.wheelsShow(w, dt)
  if not native.objarg or w.wheelsBad then return end
  local h = shipHandle()
  if not h then return end
  local towIds = w.ids or towIds
  local d = w.d
  local W = w.wheels
  if not W then
    W = { roll = 0, steer = 0, pitch = 0, v = 0, n = 0, nl = 0, nr = 0 }
    w.wheels = W
  end
  local TWO_PI_ = 2 * math.pi
  -- (flag: what a failure switches off: all of it, or (a parked aircraft's wheels) only the towed aircraft's)
  local function set(id, arg, v, flag)
    local ok, res, e = pcall(native.objarg, h, id, arg, v)
    if not (ok and res) then
      w[flag or 'wheelsBad'] = true
      logLine(string.format('tow: a wheel argument could not be set (object %s argument %d; no more %s written): %s', tostring(id), arg, flag and 'of the towed aircraft\'s are' or 'are', tostring(ok and e or res)))
      return false
    end
    return true
  end
  -- the tractor
  if W.tx then
    local ds = (d.x - W.tx) * d.hx + (d.z - W.tz) * d.hz
    if w.front then ds = -ds end -- (on its front hitch the tractor itself stands the other way round)
    local turn = (math.atan2 or math.atan)(W.thx * d.hz - W.thz * d.hx, W.thx * d.hx + W.thz * d.hz) -- + to the right
    W.roll = (W.roll + ds / (TWO_PI_ * TOW.tugWheelR)) % 1
    if dt > 0 then
      local k = math.min(1, dt / 0.25)
      if math.abs(ds) > 1e-4 then
        local want = -math.deg(math.atan(TOW.tugBase * turn / ds)) / TOW.tugSteerDeg -- (the argument: + to the left)
        W.steer = W.steer + (math.max(-1, math.min(1, want)) - W.steer) * k
      end -- (standing: the wheels stay as they were turned)
      local v = ds / dt
      local acc = (v - W.v) / dt
      W.v = v
      W.pitch = W.pitch + (math.max(-1, math.min(1, 0.6 * acc / TOW.accel)) - W.pitch) * k
    end
  end
  W.tx, W.tz, W.thx, W.thz = d.x, d.z, d.hx, d.hz
  if not (set(towIds.tug, TOW.tugWheelArg, W.roll) and set(towIds.tug, TOW.tugSteerArg, W.steer) and set(towIds.tug, TOW.tugPitchArg, W.pitch)) then return end
  -- the jet's wheels, once it is on the bar and moves with it
  if w.bar == 'both' and w.jfx then
    local fx, fz = w.jfx, w.jfz
    local half = TOW.track / 2
    -- (the jet's left on the ship is (fz, -fx))
    local lx, lz, rx, rz = w.mx + fz * half, w.mz - fx * half, w.mx - fz * half, w.mz + fx * half
    if W.jn then
      W.n = (W.n + ((w.lx - W.jn[1]) * w.ux + (w.lz - W.jn[2]) * w.uz) / (TWO_PI_ * TOW.noseWheelR)) % 1
      W.nl = (W.nl + ((lx - W.jl[1]) * fx + (lz - W.jl[2]) * fz) / (TWO_PI_ * TOW.mainWheelR)) % 1
      W.nr = (W.nr + ((rx - W.jr[1]) * fx + (rz - W.jr[2]) * fz) / (TWO_PI_ * TOW.mainWheelR)) % 1
    end
    W.jn, W.jl, W.jr = { w.lx, w.lz }, { lx, lz }, { rx, rz }
    local jflag = w.subj and 'jetWheelsBad' or nil
    if not w.jetWheelsBad and not (set(w.jet, TOW.jetWheelArgs.nose, W.n, jflag) and set(w.jet, TOW.jetWheelArgs.left, W.nl, jflag) and set(w.jet, TOW.jetWheelArgs.right, W.nr, jflag)) and not jflag then return end
  else
    W.jn, W.jl, W.jr = nil, nil, nil
  end
  if not W.said and not w.quiet then
    W.said = true
    logLine(string.format('tow: the wheels are turned on the models: the tractor\'s arguments %d (wheels), %d (steering), %d (pitch); the jet\'s %d / %d / %d (nose, left main, right main) once it is pulled',
      TOW.tugWheelArg, TOW.tugSteerArg, TOW.tugPitchArg, TOW.jetWheelArgs.nose, TOW.jetWheelArgs.left, TOW.jetWheelArgs.right))
  end
end


-- the bar's arms (its model argument TOW.bar.arg) as w.theta and w.clamped have them: written every frame (a static's
-- arguments are its own list: native.objarg reaches it as it does the jet's); the first result logged
function Tow.armShow(w)
  if not native.objarg or w.armBad then return end
  local h = shipHandle()
  if not h then return end
  local towIds = w.ids or towIds
  local ok, res, e = pcall(native.objarg, h, towIds.bar, TOW.bar.arg, Tow.armArg(w.theta, w.clamped))
  if not (ok and res) then
    w.armBad = true
    logLine(string.format('tow: the bar\'s arms (its argument %d) could not be set: %s', TOW.bar.arg, tostring(ok and e or res)))
  elseif not w.armSeen and not w.quiet then
    w.armSeen = true
    logLine(string.format('tow: the bar\'s arms are on its argument %d (class %s)', TOW.bar.arg, tostring(e)))
  end
end

-- the nose wheel's steering shown on the jet's model (native.objarg: the jet's own list of model arguments).
-- Before each write the value there is read: if it is not what was written the frame before, the aircraft's
-- own code writes the argument too (logged the first three times, then every 200th).
function Tow.steerShow(w, steer)
  if not native.objarg or w.steerBad then return end
  local h = shipHandle()
  if not h then return end
  local v = math.max(-1, math.min(1, TOW.steerSign * steer / TOW.steerDeg))
  local okr, now0 = pcall(native.objarg, h, w.jet, TOW.steerArg)
  if okr and type(now0) == 'number' and w.steerSet and math.abs(now0 - w.steerSet) > 0.01 then
    w.steerOver = (w.steerOver or 0) + 1
    if w.steerOver <= 3 or w.steerOver % 200 == 0 then
      logLine(string.format('tow: the jet\'s argument %d read %.3f where %.3f was written: something else writes it too (%d times so far)', TOW.steerArg, now0, w.steerSet, w.steerOver))
    end
  end
  local ok, res, e = pcall(native.objarg, h, w.jet, TOW.steerArg, v)
  if not (ok and res) then
    w.steerBad = true
    logLine('tow: the nose wheel steering could not be shown on the jet: ' .. tostring(ok and e or res))
    return
  end
  if not w.steerSet and not w.quiet then logLine(string.format('tow: the nose wheel\'s steering is shown on the jet (argument %d; was %s; class %s)', TOW.steerArg, tostring(now0), tostring(e))) end
  w.steerSet = v
end

-- 12 world numbers for the bar: its origin (the ring's centre) at the ring, its x axis to the pins' middle, y square
-- to it in the vertical plane, z = x cross y (its right)
function Tow.barPose(s, rx, ry, rz, lx, ly, lz)
  local X = { lx - rx, ly - ry, lz - rz }
  local m = math.sqrt(X[1] ^ 2 + X[2] ^ 2 + X[3] ^ 2)
  X = { X[1] / m, X[2] / m, X[3] / m }
  local Y = { -X[1] * X[2], 1 - X[2] * X[2], -X[3] * X[2] }
  local ym = math.sqrt(Y[1] ^ 2 + Y[2] ^ 2 + Y[3] ^ 2)
  Y = { Y[1] / ym, Y[2] / ym, Y[3] / ym }
  local Z = { X[2] * Y[3] - X[3] * Y[2], X[3] * Y[1] - X[1] * Y[3], X[1] * Y[2] - X[2] * Y[1] }
  return Tow.pose3(s, { rx, ry, rz }, X, Y, Z)
end

function Tow.phase(w, name, text)
  w.phase, w.t0 = name, w.clock or Tow.now()
  logLine(string.format('tow%s: %s (tractor at %.1f fwd %.1f stbd, heading %.2f %.2f; bar %s, arms open %.1f degrees%s%s)', w.name and (' ' .. w.name) or '', name, w.d.x, w.d.z, w.d.hx, w.d.hz, tostring(w.bar),
    math.deg(w.theta), w.clamped and ', clamped' or '', w.bar == 'both' and string.format('; jet at %.1f fwd %.1f stbd, nose %.2f %.2f', w.jx or 0, w.jz or 0, w.jfx or 0, w.jfz or 0) or ''))
  if text and w.quiet then
    logLine('  (' .. tostring(w.name or 'a tow') .. ') ' .. Tow.words(w, text))
  elseif text then
    say(Tow.words(w, text))
  end
end

-- "Unhook", in any phase (the F10 menu's, the panel's; and by itself once a parked aircraft has been towed to its place)
function Tow.unhook(w)
  if w.phase == 'parked' or w.phase == 'leave' then return say('the tractor is unhooked already.') end
  if w.phase == 'ringoff' or w.phase == 'moveup' or w.phase == 'release' or w.phase == 'setdown' or w.phase == 'roll' or w.phase == 'close' or w.phase == 'ringon' then
    return say('the bar is being taken off already.')
  end
  local was = w.phase
  w.paused = false
  w.d.turnR = nil
  if w.keepBar and w.bar == 'both' then
    -- (the deck spotting demo: the bar stays on the aircraft: its ring is lifted off the pintle and set down on its
    -- foot, the tractor moves up and drives away)
    w.d.v = 0
    w.bar = 'gear'
    w.ringUp, w.lugUp = TOW.hitchUp, Tow.axleUp()
    return Tow.phase(w, 'ringoff', 'tow: unhooking: the bar stays on the aircraft.')
  end
  if w.subj and w.subj.e.at and was ~= 'arrived' and w.bar == 'both' then w.subj.e.at.where = 'where its tow to ' .. tostring(w.dest.short or w.dest.name) .. ' was broken off' end
  if w.bar == 'both' then
    -- hooked up (at the place, or under way: the tractor stops where it is): the bar comes off the tractor, then off
    -- the jet, and goes back on the tractor (the phases from 'ringoff' on); the jet is left where it stands
    w.d.v = 0
    w.bar = 'gear'
    w.ringUp, w.lugUp = TOW.hitchUp, Tow.axleUp()
    return Tow.phase(w, 'ringoff', (was == 'arrived' and 'tow: unhooking. ' or 'tow: broken off. ') .. 'The bar\'s ring is lifted off the tractor\'s pintle and set down...')
  end
  if w.bar == 'tug' then
    -- the bar still on the tractor (it had not reached the jet): it just moves on with it
    local d0 = w.d
    Tow.path(w, { { d0.x, d0.z }, { d0.x + d0.hx * 8, d0.z + d0.hz * 8 } }, TOW.speed)
    return Tow.phase(w, 'leave', 'tow: broken off; the tractor moves 8 m on with its bar and waits there.')
  end
  w.bar = (w.bar == 'both' or w.bar == 'gear') and 'gear' or 'free' -- the ring comes off the pintle and is set down; the bar stays on the nose gear
  local d = w.d
  Tow.path(w, { { d.x, d.z }, { d.x + d.hx * 8, d.z + d.hz * 8 } }, TOW.speed)
  -- (broken off while the bar was off the tractor, being put on the jet: it is left where it is)
  return Tow.phase(w, 'leave', 'tow: broken off; the bar is left where it is and the tractor moves 8 m on and waits there.')
end

-- fast: the most on a straight stretch of it (Tow.speeds); none: `speed` all the way
function Tow.path(w, pts, speed, fast)
  local d = w.d
  d.path, d.s, d.at, d.speed = pts, routeLengths(pts), 0, speed
  d.fast, d.vfor, d.vlim, d.kv = fast, nil, nil, nil
end

local function smooth(k)
  k = math.max(0, math.min(1, k))
  return k * k * (3 - 2 * k)
end

-- THE TOW'S CLOCK IS THE MISSION'S (2026-11-17, the user: "accelerating time in the mission does not make the tugs move
-- any faster"): model time, which stands still while the mission is paused and runs 2, 4, 8... times as fast under time
-- acceleration (real time before, with a frame worth 0.3 s at most). A frame's worth of it is driven in steps of 0.1 s
-- at most (Tow.STEP), the bar and the jet trailing after every step as in the plan driven in the head: so the tow goes
-- the same way at any frame rate and any acceleration. A frame is worth TOW.maxFrame seconds at most.
-- ACTIVE PAUSE (the user, 2026-11-18: "When I pressed active pause in my last session, the tugs continued to move
-- aircraft. They should pause too"). Under DCS's pause the mission's clock stands, and the tow with it. Under its
-- ACTIVE pause the clock runs on (DCS holds the player's own aircraft only). DCS says when that is on (Export's
-- LoSimulationOnActivePause: "true if simulation is in active pause"); the model time that passes while it is on is
-- taken out of the tow's clock (Tow.ap.off). So Tow.now stands under either pause, and with it every tow, the deck
-- spotting demo (all of it runs on Tow.now) and an elevator the demo raises. Asked once for each new model time, and
-- every frame of a mission (frame), so that none of it is missed. (What DCS itself moves goes on: its own deck crew,
-- an elevator on its way down.)
Tow.ap = { off = 0 }
function Tow.now()
  local okm, v = pcall(function() return DCS.getModelTime() end)
  local mt = okm and tonumber(v) or nil
  if not mt then return now() end
  local A = Tow.ap
  -- (another mission: its clock begins again)
  if A.last and mt < A.last - 1e-6 then A.off, A.last, A.on, A.since = 0, nil, nil, nil end
  if A.last ~= mt then
    if A.on and A.last then A.off = A.off + (mt - A.last) end
    local on = false
    if Export and Export.LoSimulationOnActivePause then
      local oka, r = pcall(Export.LoSimulationOnActivePause)
      on = oka and (r == true or r == 1)
    end
    -- (said by the main thread's own copy of this clock, not again on the demo's thread)
    if on and not A.on then
      A.since = mt
      if not CATCC_WORKER then logLine('active pause ON: the tow\'s clock is held: tractors, tows and the deck spotting demo stand') end
    elseif A.on and not on then
      if not CATCC_WORKER then logLine(string.format('active pause OFF after %.0f s of the mission\'s time: they go on', mt - (A.since or mt))) end
    end
    A.on, A.last = on, mt
  end
  return mt - A.off
end

-- the trailing, as Tow.apply places it: the bar's pin end behind the hitch, the jet's main wheels behind the nose wheel
function Tow.follow(w)
  local d = w.d
  local hx, hz = d.x - d.hx * TOW.hitch, d.z - d.hz * TOW.hitch
  if w.bar == 'tug' or w.bar == 'both' then
    w.ringUp, w.lugUp = TOW.hitchUp, w.bar == 'tug' and TOW.bar.wheelUp or Tow.axleUp()
    local ux, uz = Tow.unit(hx - w.lx, hz - w.lz)
    local fl = Tow.flat(w)
    w.ux, w.uz, w.lx, w.lz = ux, uz, hx - ux * fl, hz - uz * fl
  end
  if w.bar == 'both' then
    local fx, fz = Tow.unit(w.lx - w.mx, w.lz - w.mz)
    w.mx, w.mz = w.lx - fx * (TOW.noseGear + TOW.mainGear), w.lz - fz * (TOW.noseGear + TOW.mainGear)
    w.jx, w.jz, w.jfx, w.jfz = w.lx - fx * TOW.noseGear, w.lz - fz * TOW.noseGear, fx, fz
  end
end

-- one tow driven on to model time mt (the player's, or one of the deck spotting demo's: each with its own tractor,
-- w.ids, and its own surroundings, w.env). True; or nil and what went wrong (the tow is then over).
function Tow.tickOne(w, ctx, mt)
  local total = math.max(0, math.min(TOW.maxFrame, mt - (w.last or mt)))
  local steps = math.max(1, math.ceil(total / TOW.stepT - 1e-9))
  local dt = total / steps
  local t0 = (w.last or mt)
  if mt - t0 > total then t0 = mt - total end
  w.last = mt
  if w.subj and w.bar ~= 'tug' and w.subj.e.id ~= w.subj.id then
    -- (the deck tool took the aircraft away, or made it anew on its spot: the object the tow had is gone)
    return nil, 'the aircraft in tow is no longer there (taken away, or parked anew by the deck tool)'
  end
  -- (its surroundings: the hangar's floor and walls for a tow down there; the flight deck's otherwise)
  local env = w.env
  if env then Tow.Fd.inside, Tow.Fd.wall, Tow.Fd.blocks = env.inside, env.wall, env.blocks end
  local d = w.d
  local B = TOW.bar
  for i = 1, steps do
  w.clock = t0 + dt * i
  local k = w.clock - w.t0
  if not w.paused then
    if w.phase == 'backout' then
      -- the tractor backs straight out of where it stands before its way (Tow.Fd.arrival); the bar on its pintle
      -- goes with it as it lies
      local b = w.backOut
      local remain = b.len - b.s
      b.v = math.min(math.min(TOW.backSpeed, math.sqrt(2 * TOW.accel * remain) + 0.05), b.v + TOW.accel * dt)
      local step = math.min(remain, b.v * dt)
      b.s = b.s + step
      if b.arc then
        -- (a quarter circle backwards, to turn round: b.arc = { cx, cz, r, a0, a1 }, as the 'backup' onto a bar)
        local a = b.arc.a0 + (b.arc.a1 - b.arc.a0) * math.min(1, b.s / b.len)
        local sg = b.arc.a1 >= b.arc.a0 and 1 or -1
        d.x, d.z = b.arc.cx + b.arc.r * math.cos(a), b.arc.cz + b.arc.r * math.sin(a)
        d.hx, d.hz = sg * math.sin(a), -sg * math.cos(a)
      else
        d.x, d.z = d.x - d.hx * step, d.z - d.hz * step
        if w.bar == 'tug' then w.lx, w.lz = w.lx - d.hx * step, w.lz - d.hz * step end
      end
      d.v = -b.v
      if b.len - b.s < 1e-4 then
        d.v = 0
        -- (w.solo: a tractor of the demo's by itself, on its way to where it waits: it has no aircraft to go to)
        Tow.phase(w, w.solo and 'leave' or 'arrive')
      end
    elseif w.phase == 'arrive' then
      if Tow.drive(d, dt) then
        if w.keepBar then
          -- (the bar is on the aircraft already, its ring on its foot: lifted to the hitch's height, the tractor backs onto it)
          if w.frontHitch and not w.front then
            -- (it has driven up FACING the aircraft: from here on w.d is the tractor the other way round: Tow.real)
            local f = TOW.hitch - TOW.hitchFront
            d.x, d.z = d.x - d.hx * f, d.z - d.hz * f
            d.hx, d.hz = -d.hx, -d.hz
            w.front = true
            w.wheels = nil
          end
          if w.turnTo then
            -- (THE NOSE WHEEL TURNED AT THE HOOK-UP (the user, 2026-11-18: "Tugs may connect to aircraft with the
            -- nosewheel turned initially if required. In these cases, the nosewheel and towbar should be rotated
            -- together after the connection is made, then connected to the tug"): the bar is on the nose gear; it and
            -- the nose wheel are turned onto the line the tractor stands on (20 degrees a second, 1.5 s at least); the
            -- nose wheel on the model follows the bar: Tow.apply)
            local a0, a1 = atan2(w.uz, w.ux), atan2(w.turnTo[2], w.turnTo[1])
            w.turn = { a = a0, da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi }
            w.turn.T = math.max(1.5, math.abs(math.deg(w.turn.da)) / 20)
            w.turnTo = nil
            Tow.phase(w, 'turn', string.format('tow: the tractor stands off the aircraft\'s nose line: the nose wheel and the bar are turned %.0f degrees towards it together.', math.abs(math.deg(w.turn.da))))
          else
          Tow.phase(w, 'lift', w.front and 'tow: the tractor has driven up to the aircraft\'s nose. The bar\'s ring is lifted to its front hitch.' or 'tow: the tractor is in front of the aircraft. The bar\'s ring is lifted to its hitch.')
          end
        else
          w.bar = 'free'
          Tow.phase(w, 'unhitch', 'tow: the tractor is in front of you. The bar comes off its pintle...')
        end
      end
    elseif w.phase == 'turn' then
      local c = w.turn
      local q = smooth(k / c.T)
      w.ux, w.uz = math.cos(c.a + c.da * q), math.sin(c.a + c.da * q)
      if k >= c.T then
        w.ux, w.uz = math.cos(c.a + c.da), math.sin(c.a + c.da)
        Tow.phase(w, 'lift', w.front and 'tow: the bar\'s ring is lifted to the tractor\'s front hitch.' or 'tow: the bar\'s ring is lifted to the tractor\'s hitch.')
      end
    elseif w.phase == 'unhitch' then
      w.ringUp = TOW.hitchUp + (B.ringRest - TOW.hitchUp) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.ringUp = B.ringRest
        Tow.phase(w, 'open', 'tow: ...its arms are swung open...')
      end
    elseif w.phase == 'open' then
      -- the arms swing open about the ring head, which stays where it lies
      local fl = Tow.flat(w)
      local rx, rz = w.lx + w.ux * fl, w.lz + w.uz * fl
      w.theta = B.thetaMax * smooth(k / TOW.step)
      fl = Tow.flat(w)
      w.lx, w.lz = rx - w.ux * fl, rz - w.uz * fl
      if k >= TOW.step then
        -- from where it lies to the nose wheel's axle, straight ahead of the nose wheels, an arm either side of them
        local a0 = (math.atan2 or math.atan)(w.uz, w.ux)
        local a1 = (math.atan2 or math.atan)(w.jfz, w.jfx)
        w.carry = { x = w.lx, z = w.lz, a = a0, da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi, len = math.sqrt((w.nx - w.lx) ^ 2 + (w.nz - w.lz) ^ 2) }
        Tow.phase(w, 'carry', 'tow: ...and it is taken to your nose gear.')
      end
    elseif w.phase == 'carry' then
      local c = w.carry
      local q = smooth(k * TOW.carrySpeed / math.max(c.len, 0.5))
      w.lx, w.lz = c.x + (w.nx - c.x) * q, c.z + (w.nz - c.z) * q
      w.ux, w.uz = math.cos(c.a + c.da * q), math.sin(c.a + c.da * q)
      w.lugUp = B.wheelUp + (Tow.axleUp() - B.wheelUp) * smooth((q - 0.8) / 0.2) -- (up to the axle at the end)
      if q >= 1 then
        w.bar, w.clamped = 'gear', true
        Tow.phase(w, 'clamp', 'tow: the chain is tightened: the bar\'s arms close and its pins go into your nose wheel\'s axle.')
      end
    elseif w.phase == 'clamp' then
      w.theta = B.thetaMax + (w.thetaIn - B.thetaMax) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.theta = w.thetaIn
        Tow.phase(w, 'lift', 'tow: the bar is lifted to the tractor\'s hitch height.')
      end
    elseif w.phase == 'lift' then
      w.ringUp = B.ringRest + (TOW.hitchUp - B.ringRest) * smooth(k / TOW.liftT)
      if k >= TOW.liftT then
        w.ringUp = TOW.hitchUp
        w.back = { x = d.x, z = d.z, hx = d.hx, hz = d.hz, len = math.sqrt((w.hitchAt.x - d.x) ^ 2 + (w.hitchAt.z - d.z) ^ 2), u = 0 }
        if w.arc then
          -- (backing onto the ring on a quarter circle, from the lane: w.arc = { cx, cz, r, a0, a1 }: the tractor's own
          -- point goes round the centre from angle a0 to a1; it points along the circle, backwards)
          w.back.arc, w.back.len = w.arc, math.abs(w.arc.a1 - w.arc.a0) * w.arc.r
        end
        Tow.phase(w, 'backup', 'tow: the tractor backs onto the bar\'s ring.')
      end
    elseif w.phase == 'backup' then
      local b = w.back
      b.u = math.min(1, b.u + TOW.backSpeed * dt / math.max(b.len, 0.5))
      local q = smooth(b.u)
      if b.arc then
        local a = b.arc.a0 + (b.arc.a1 - b.arc.a0) * q
        local sg = b.arc.a1 >= b.arc.a0 and 1 or -1
        d.x, d.z = b.arc.cx + b.arc.r * math.cos(a), b.arc.cz + b.arc.r * math.sin(a)
        d.hx, d.hz = sg * math.sin(a), -sg * math.cos(a) -- (against the way it goes round: it backs)
        d.v = -TOW.backSpeed
      else
        d.x, d.z = b.x + (w.hitchAt.x - b.x) * q, b.z + (w.hitchAt.z - b.z) * q
        d.hx, d.hz = Tow.unit(b.hx + (w.hitchAt.hx - b.hx) * q, b.hz + (w.hitchAt.hz - b.hz) * q)
      end
      if b.u >= 1 then
        if b.arc then d.x, d.z, d.hx, d.hz, d.v = w.hitchAt.x, w.hitchAt.z, w.hitchAt.hx, w.hitchAt.hz, 0 end
        w.bar = 'both'
        Tow.phase(w, 'hooked', 'tow: hooked up. Brakes OFF and hands off: you are pulled in ' .. TOW.pause .. ' seconds.')
      end
    elseif w.phase == 'hooked' then
      if k >= TOW.pause and not w.pull then
        -- (an aircraft that stands in line with its place already: pushed straight back, no pull)
        local okp, whyp = Tow.Fd.pushBegin(w)
        if okp then
          Tow.phase(w, 'push', w.pushText or string.format('tow: pushed straight back into %s, tail first.', w.dest.name))
        else
          Tow.phase(w, 'arrived', string.format('tow: not moved: the push into %s cannot be driven (%s).', w.dest.name, tostring(whyp)))
        end
      elseif k >= TOW.pause then
        d.cap = nil
        Tow.path(w, w.pull, TOW.speed, TOW.fastTow)
        d.turnR = w.towR
        Tow.phase(w, 'pull', string.format('tow: under way to %s.', w.dest.name))
      end
    elseif w.phase == 'pull' then
      -- (w.pushRetryAt: a demo tow whose push could not begin where the pull ended holds there, on the bar, and asks
      -- again every TOW.pushRetry seconds: below)
      if w.pushRetryAt and w.clock < w.pushRetryAt then
        d.v = 0
      elseif Tow.drive(d, dt) then
        d.turnR = nil
        if w.push then
          -- (a deck spot: the tractor has pulled the jet past it and now pushes it back in, tail first)
          local okp, whyp = Tow.Fd.pushBegin(w)
          if okp then
            if w.pushWaitFrom then
              logLine(string.format('tow%s: the push into %s begins after all, %.0f s later', w.name and (' ' .. tostring(w.name)) or '', tostring(w.dest.name), w.clock - w.pushWaitFrom))
              w.pushWaitFrom, w.pushRetryAt = nil, nil
            end
            Tow.phase(w, 'push', w.pushText or string.format('tow: past %s. Now the tractor pushes you back into it, tail first: hands off.', w.dest.name))
          else
            -- (THE TOW STANDS BENT WHERE THE PULL ENDED ("the bar would fold against the tractor", "the nose wheel would
            -- be turned ..."): in the deck spotting demo a tractor that had given way to another in the middle of its
            -- pull ended it more bent than the plan had it, and its aircraft was left 19 m short of its spot (the rig,
            -- 2026-11-18). It is drawn 5 m straight on, the way the tractor points, to straighten, and the push is asked
            -- for again: twice at the most, and only onto deck that is there.)
            local tries = w.pushTries or 0
            local ax, az = d.x + d.hx * 5, d.z + d.hz * 5
            local bent = tostring(whyp):find('fold against', 1, true) or tostring(whyp):find('nose wheel would be turned', 1, true)
            if bent and tries < 2 and Tow.Fd.on(ax, az, 1.2) then
              w.pushTries = tries + 1
              logLine(string.format('tow%s: the push into %s cannot begin as the tow stands (%s): drawn 5 m straight on to straighten it, then asked again', w.name and (' ' .. tostring(w.name)) or '', tostring(w.dest.name), tostring(whyp)))
              Tow.path(w, { { d.x, d.z }, { ax, az } }, TOW.speed)
              d.turnR = w.towR
            elseif w.keepBar and w.clock - (w.pushWaitFrom or w.clock) < TOW.pushWait then
              -- (THE DECK SPOTTING DEMO'S TOWS DO NOT GIVE UP HERE: the user's run of 2026-11-26: a hangar tow to elevator
              -- 1 whose pull ended exactly as in the run before was refused its push ("the bar would fold against the
              -- tractor": the planner held it against what stood round it then), unhooked short of the platform, and
              -- the demo took the aircraft up through the hangar's ceiling with the platform. It holds on the bar and
              -- asks again every TOW.pushRetry seconds, for TOW.pushWait seconds; then it stops short as before)
              if not w.pushWaitFrom then
                w.pushWaitFrom = w.clock
                logLine(string.format('tow%s: the push into %s cannot begin as the tow stands (%s): it holds on the bar and asks again every %d s', w.name and (' ' .. tostring(w.name)) or '', tostring(w.dest.name), tostring(whyp), TOW.pushRetry))
              end
              w.pushRetryAt = w.clock + TOW.pushRetry
              d.v = 0
            else
            w.pushShort = true
            Tow.phase(w, 'arrived', string.format('tow: stopped short of %s: the push into it cannot be driven from here (%s). Set the parking brake, then F10 > Tow > Unhook.', w.dest.name, tostring(whyp)))
            end
          end
        else
          Tow.phase(w, 'arrived', Tow.arrivedText(w))
        end
      end
    elseif w.phase == 'push' then
      if Tow.Fd.pushStep(w, dt) then Tow.phase(w, 'arrived', Tow.arrivedText(w)) end
    elseif w.phase == 'arrived' then
      -- (a parked aircraft has no pilot to set a brake and ask: the tractor unhooks by itself and drives home)
      -- (w.hold: the deck spotting demo's: an aircraft drawn up short of a hangar door, its tractor still on the bar,
      -- until its elevator is down: the demo then gives the tow its push and takes the hold off)
      if w.subj and w.bar == 'both' and k >= 2 * TOW.pause and not w.hold then Tow.unhook(w) end
    elseif w.phase == 'ringoff' then
      -- UNHOOKING, in the order the user gave (2026-11-16): "disconnect from tug. Disconnect from aircraft. Connect to
      -- tug. Drive away." 1: the ring is lifted off the pintle and set down on its foot (the pins still in the axle)...
      w.ringUp = TOW.hitchUp + (B.ringRest - TOW.hitchUp) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.ringUp = B.ringRest
        -- (w.offAt: the demo's: how much further it goes on the same line before anything else (a tractor that has
        -- put an aircraft on a platform: off the platform first, the way it stands, at twice the pace it backs off
        -- the bar: the user, 2026-11-20: "its priority should be getting off the elevator ASAP so the elevator can
        -- ascend"). Along w.d's heading: away from the aircraft, on either hitch.)
        local more = (w.keepBar and w.offAt) and (w.offAt(w) or 0) or 0
        w.offMore = more > 0 and more or nil
        Tow.path(w, { { d.x, d.z }, { d.x + d.hx * (TOW.clearBar + more), d.z + d.hz * (TOW.clearBar + more) } }, more > 0 and 2 * TOW.backSpeed or TOW.backSpeed)
        Tow.phase(w, 'moveup', more > 0 and string.format('tow: ...the tractor moves %.1f m straight off the platform...', TOW.clearBar + more) or 'tow: ...the tractor moves up to make room...')
      end
    elseif w.phase == 'moveup' and w.keepBar then
      -- (the bar stays on the aircraft: the tractor is free; where it goes next is the demo's to say: w.onFree gives
      -- its way, or it moves 8 m on)
      -- (w.onFree may say "not yet" (its third result): the tractor stands where it is and asks again)
      if Tow.drive(d, dt) then
        local way, fast, wait = nil, nil, nil
        if w.onFree then way, fast, wait = w.onFree(w) end
        -- (w.freeWait: it stands off the bar and only waits for its way on: the demo's to know (its tow is over))
        w.freeWait = wait and true or nil
        if not wait then
          d.cap = w.soloCap
          Tow.path(w, way or { { d.x, d.z }, { d.x + d.hx * 8, d.z + d.hz * 8 } }, TOW.speed, fast)
          -- (w.startBack: the demo's: it backs first (w.backOut, w.solo): it stood facing the aircraft, on its front hitch)
          Tow.phase(w, w.startBack and 'backout' or 'leave', 'tow: unhooked: the tractor drives off.')
          w.startBack = nil
        end
      end
    elseif w.phase == 'moveup' then
      -- ...and the tractor moves up by as much as the bar must come forward to clear the nose wheels
      if Tow.drive(d, dt) then Tow.phase(w, 'release', 'tow: ...the chain is let go: the bar\'s arms open and its pins come out of your nose wheel\'s axle...') end
    elseif w.phase == 'release' then
      -- 2: off the aircraft: the arms open (the pins out of the axle's ends)...
      w.theta = w.thetaIn + (B.thetaMax - w.thetaIn) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.theta, w.clamped, w.bar = B.thetaMax, false, 'free'
        Tow.phase(w, 'setdown', 'tow: ...its head end is set down on its own wheels...')
      end
    elseif w.phase == 'setdown' then
      -- ...its head end down on its own wheels...
      w.lugUp = Tow.axleUp() + (B.wheelUp - Tow.axleUp()) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.lugUp = B.wheelUp
        -- ...and it is rolled forward, its heads clear of the nose wheels, until its ring (once the arms are closed
        -- again) lies under the tractor's pintle: where its pin end then is
        local hx, hz = d.x - d.hx * TOW.hitch, d.z - d.hz * TOW.hitch
        local ux, uz = Tow.unit(hx - w.lx, hz - w.lz)
        local flEnd = math.sqrt(Tow.pins(0) ^ 2 - (B.wheelUp - TOW.hitchUp) ^ 2)
        local c = { x = w.lx, z = w.lz, ux0 = w.ux, uz0 = w.uz, ux = ux, uz = uz, tx = hx - ux * flEnd, tz = hz - uz * flEnd }
        c.len = math.sqrt((c.tx - c.x) ^ 2 + (c.tz - c.z) ^ 2)
        w.roll = c
        Tow.phase(w, 'roll', 'tow: ...it is rolled clear of your nose wheels, up to the tractor...')
      end
    elseif w.phase == 'roll' then
      local c = w.roll
      local q = smooth(k * TOW.carrySpeed / math.max(c.len, 0.5))
      w.lx, w.lz = c.x + (c.tx - c.x) * q, c.z + (c.tz - c.z) * q
      w.ux, w.uz = Tow.unit(c.ux0 + (c.ux - c.ux0) * q, c.uz0 + (c.uz - c.uz0) * q)
      if q >= 1 then Tow.phase(w, 'close', 'tow: ...its arms are closed...') end
    elseif w.phase == 'close' then
      w.theta = B.thetaMax * (1 - smooth(k / TOW.step))
      if k >= TOW.step then
        w.theta = 0
        Tow.phase(w, 'ringon', 'tow: ...and its ring is put back on the tractor\'s pintle.')
      end
    elseif w.phase == 'ringon' then
      -- 3: back on the tractor: the ring lifted onto the pintle; 4: away
      w.ringUp = B.ringRest + (TOW.hitchUp - B.ringRest) * smooth(k / TOW.step)
      if k >= TOW.step then
        w.ringUp, w.bar = TOW.hitchUp, 'tug'
        local home = w.deck == 'flight' and Tow.Fd.homeWay(w) or nil
        Tow.path(w, home or { { d.x, d.z }, { d.x + d.hx * 8, d.z + d.hz * 8 } }, TOW.speed, home and TOW.fastSolo or nil)
        Tow.phase(w, 'leave', home and 'tow: unhooked: the bar is back on the tractor, which drives back to its place aft of the island.'
          or 'tow: unhooked: the bar is back on the tractor, which moves 8 m on and waits there.')
      end
    elseif w.phase == 'leave' then
      if w.bar ~= 'tug' then w.ringUp = math.max(B.ringRest, w.ringUp - (TOW.hitchUp - B.ringRest) / TOW.step * dt) end -- (a bar left behind: its ring set down)
      if Tow.drive(d, dt) and k >= TOW.step then Tow.phase(w, 'parked', w.bar == 'tug' and 'tow: the tractor is parked, the bar on its pintle.' or 'tow: the tractor is parked.') end
    end
  end
  Tow.follow(w)
  if w.paused then break end
  end
  if env then Tow.Fd.inside, Tow.Fd.wall, Tow.Fd.blocks = nil, nil, nil end
  return Tow.apply(w, ctx, total)
end

local function tickTow(t)
  Tow.Fd.inside, Tow.Fd.wall, Tow.Fd.blocks = nil, nil, nil
  local w = tow
  if not w or not native or not towIds then return end
  local ctx = Tow.ctx(t, w.subj and w.ship or nil)
  if not ctx then
    w.last = Tow.now()
    return
  end
  local ok, err = Tow.tickOne(w, ctx, Tow.now())
  if not ok then
    logLine('tow: STOPPED: ' .. tostring(err))
    say('the tow is stopped: ' .. tostring(err))
    tow = nil
  end
end

-- For the deck spotting demo (crewtest_demo.lua), which runs on the carrier the camera is at, not the player's: the
-- catapult crews walked out of the way, the bow bubble lowered, an elevator sent down or brought up: each through
-- someone on THAT ship (the hook's own commands ask through the player's ship). ctx: that ship (Tow.Deck.ctx).
Tow.Aux = {}

-- someone on the ship to ask through: the recorder's people, after a look at that ship
function Tow.Aux.handle(ctx)
  local h = shipHandle()
  if not h and ctx then
    doScan(ctx, 'for the demo', false)
    h = shipHandle()
  end
  return h
end

-- the four catapult crews walked to `places` ([cat] = { x, z }: the first of six, 2 m apart in two rows of three);
-- how many were sent, how many crews were found
function Tow.Aux.crewsAway(ctx, places)
  local r = doScan(ctx, 'for the demo: the catapult crews', false)
  local t = catCrews(r)
  if not t then return 0, 0 end
  rememberCrews(t)
  local sent, crews = 0, 0
  for cat = 1, 4 do
    local c = t.byCat[cat]
    if c and places[cat] then
      crews = crews + 1
      local members, deckY = crewMembers(r, c.i), -1e9
      for _, q in ipairs(members) do deckY = math.max(deckY, q.y) end
      local k = 0
      for _, q in ipairs(members) do
        if q.y >= deckY - 0.5 then -- (a man on the catwalk below the deck is left where he is)
          k = k + 1
          if not crewHome[q.h] then
            local okh, _, x, _, z, _, fx, fz = pcall(native.state, q.h, true)
            crewHome[q.h] = { x = (okh and x) or q.x, z = (okh and z) or q.z, fx = (okh and fx) or 0, fz = (okh and fz) or 0, name = tostring(q.name), cat = cat }
          end
          local tx, tz = places[cat][1] + ((k - 1) % 3) * 2, places[cat][2] + (k > 3 and 2 or 0)
          holding[q.h] = nil
          local okw, res = walkOrder(q.h, tx, tz, 0, 0, ctx.s, q.name)
          if okw and res then sent = sent + 1 end
        end
      end
    end
  end
  return sent, crews
end

-- both bubbles lowered and kept down (true), or let go again
function Tow.Aux.bubbles(ctx, down)
  local h = Tow.Aux.handle(ctx)
  if not h then return false end
  if down then bowWhy.demo = true else bowWhy.demo = nil end
  bowBubbleUpdate(h)
  local st = bubbleSet(h, BUBBLE.waist, down and BUBBLE.down or BUBBLE.up)
  bubbleKeep[BUBBLE.waist] = (down and st) and { cmd = BUBBLE.down, n = 0 } or nil
  return true
end

-- elevator k (1..4) sent down (its hangar door opened, the command kept) or brought up (by the hook's own raising,
-- its door left open): true, or nil and why
function Tow.Aux.elevator(ctx, k, cmd)
  local h = Tow.Aux.handle(ctx)
  if not (h and native.elevator) then return nil, 'nobody on the ship to ask through, or an older native module' end
  local c = ELEV_CMD[cmd]
  local okc, st, e = pcall(native.elevator, h, k - 1, c)
  if not okc or st == nil then return nil, tostring(okc and e or st) end
  elevWait[k] = nil
  elevKeep[k - 1] = cmd == 'down' and { cmd = c, n = 0 } or nil
  ELEV_DOOR.letGo(k - 1)
  -- (the door too on the mission's clock: the user runs the demo at several times speed)
  doorOpen[k - 1] = (cmd == 'down' and native.shiparg) and { arg = ELEV_DOOR.args[k], t = Tow.now(), t0 = Tow.now(), clock = Tow.now } or nil
  -- (model: the demo's elevators come up on the mission's clock, as its tows run: under time acceleration a platform
  -- raised on real time took a minute and a half of the mission's; 2026-11-18, the user's run)
  elevRise[k - 1] = (cmd == 'up' and native.shiparg) and { t = Tow.now(), t0 = Tow.now(), model = true, clock = Tow.now } or nil
  logLine(string.format('demo: elevator %d <- %s (state now: %s)', k, cmd, ELEV_STATE[st] or tostring(st)))
  return true
end

-- how far down elevator k's platform is, as the ship's model has it (its argument: 0 up .. 1 down), or nil
function Tow.Aux.platform(ctx, k)
  local h = Tow.Aux.handle(ctx)
  if not (h and native.shiparg) then return nil end
  local okc, v = pcall(native.shiparg, h, ELEV_DOOR.plat[k])
  return (okc and type(v) == 'number') and v or nil
end

-- what the 'arrived' phase says: how near the place the jet was left
function Tow.arrivedText(w)
  local g = w.dest
  return string.format('tow: stopped%s. You are %.1f m from the place and %.0f degrees off its heading; the nose wheel turned at most %.0f degrees. Set the parking brake, then F10 > Tow > Unhook.',
    g.short and (' at ' .. g.short) or '', math.sqrt((w.jx - g.x) ^ 2 + (w.jz - g.z) ^ 2), math.deg(math.acos(math.max(-1, math.min(1, w.jfx * g.fx + w.jfz * g.fz)))), math.abs(w.maxSteer or 0))
end

-- mode: 'hangar' (from a lowered elevator into the hangar: the first tow test), or ON THE FLIGHT DECK 'cat' (arg: the
-- catapult, 1..4) or 'spot' (arg: the deck spot's number): Tow.Fd plans those
-- who == 'lock' (2026-11-17, the user: "send a tow crew to any aircraft spotted on the deck by using the UI to click on
-- an aircraft ... and then issuing a tow instruction"): not the player's jet but THE PARKED AIRCRAFT THE DECK TOOL IS
-- LOCKED ON (w.subj): one of its static Hornets, on the deck tool's carrier (the one the camera was at: the player's
-- jet need not be on it). It is moved as the tractor is (a static that is the ship's child, through its own position
-- setter in the ship's frame: native.staticpos) where the player's jet is moved by ForcePosition; where it then stands
-- is kept on its deck entry (e.at: Tow.Deck.pose); with nobody in it to set a brake, the tractor unhooks by itself at
-- the place and drives home.
-- dry: nothing is started: the tow is planned (the tractor's way to the aircraft, the pull, the push) and what would
-- be driven, or why not, is said ("tow|trycat|N" / "tow|tryspot|n", not on the menu: the tests' sweep)
function Tow.begin(mode, arg, who, dry)
  if not native then return say('the native module is not loaded: ' .. tostring(nativeWhy)) end
  if not (native.staticpos and native.place and native.forcepos) then return say('towing needs the newer native module: run crew-test\\install.ps1 with DCS closed') end
  -- (a tractor on its way home with its bar, or parked, can be called again at once)
  if tow and tow.phase ~= 'parked' and tow.phase ~= 'arrived' and not (tow.phase == 'leave' and tow.bar == 'tug') then return say('a tow is under way already (F10 > Tow > Unhook ends it)') end
  if tow and tow.phase == 'arrived' and tow.bar ~= 'tug' then
    return say(tow.subj and 'the tractor is still hooked up to the aircraft it towed: it unhooks by itself in a moment.' or 'the tractor is still hooked up to you: F10 > Tow > Unhook first.')
  end
  local ctx, err, subj
  if who == 'lock' then
    local D = Tow.Deck
    local e = D.list and D.shown and D.lock and D.list[D.lock] or nil
    if not e then return say('tow: no aircraft is selected: park the Hornets (Deck spots > Park Hornets), then click the one to tow.') end
    if e.removed or not e.id then return say('tow: no aircraft stands there to tow (' .. D.text(e) .. ').') end
    if e.hangar then return say('tow: the hangar\'s aircraft are there to be spotted, not towed (' .. D.text(e) .. ').') end
    if mode == 'hangar' then return say('tow: only your own jet is towed into the hangar.') end
    ctx, err = D.ctx()
    if not ctx then return say('tow: ' .. tostring(err)) end
    subj = { e = e, id = e.id, name = D.label(e) }
  else
    ctx, err = getCtx()
    if not ctx then return say("can't tell where you are: " .. tostring(err)) end
  end
  -- the aircraft to tow: where it stands on the ship (J.y: its own position above the ship's origin) and its nose
  local J = { x = ctx.jx, y = ctx.jy, z = ctx.jz, fx = ctx.fx, fz = ctx.fz, ship = ctx.ship }
  if subj then
    local x, z, hdg = Tow.Deck.pose(subj.e)
    J = { x = x, y = Tow.Deck.jy, z = z, fx = math.cos(math.rad(hdg)), fz = math.sin(math.rad(hdg)), ship = ctx.ship }
    -- what DCS says of it: is it an object the native module can place (and the ship's child, as the tractor is)?
    local oki, cls, kd, parent = pcall(function() return native.staticinfo(subj.id) end)
    if not (oki and cls) then
      logLine(string.format('tow: %s (object %s) cannot be towed: %s', subj.name, tostring(subj.id), tostring(kd or cls)))
      return say('tow: DCS does not let this aircraft be moved (' .. tostring(kd or cls) .. ').')
    end
    subj.own = type(parent) == 'string' or nil
    -- its own height on the ship, as DCS has it (the mission script reads the object; else a parked jet's, Tow.Deck.jy)
    local okw, r = pcall(dostring, string.format('return (CATCC_CR and CATCC_CR.where) and CATCC_CR.where(%q, %q) or "ERR|the menu script is an older one"', tostring(subj.e.key), tostring(ctx.ship)))
    local p = (okw and type(r) == 'string') and split(r) or { 'ERR', tostring(r) }
    local wy = p[1] == 'OK' and tonumber(p[3]) or nil
    if wy and math.abs(wy - Tow.Deck.jy) < 1.5 then J.y = wy end
    logLine(string.format('tow: the aircraft to tow: %s (object %d, class %s, %s); the deck tool has it at %.2f / %.2f, nose %.1f; DCS says %s; its height taken as %.3f', subj.name, subj.id, tostring(cls),
      subj.own and ('the ship\'s child: ' .. tostring(parent)) or 'NO PARENT: placed in the world', x, z, hdg,
      p[1] == 'OK' and string.format('%.2f fwd %.3f up %.2f stbd, nose %.3f %.3f', tonumber(p[2]) or 0, tonumber(p[3]) or 0, tonumber(p[4]) or 0, tonumber(p[5]) or 0, tonumber(p[6]) or 0) or ('nothing (' .. tostring(p[2]) .. ')'), J.y))
    if not shipHandle() then doScan(ctx, 'for the tow', false) end
  end
  local below = J.y <= TOW.hangarBelow
  if mode == 'hangar' and not below then
    return say(string.format('the tow into the hangar starts on the hangar deck: ride elevator 1 down first (you are %.1f m above the ship\'s origin; the hangar deck is below %d). Up here: F10 > Tow > Tow me to a catapult / to a parking spot.', J.y, TOW.hangarBelow))
  end
  if mode ~= 'hangar' and below then
    return say('you are on the hangar deck: a tow to a catapult or a deck spot starts on the flight deck. Down here: F10 > Tow > Tow me into the hangar.')
  end
  local id = subj and subj.id or ((Export and Export.LoGetPlayerPlaneId) and select(2, pcall(Export.LoGetPlayerPlaneId)) or nil)
  if type(id) ~= 'number' then return say("your aircraft's object id could not be read (no LoGetPlayerPlaneId)") end
  local ids, why = Tow.ids(subj and ctx.ship or nil)
  if not ids then return say('the tow tractor could not be made: ' .. tostring(why)) end
  local fx, fz = Tow.unit(J.fx, J.fz)
  local nx, nz = J.x + fx * TOW.noseGear, J.z + fz * TOW.noseGear -- the nose wheel's axle
  -- the other aircraft on this deck the tractor is to keep clear of on its own ways (Tow.Fd.arrival, homeWay): the
  -- deck tool's, and the player's own jet when another aircraft is towed
  local others = Tow.Deck.others(subj and subj.e, ctx.ship)
  local me
  if subj and ctx.jy > TOW.hangarBelow and insideDeck(ctx.jx, ctx.jz) then
    local mid = (Export and Export.LoGetPlayerPlaneId) and select(2, pcall(Export.LoGetPlayerPlaneId)) or nil
    me = { x = ctx.jx, z = ctx.jz, fx = ctx.fx, fz = ctx.fz, name = 'your own jet', half = Tow.Fd.half(type(mid) == 'number' and mid or nil) }
    others[#others + 1] = me
  end
  -- the towed aircraft's own wing: a parked one's as the deck tool has them; the player's read from the jet
  local half = subj and (Tow.Deck.fold and 4.2 or 6.3) or Tow.Fd.half(id)
  -- hooked up: the bar's arms closed on the axle, its ring on the hitch
  local thetaIn = Tow.thetaIn()
  local alongIn, halfIn = Tow.pins(thetaIn)
  local reach = math.sqrt(alongIn ^ 2 - (Tow.axleUp() - TOW.hitchUp) ^ 2) + TOW.hitch
  local old = tow
  local home = below and TOW.home or TOW.deckHome
  local deck = below and 'hangar' or 'flight'
  -- the tractor: where the last tow left it, if that was on this deck; else at this deck's waiting place
  local d0 = (old and old.d and old.d.deck == deck) and old.d or { x = home.x, z = home.z, hx = home.hx, hz = home.hz, deck = deck, fresh = true }
  local plan, arrive, backOut
  if below then
    -- where the jet's nose line meets the lane to the parking place
    local g = TOW.spot
    local ex, ez = g.x + g.fx * (TOW.noseGear + reach), g.z + g.fz * (TOW.noseGear + reach) -- where the tractor ends up
    local den = fx * g.fz - fz * g.fx
    if math.abs(den) < 0.3 then return say('this first tow test pulls you straight ahead into the hangar and then along its port lane: your nose points along the lane, not into the hangar.') end
    local u = ((ex - nx) * g.fz - (ez - nz) * g.fx) / den -- from the nose wheel to the corner, along the nose
    local cx, cz = nx + fx * u, nz + fz * u
    local wAlong = (ex - cx) * g.fx + (ez - cz) * g.fz -- from the corner to the tractor's end place, along the lane
    if u < reach + TOW.ahead + 4 or wAlong < 10 then
      return say(string.format('this first tow test needs the lane to the parking place ahead of your nose: it is %.0f m ahead (at least %.0f needed) and the place %.0f m along it (at least 10).', u, reach + TOW.ahead + 4, wAlong))
    end
    plan = { pull = { { nx + fx * reach, nz + fz * reach }, { cx, cz }, { ex, ez } }, dest = g,
      text = string.format('straight ahead %.0f m, a turn, %.0f m along the hangar to %s', u - reach, wAlong, g.name),
      note = string.format('corner %.1f / %.1f; tractor ends %.1f / %.1f', cx, cz, ex, ez) }
    -- the arrival: towards the jet beside its nose line, a U-turn onto the line clear of the radome, and on to `ahead`
    -- metres beyond the hook-up place (the bar trailing straight behind by then)
    local side = ((d0.x - nx) * -fz + (d0.z - nz) * fx) >= 0 and 1 or -1 -- the side of the nose line the tractor is on
    local px, pz = -fz * side * TOW.uTurn, fx * side * TOW.uTurn
    local a0 = reach + TOW.clearNose
    arrive = { { d0.x, d0.z }, { nx + fx * (a0 + 9) + px, nz + fz * (a0 + 9) + pz }, { nx + fx * a0 + px, nz + fz * a0 + pz }, { nx + fx * a0, nz + fz * a0 },
      { nx + fx * (reach + TOW.ahead), nz + fz * (reach + TOW.ahead) } }
  else
    local whyNot
    plan, whyNot = Tow.Fd.plan(J, mode, arg, reach, fx, fz, nx, nz, subj, me, others, half)
    if plan then plan.note = tostring(plan.note) .. tostring(plan.room or '') end
    if not plan then
      logLine('tow: no plan: ' .. tostring(whyNot))
      return say(Tow.words({ subj = subj }, tostring(whyNot)))
    end
    arrive, whyNot, backOut = Tow.Fd.arrival(d0, { x = J.x, z = J.z, fx = fx, fz = fz }, nx, nz, fx, fz, reach, others)
    if not arrive and not d0.fresh then
      -- LAST RESORT: from where the tractor was left there is no way at all (not even backing out first): it starts
      -- again from its waiting place (it is put there: said, and logged)
      local h0 = { x = home.x, z = home.z, hx = home.hx, hz = home.hz, deck = deck, fresh = true }
      local arr2, _, back2 = Tow.Fd.arrival(h0, { x = J.x, z = J.z, fx = fx, fz = fz }, nx, nz, fx, fz, reach, others)
      if arr2 then
        logLine(string.format('tow: from where the tractor stands (%.1f / %.1f, heading %.2f %.2f) there is no way to the aircraft (%s): it is put back on its waiting place and starts from there', d0.x, d0.z, d0.hx, d0.hz, tostring(whyNot)))
        if not dry then say('tow: the tractor has no way out of where it was left: it starts again from its waiting place.') end
        d0, arrive, backOut = h0, arr2, back2
      end
    end
    if not arrive then
      logLine('tow: no way for the tractor to the jet: ' .. tostring(whyNot))
      return say(Tow.words({ subj = subj }, 'no tow from here: ' .. tostring(whyNot) .. '.'))
    end
  end
  if dry then
    logLine('tow: a dry run: ' .. tostring(plan.note))
    return say('tow: can be driven: ' .. tostring(plan.text) .. '.')
  end
  -- (floor: the deck the aircraft stands on, above the ship's origin; a parked aircraft's own height may differ from the
  -- player's jet's: the flight deck is then taken from the height a parked jet has, Tow.Deck.jy)
  local w = { phase = 'arrive', t0 = Tow.now(), jet = id, bar = 'tug', theta = 0, clamped = false, thetaIn = thetaIn, jy = J.y, floor = (subj and Tow.Deck.jy or J.y) - TOW.gearUp, nx = nx, nz = nz,
    mx = J.x - fx * TOW.mainGear, mz = J.z - fz * TOW.mainGear, jx = J.x, jz = J.z, jfx = fx, jfz = fz, hitchAt = { x = nx + fx * reach, z = nz + fz * reach, hx = fx, hz = fz },
    deck = deck, dest = plan.dest, push = plan.push, pushText = plan.pushText, towR = (not below) and TOW.towR or nil, subj = subj, ship = ctx.ship, others = others, half = half, soft = plan.soft }
  w.d = d0
  if d0.fresh then
    d0.fresh = nil
    logLine(string.format('tow: the tractor starts from its waiting place on the %s deck (%.0f m forward, %.0f m to starboard)', deck, d0.x, d0.z))
  end
  w.d.v, w.d.turnR = 0, nil
  -- the bar on the tractor's pintle, closed, trailing straight behind it on its own wheels
  w.ux, w.uz, w.ringUp, w.lugUp = w.d.hx, w.d.hz, TOW.hitchUp, TOW.bar.wheelUp
  do
    local fl = Tow.flat(w)
    w.lx, w.lz = w.d.x - w.d.hx * (TOW.hitch + fl), w.d.z - w.d.hz * (TOW.hitch + fl)
  end
  w.driver = old and old.driver
  Tow.path(w, arrive, TOW.speed, deck == 'flight' and TOW.fastSolo or nil)
  if backOut and backOut > 0 then w.phase, w.backOut = 'backout', { len = backOut, s = 0, v = 0 } end
  w.pull = plan.pull
  if not w.driver then
    local r = doScan(ctx, 'for the tow', false)
    for _, q in ipairs(r and r.mine or {}) do
      -- (catcc-t0 if he is there; else another of the drivers)
      if kind(q) == 'ours' and role(q) == 'driver' and (not w.driver or tostring(q.name) == 'catcc-t0') then w.driver = { h = q.h, name = tostring(q.name) } end
    end
    if w.driver then
      walkQueue[w.driver.h], holding[w.driver.h] = nil, nil
      -- (his head turns if it can: then he sits in the blend space of ours, not in the plain seated pose)
      local headOn, headWhy
      if Tow.Head then headOn, headWhy = Tow.Head.seat(native, w.driver) end
      local sat, why = headOn and Tow.Head.ANIM or nil, nil
      if not headOn then sat, why = Tow.sit(native, w.driver.h) end
      logLine(string.format('tow: the driver is %s; seated pose "%s": %s%s', w.driver.name, sat or TOW.seatAnim, sat and 'played' or ('FAILED: ' .. tostring(why)),
        headOn and '; his head turns' or (Tow.Head and ('; his head does not turn: ' .. tostring(headWhy)) or '')))
    else
      logLine('tow: no driver (catcc-t0 is not on the ship: data patch applied?)')
    end
  end
  tow = w
  logLine(string.format('tow: begins. Jet at %.1f fwd %.1f up %.1f stbd, nose %.2f %.2f; floor taken as %.2f; the axle taken %.3f m ahead of the jet and %.3f m below it (%.3f above the floor), %.3f m long: at %.1f / %.1f; the bar\'s pins in it with its arms open %.2f degrees (pin tips %.3f m either side; argument %.3f), the ring then %.3f m from the axle on the flat; hook-up place %.1f / %.1f; %s; tractor now %.1f / %.1f',
    J.x, J.y, J.z, fx, fz, w.floor, TOW.noseGear, TOW.axleDown, Tow.axleUp(), TOW.axleLen, nx, nz, math.deg(thetaIn), halfIn, Tow.armArg(thetaIn, true), reach - TOW.hitch,
    w.hitchAt.x, w.hitchAt.z, plan.note, w.d.x, w.d.z))
  if subj then
    logLine(string.format('tow: of a parked aircraft: %s on %s; %d other aircraft on the deck', subj.name, tostring(ctx.ship), #others))
    return say(Tow.words(w, string.format('tow: the tractor is coming with the tow bar%s%s for %s. Then: %s; there it unhooks and drives home.',
      w.driver and '' or ' (no driver: catcc-t0 not found)', ids.bar and '' or ' (no tow bar: its type is missing)', subj.name, plan.text)))
  end
  say(string.format('tow: the tractor is coming with the tow bar%s%s. Nose wheel steering OFF; parking brake on until it is hooked up. Then: %s.',
    w.driver and '' or ' (no driver: catcc-t0 not found)', ids.bar and '' or ' (no tow bar: its type is missing)', plan.text))
end

function commands.tow(what, a, b)
  if what == 'hangar' then return Tow.begin('hangar') end
  -- (b == 'lock': not the player's jet but the parked aircraft the deck tool is locked on: the panel's Tow page)
  if what == 'cat' or what == 'spot' then return Tow.begin(what, tonumber(a), b) end
  if what == 'trycat' or what == 'tryspot' then return Tow.begin(what:sub(4), tonumber(a), b, true) end
  if what == 'way' then
    -- (not on the menu) PriFly's own taxi way from where the jet stands to a destination ("C1".."C4", a spot's id), as
    -- Tow.Net works it out, written to the log point by point: a test holds it against taxiNet.ts's
    local ctx, err = getCtx()
    local g = Tow.Net.graph()
    if not (ctx and g) then return say('no taxi way: ' .. (g and tostring(err) or 'the taxi network is missing')) end
    local wp = Tow.Net.waypoints(g, { ctx.jx, ctx.jz }, tostring(a), ctx.fx, ctx.fz)
    local pts = wp and Tow.Net.smooth(wp) or {}
    local txt = {}
    for i, q in ipairs(pts) do txt[i] = string.format('%.3f,%.3f', q[1], q[2]) end
    logLine(string.format('command tow way to %s: %d points: %s', tostring(a), #pts, table.concat(txt, ' ')))
    return say(string.format('taxi way to %s: %s', tostring(a), #pts > 0 and (#pts .. ' points (in the log)') or 'none'))
  end
  if what == 'head' then
    -- the drivers' head tried by hand (F10 > Tow > Driver head): every driver on the ship, wherever he is
    if not Tow.Head then return say('driver head: Scripts\\CATCC\\crewtest_head.lua is not there.') end
    if not native then return say('driver head: the native module is not loaded.') end
    local ctx = getCtx()
    local r = ctx and doScan(ctx, 'for the drivers\' heads', false)
    local list = {}
    for _, q in ipairs(r and r.mine or {}) do
      if kind(q) == 'ours' and role(q) == 'driver' then list[#list + 1] = { h = q.h, name = tostring(q.name) } end
    end
    table.sort(list, function(p, q) return p.name < q.name end)
    local text, lines = Tow.Head.probe(native, list, tostring(a))
    for _, l in ipairs(lines or {}) do logLine(l) end
    logLine(text)
    return say(text)
  end
  local w = tow
  if what == 'seat' then
    local step = tonumber(b) or 0.1
    if a == 'fwd' then TOW.seat.fwd = TOW.seat.fwd + step elseif a == 'left' then TOW.seat.left = TOW.seat.left + step elseif a == 'up' then TOW.seat.up = TOW.seat.up + step end
    logLine(string.format('tow: driver seat now %.2f m forward, %.2f m left, %.2f m up of the tractor\'s own position', TOW.seat.fwd, TOW.seat.left, TOW.seat.up))
    return say(string.format('driver seat: %.2f m forward, %.2f m left, %.2f m up.', TOW.seat.fwd, TOW.seat.left, TOW.seat.up))
  end
  if not w then return say('no tow in hand (F10 > Tow > Tow me to a catapult / to a parking spot / into the hangar).') end
  if what == 'pause' then
    w.paused = not w.paused
    w.d.v = 0
    logLine('tow: ' .. (w.paused and 'held' or 'goes on') .. ' in phase ' .. w.phase)
    return say(w.paused and 'tow: held where it is.' or 'tow: goes on.')
  end
  if what == 'unhook' then return Tow.unhook(w) end
  if what == 'report' then
    local d = w.d
    local txt = string.format('tow: %s%s. Tractor at %.1f fwd %.1f stbd, heading %.2f %.2f, %.1f m/s; bar %s, its arms open %.1f degrees%s; nose wheel %.1f / %.1f turned %.0f degrees (at most %.0f); %s; driver %s; bar %s.',
      w.phase, w.paused and ' (held)' or '', d.x, d.z, d.hx, d.hz, d.v or 0, tostring(w.bar), math.deg(w.theta), w.clamped and ' (clamped)' or '', w.lx, w.lz, w.steer or 0, math.abs(w.maxSteer or 0),
      w.bar == 'both' and string.format('jet at %.1f / %.1f nose %.2f %.2f', w.jx, w.jz, w.jfx, w.jfz) or 'not hooked',
      w.driver and (w.driverBad and 'could not be placed' or w.driver.name) or 'none', towIds and (towIds.bar and (w.barBad and 'could not be placed' or 'drawn') or 'no type') or '?')
    logLine('command ' .. txt)
    return say(txt)
  end
  say('unknown tow command ' .. tostring(what))
end

-- ---------------------------------------------------------------- towing on the flight deck
-- The user, 2026-11-16: "make the deck tug useable on the flight deck. For now, make it so I can request a tow to
-- any other parking location on the deck, or to a catapult."
--   F10 > Tow > Tow me to a catapult > 1..4          (tow|cat|N)
--   F10 > Tow > Tow me to a parking spot > ... > it  (tow|spot|<the spot's number>)
-- The tractor waits on the flight deck in the pocket aft of the island (TOW.deckHome); it comes along the taxi roads,
-- turns round ahead of the jet's nose and is hooked up as in the hangar (the same phases). Then:
--   TO A CATAPULT   it pulls the jet along PriFly's taxi route to that catapult (Tow.Net: taxiNet.ts's own solver,
--                   here in Lua, on the graph crewtest_routes.lua carries) and on up the track, until the nose wheel
--                   is TOW.catShort short of the shuttle; the tractor itself then stands beyond the shuttle. Where
--                   the route comes onto the track too near the shuttle for the jet to be in line by then, it is
--                   pulled on past the place and pushed straight back to it (Tow.Fd.planCat).
--   TO A SPOT       jets stand on their spots tail to the deck's edge, so the jet goes in TAIL FIRST: the tractor
--                   pulls it along the taxi route PAST the spot's front (phase 'pull'), then PUSHES it back round
--                   into the spot (phase 'push'). The push is worked out from the JET's end (Tow.Fd.back): the main
--                   wheels are steered backwards along a way into the spot, and where the nose wheel, the bar and
--                   the tractor must then be follows exactly from that; it is played back at the tractor's backing
--                   pace. (The first version recorded the way OUT of the spot and played it backwards: for the two
--                   to meet, the whole 13 m of tractor, bar and jet had to stand straight where the pull ended,
--                   which takes 25 m of straight deck after every bend: of 43 tows tried, 5 could be planned.)
-- EVERY TOW IS DRIVEN IN THE HEAD FIRST (Tow.Fd.sim, the same Tow.drive and the same trailing as the real thing; and
-- Tow.Fd.back): a plan that would take the tractor or one of the jet's wheels off the deck or across a lowered
-- elevator, turn the nose wheel beyond TOW.steerMax, fold the bar against the tractor, or not bring the jet square
-- onto the spot is not driven; for a spot several ways are tried (Tow.Fd.planSpot) and the first that passes is
-- taken. If none does, the menu says why.
-- After "Unhook" the tractor drives back to its waiting place.
-- NOT LOOKED AT (yet): other aircraft. The tractor and the tow go where the roads go, whoever stands there (only
-- the jet in tow is driven round, and a spot one of the deck tool's Hornets stands on is refused). The tractor's
-- FRONT hitch (pushing with the driver facing the jet) is not used either: it pushes backing up.

-- ---- PriFly's taxi network, solved here: src/components/catcc/prifly/taxiNet.ts in Lua, on the graph the routes file
-- carries (net: nodes, adj, dest, outline, struct). A test keeps the two the same: every spot to every catapult,
-- spot to spot, and starts off the roads.
Tow.Net = { MAX_TURN = 125, TURN_COST = 0.12, OFF_ROAD = 1.5, AT_NODE = 5, SNAP_MAX = 60, NEAR_SLACK = 6, RADIUS = 8, MIN_LINEUP = 8, LINEUP_TURN = 30, MIN_PULL_OUT = 5 }

function Tow.Net.graph()
  local r = loadRoutes()
  return r and r.net or nil
end

function Tow.Net.turn(ux, uz, vx, vz) return math.deg(math.acos(math.max(-1, math.min(1, ux * vx + uz * vz)))) end
function Tow.Net.dist(a, b) return math.sqrt((a[1] - b[1]) ^ 2 + (a[2] - b[2]) ^ 2) end
function Tow.Net.dir(a, b)
  local x, z = b[1] - a[1], b[2] - a[2]
  local l = math.sqrt(x * x + z * z)
  if l == 0 then l = 1 end
  return x / l, z / l
end

function Tow.Net.inPoly(x, z, q)
  local inside, j = false, #q
  for i = 1, #q do
    local a, b = q[i], q[j]
    if ((a[2] > z) ~= (b[2] > z)) and (x < (b[1] - a[1]) * (z - a[2]) / (b[2] - a[2]) + a[1]) then inside = not inside end
    j = i
  end
  return inside
end

-- can something go straight from a to b: on the deck all the way and not through the island
function Tow.Net.legOk(g, a, b)
  local n = math.max(1, math.ceil(Tow.Net.dist(a, b) / 2))
  for i = 1, n do
    local x, z = a[1] + (b[1] - a[1]) * i / n, a[2] + (b[2] - a[2]) * i / n
    if not Tow.Net.inPoly(x, z, g.outline) then return false end
    for _, q in ipairs(g.struct) do
      if Tow.Net.inPoly(x, z, q) then return false end
    end
  end
  return true
end

-- start states for an aircraft at `from` = { x, z } (hx, hz: the way it points, or nil): its spot or junction when it
-- is on one, else the entry points on the roads near it.
-- opts (the tow's; PriFly has none): tow = true: the jet is PULLED, nose first, so it leaves a junction it stands on
-- within MAX_TURN of its nose (PriFly: any way, the pilot turns it), it counts as on a junction within 1.5 m only
-- (PriFly: 5), and it joins a road only by a leg within opts.swing (100) degrees of its nose. lineup: no sharp turn
-- within this many metres of a catapult's shuttle (PriFly: MIN_LINEUP, 8).
function Tow.Net.seeds(g, from, hx, hz, opts, wide)
  local N = Tow.Net
  local tow = opts and opts.tow
  local near, nd
  for i, p in ipairs(g.nodes) do
    local dd = N.dist(p, from)
    if dd < (tow and 1.5 or N.AT_NODE) and (not near or dd < nd) then near, nd = i, dd end
  end
  if near then return { { node = near, prev = -1, dir = (tow and hx) and { hx, hz } or nil, cost = 0, pts = { from } } } end
  local function make(maxD, checked)
    local out = {}
    for u = 1, #g.nodes do
      for _, v in ipairs(g.adj[u]) do
        if v >= u then
          local a, b = g.nodes[u], g.nodes[v]
          local dx, dz = b[1] - a[1], b[2] - a[2]
          local L = math.sqrt(dx * dx + dz * dz)
          local t = math.max(0, math.min(1, ((from[1] - a[1]) * dx + (from[2] - a[2]) * dz) / (L * L)))
          local foot = { a[1] + dx * t, a[2] + dz * t }
          local off = N.dist(from, foot)
          if off <= maxD then
            -- join ahead of abeam, the further off the further ahead
            local lead = math.max(4, math.min(14, off))
            for _, es in ipairs({ { v, 1 }, { u, -1 } }) do
              local e, sgn = es[1], es[2]
              local along = sgn > 0 and (1 - t) * L or t * L -- road left toward that end
              local ex, ez = dx / L * sgn, dz / L * sgn
              local entry = along <= lead and g.nodes[e] or { foot[1] + ex * lead, foot[2] + ez * lead }
              if not checked or N.legOk(g, from, entry) then
                local leg = N.dist(from, entry)
                local lx, lz = ex, ez
                if leg > 0.5 then lx, lz = N.dir(from, entry) end
                local join = N.turn(lx, lz, ex, ez)
                local swing = (hx and leg > 1) and N.turn(hx, hz, lx, lz) or 0
                if join <= N.MAX_TURN and not (tow and swing > (opts.swing or 100)) then
                  out[#out + 1] = { node = e, prev = -1, dir = { ex, ez }, cost = leg * N.OFF_ROAD + N.dist(entry, g.nodes[e]) + (join + swing * 0.5) * N.TURN_COST,
                    pts = (leg > 0.5 and N.dist(entry, g.nodes[e]) > 0.05) and { from, entry } or { from } }
                end
              end
            end
          end
        end
      end
    end
    return out
  end
  -- off the network it joins the nearest road: roads up to NEAR_SLACK further off than the nearest (a straight leg to
  -- a far road crosses whatever is between, the landing area included). wide: any road within SNAP_MAX (then
  -- anywhere), for when the nearest roads lead nowhere
  -- (PriFly's routes only: a tow keeps its own rules, its solved ways are tested as they are)
  if not wide and not tow then
    local nearest = math.huge
    for u = 1, #g.nodes do
      for _, v in ipairs(g.adj[u]) do
        if v >= u then
          local a, b = g.nodes[u], g.nodes[v]
          local dx, dz = b[1] - a[1], b[2] - a[2]
          local t = math.max(0, math.min(1, ((from[1] - a[1]) * dx + (from[2] - a[2]) * dz) / (dx * dx + dz * dz)))
          nearest = math.min(nearest, N.dist(from, { a[1] + dx * t, a[2] + dz * t }))
        end
      end
    end
    if nearest > N.SNAP_MAX then return {} end
    return make(nearest + N.NEAR_SLACK, true)
  end
  local s = make(N.SNAP_MAX, true)
  if #s == 0 then s = make(math.huge, false) end
  return s
end

-- the cheapest way (distance plus a cost per degree turned, no turn sharper than MAX_TURN) to destination `to`
-- ("C1".."C4", a spot's id): its corners, from first; or nil
function Tow.Net.solve(g, from, to, hx, hz, pullOut, opts, wide)
  local N = Tow.Net
  local goal = g.dest[to]
  if not goal then return nil end
  local open = N.seeds(g, from, hx, hz, opts, wide)
  local lineUp = tostring(to):match('^C[1-4]$') and g.nodes[goal] or nil
  local done = {}
  while #open > 0 do
    local bi = 1
    for i = 2, #open do
      if open[i].cost < open[bi].cost then bi = i end
    end
    local s = table.remove(open, bi)
    if s.node == goal then
      local chain, x = {}, s
      while x do
        table.insert(chain, 1, x)
        x = x.parent
      end
      local pts = {}
      for _, st in ipairs(chain) do
        for _, p in ipairs(st.pts) do pts[#pts + 1] = p end
        if not st.parent then pts[#pts + 1] = g.nodes[st.node] end
      end
      local out = {}
      for i, p in ipairs(pts) do
        if i == 1 or N.dist(p, pts[i - 1]) > 0.05 then out[#out + 1] = p end -- (a start on its own node)
      end
      return out
    end
    local key = s.prev .. '>' .. s.node
    if not done[key] then
      done[key] = true
      for _, n in ipairs(g.adj[s.node]) do
        if n ~= s.prev then
          local ex, ez = N.dir(g.nodes[s.node], g.nodes[n])
          local turn = s.dir and N.turn(s.dir[1], s.dir[2], ex, ez) or 0
          if turn <= N.MAX_TURN and not (lineUp and turn > N.LINEUP_TURN and N.dist(g.nodes[s.node], lineUp) < ((opts and opts.lineup) or N.MIN_LINEUP))
            and not (pullOut and turn > N.LINEUP_TURN and N.dist(g.nodes[s.node], from) < N.MIN_PULL_OUT) then
            open[#open + 1] = { node = n, prev = s.node, dir = { ex, ez }, cost = s.cost + N.dist(g.nodes[n], g.nodes[s.node]) + turn * N.TURN_COST, parent = s, pts = { g.nodes[n] } }
          end
        end
      end
    end
  end
  return nil
end

function Tow.Net.waypoints(g, from, to, hx, hz, opts)
  local S = Tow.Net.solve
  local r = S(g, from, to, hx, hz, true, opts) or S(g, from, to, hx, hz, false, opts)
  if r or (opts and opts.tow) then return r end
  return S(g, from, to, hx, hz, true, opts, true) or S(g, from, to, hx, hz, false, opts, true)
end

-- a way's corners only: the points in line with their neighbours dropped (the solver gives every junction passed)
function Tow.Net.corners(wp)
  local N = Tow.Net
  local p = {}
  for _, q in ipairs(wp) do
    local n = #p
    if n > 0 and N.dist(p[n], q) < 0.05 then
      -- (a repeat)
    elseif n >= 2 then
      local ax, az = N.dir(p[n - 1], p[n])
      local bx, bz = N.dir(p[n], q)
      if N.turn(ax, az, bx, bz) < 0.5 then p[n] = q else p[n + 1] = q end -- (in line with the two before: no corner)
    else
      p[n + 1] = q
    end
  end
  return p
end

-- corners made a way to drive: straight runs joined by arcs of radius r (less where two corners are too close for
-- it), a point about every `step` metres
function Tow.Net.smooth(wp, r, step)
  local N = Tow.Net
  r, step = r or N.RADIUS, step or 1
  local p = N.corners(wp)
  local n = #p
  if n < 2 then return p end
  local want, t = {}, {}
  for i = 1, n do
    if i == 1 or i == n then
      want[i] = 0
    else
      local ax, az = N.dir(p[i - 1], p[i])
      local bx, bz = N.dir(p[i], p[i + 1])
      want[i] = r * math.tan(math.rad(N.turn(ax, az, bx, bz)) / 2)
    end
    t[i] = want[i]
  end
  for i = 1, n - 1 do
    local L = N.dist(p[i], p[i + 1])
    local need = want[i] + want[i + 1]
    if need > L then
      t[i] = math.min(t[i], want[i] * L / need)
      t[i + 1] = math.min(t[i + 1], want[i + 1] * L / need)
    end
  end
  local out = {}
  local function run(a, b)
    local L = N.dist(a, b)
    if L < 0.01 then
      if #out == 0 then out[1] = a end
      return
    end
    local k = math.max(1, math.ceil(L / step))
    for j = (#out > 0 and 1 or 0), k do out[#out + 1] = { a[1] + (b[1] - a[1]) * j / k, a[2] + (b[2] - a[2]) * j / k } end
  end
  local cur = p[1]
  for i = 2, n - 1 do
    local d1x, d1z = N.dir(p[i - 1], p[i])
    local d2x, d2z = N.dir(p[i], p[i + 1])
    local th = math.rad(N.turn(d1x, d1z, d2x, d2z))
    if t[i] < 0.05 or th < 1e-3 then
      run(cur, p[i])
      cur = p[i]
    else
      local t1 = { p[i][1] - d1x * t[i], p[i][2] - d1z * t[i] }
      local rad = t[i] / math.tan(th / 2)
      local left = (d1x * d2z - d1z * d2x) > 0 and 1 or -1
      local cx, cz = t1[1] - d1z * rad * left, t1[2] + d1x * rad * left
      run(cur, t1)
      local a0 = atan2(t1[2] - cz, t1[1] - cx)
      local k = math.max(2, math.ceil(rad * th / step))
      for j = 1, k do out[#out + 1] = { cx + rad * math.cos(a0 + left * th * j / k), cz + rad * math.sin(a0 + left * th * j / k) } end
      cur = out[#out]
    end
  end
  run(cur, p[n])
  return out
end

-- The tractor BY ITSELF from a to b ({ x, z }): along the roads where it can (a leg off them counts 1.6 times its
-- length; it must stay on the deck and out of the island). obs: aircraft it may not close on, { { x, z, fx, fz } }:
-- each taken as its fuselage line, 8.5 m either way, with 5.5 m to spare (or as near as a or b already is).
-- The corners from a to b, or nil.
function Tow.Net.solo(g, a, b, obs)
  local N = Tow.Net
  obs = obs or {}
  local function spine(p, o)
    local s = math.max(-8.5, math.min(8.5, (p[1] - o.x) * o.fx + (p[2] - o.z) * o.fz))
    return math.sqrt((p[1] - o.x - o.fx * s) ^ 2 + (p[2] - o.z - o.fz * s) ^ 2)
  end
  local limit = {}
  for i, o in ipairs(obs) do limit[i] = math.min(5.5, math.min(spine(a, o), spine(b, o)) - 0.3) end
  local function free(p, q)
    for i, o in ipairs(obs) do
      local n = math.max(1, math.ceil(N.dist(p, q) / 1.5))
      for k = 0, n do
        if spine({ p[1] + (q[1] - p[1]) * k / n, p[2] + (q[2] - p[2]) * k / n }, o) < limit[i] - 1e-6 then return false end
      end
    end
    return true
  end
  local n = #g.nodes
  local P, nb = {}, {}
  for i = 1, n do P[i] = g.nodes[i] end
  P[n + 1], P[n + 2] = a, b
  for i = 1, n + 2 do nb[i] = {} end
  local function link(i, j, k)
    local c = N.dist(P[i], P[j]) * k
    nb[i][#nb[i] + 1] = { j, c }
    nb[j][#nb[j] + 1] = { i, c }
  end
  for i = 1, n do
    for _, j in ipairs(g.adj[i]) do
      if j > i and free(P[i], P[j]) then link(i, j, 1) end
    end
    for e = n + 1, n + 2 do
      if N.dist(P[i], P[e]) < 45 and N.legOk(g, P[e], P[i]) and free(P[e], P[i]) then link(i, e, 1.6) end
    end
  end
  if N.legOk(g, a, b) and free(a, b) then link(n + 1, n + 2, 1.6) end
  local cost, prev, seen = { [n + 1] = 0 }, {}, {}
  while true do
    local u, best
    for i = 1, n + 2 do
      if cost[i] and not seen[i] and (not best or cost[i] < best) then u, best = i, cost[i] end
    end
    if not u then return nil end
    if u == n + 2 then break end
    seen[u] = true
    for _, e in ipairs(nb[u]) do
      if not cost[e[1]] or best + e[2] < cost[e[1]] then cost[e[1]], prev[e[1]] = best + e[2], u end
    end
  end
  local out, u = {}, n + 2
  while u do
    table.insert(out, 1, P[u])
    u = prev[u]
  end
  return out
end

-- ---- the flight deck tow's plans (Tow.Fd)
Tow.Fd = {}

-- the platforms a tow may not cross now (Tow.Fd.blocks: set while a tow of the deck spotting demo is planned or
-- driven: its own account of its elevators; else the hook's, Walk.blocks)
function Tow.Fd.blockList() return (Tow.Fd.blocks or Walk.blocks)() end

-- the planners' account of what they tried (Tow.Fd.mute: kept out of the log, or, a table, collected in it: the deck
-- spotting demo plans again and again until a way is free, and says itself why it waits)
function Tow.Fd.log(s)
  local m = Tow.Fd.mute
  if type(m) == 'table' then m[#m + 1] = s elseif not m then logLine(s) end
end

function Tow.routeLen(path)
  local s = routeLengths(path)
  return s[#s] or 0
end

-- on the deck, with m metres of it all round
-- (Tow.Fd.inside: "is there deck under this point": the flight deck's outline, or, for a tow in the hangar, the
-- hangar's floor: set while such a tow is planned or driven. Tow.Fd.wall: "is something standing at this point that
-- an aircraft's nose, wing or tail would hit": the hangar's walls and fittings; nothing on the flight deck.)
function Tow.Fd.on(x, z, m)
  local f = Tow.Fd.inside or insideDeck
  return f(x, z) and f(x + m, z) and f(x - m, z) and f(x, z + m) and f(x, z - m)
end

-- DO TWO AIRCRAFT TOUCH (2026-11-17: in DCS the tractor pushed a Hornet's nose through the nose of one parked on the
-- six-pack; until then a tow was not held against the other aircraft on the deck at all). An F/A-18C is taken as
-- four rounded bars (a line with a radius), about its own position, x ahead, across its wings:
--   the nose       from 2.5 to 8.1 ahead, radius 0.5 (its tip 8.6 ahead)
--   the body       from 7.4 behind to 2.5 ahead, radius 1.1 (its end 8.5 behind: 17.1 m in all)
--   the wing       across 2.2 behind, radius 1.8, to 4.2 either side folded or 6.3 spread
--   the tailplane  across 7.0 behind, radius 1.0, to 3.3 either side
-- (The aircraft's length and spans as published; where its own position lies along it follows from the nose wheel,
-- 3.005 ahead of it. Rough: a wing is not a bar. All of it at one height: a wing over a nose counts as touching.)
-- `low`: what the TRACTOR is held against, which goes under a nose, a wing or a tail but not through the wheels and
-- what hangs between them: a bar from 2.6 behind to 3.1 ahead, radius 1.7. The tractor itself: a bar from 2.4 behind
-- its position to 1.2 ahead, radius 0.9.
function Tow.Fd.shape(x, z, fx, fz, half)
  local rx, rz = -fz, fx -- across
  local w, t = half - 1.8, 3.3 - 1.0
  return { x = x, z = z,
    { x + fx * 2.5, z + fz * 2.5, x + fx * 8.1, z + fz * 8.1, 0.5 },
    { x - fx * 7.4, z - fz * 7.4, x + fx * 2.5, z + fz * 2.5, 1.1 },
    { x - fx * 2.2 - rx * w, z - fz * 2.2 - rz * w, x - fx * 2.2 + rx * w, z - fz * 2.2 + rz * w, 1.8 },
    { x - fx * 7.0 - rx * t, z - fz * 7.0 - rz * t, x - fx * 7.0 + rx * t, z - fz * 7.0 + rz * t, 1.0 },
    low = { { x - fx * 2.6, z - fz * 2.6, x + fx * 3.1, z + fz * 3.1, 1.7 } } }
end

function Tow.Fd.tugShape(x, z, hx, hz)
  return { x = x, z = z, { x - hx * 2.4, z - hz * 2.4, x + hx * 1.2, z + hz * 1.2, 0.9 } }
end

-- how far apart two bars are (their surfaces; below 0: into each other)
function Tow.Fd.barGap(a, b)
  local function ps(px, pz, s) -- a point to a segment
    local dx, dz = s[3] - s[1], s[4] - s[2]
    local l2 = dx * dx + dz * dz
    local k = l2 > 0 and math.max(0, math.min(1, ((px - s[1]) * dx + (pz - s[2]) * dz) / l2)) or 0
    return math.sqrt((px - s[1] - dx * k) ^ 2 + (pz - s[2] - dz * k) ^ 2)
  end
  local function side(s, px, pz) return (s[3] - s[1]) * (pz - s[2]) - (s[4] - s[2]) * (px - s[1]) end
  local d
  if side(a, b[1], b[2]) * side(a, b[3], b[4]) < 0 and side(b, a[1], a[2]) * side(b, a[3], a[4]) < 0 then
    d = 0 -- (they cross)
  else
    d = math.min(math.min(ps(a[1], a[2], b), ps(a[3], a[4], b)), math.min(ps(b[1], b[2], a), ps(b[3], b[4], a)))
  end
  return d - a[5] - b[5]
end

-- the least room between two shapes
function Tow.Fd.gap(A, B)
  local g
  for _, a in ipairs(A) do
    for _, b in ipairs(B) do
      local d = Tow.Fd.barGap(a, b)
      if not g or d < g then g = d end
    end
  end
  return g
end

-- an aircraft's wing, half its span as it stands: folded or spread, read from its own model (argument 8, the deck
-- tool's: Tow.Deck.foldArg); spread if it cannot be read
function Tow.Fd.half(id)
  local h = shipHandle()
  if h and id and native and native.objarg then
    local okh, v = pcall(native.objarg, h, id, Tow.Deck.foldArg)
    if okh and type(v) == 'number' then return v > 0.5 and 4.2 or 6.3 end
  end
  return 6.3
end

-- The other aircraft a tow is held against (st.others: { x, z, fx, fz, name, half } each; Tow.Fd.plan fills it in) are
-- given their shapes, and each the room the tow must keep from it: TOW.touch, or less where the aircraft in tow
-- already stands nearer than that as it starts (jet: { x, z, fx, fz }) or will stand nearer at its place (dest: the
-- same; neighbours on the deck stand wing to wing): 0.3 m less than the nearer of the two. The same for the tractor
-- (TOW.tugTouch; where it starts).
function Tow.Fd.limits(st, jet, dest)
  local half = st.half or 4.2
  local A = Tow.Fd.shape(jet.x, jet.z, jet.fx, jet.fz, half)
  local B = dest and Tow.Fd.shape(dest.x, dest.z, dest.fx, dest.fz, half) or nil
  local T = Tow.Fd.tugShape(st.d.x, st.d.z, st.d.hx, st.d.hz)
  for _, o in ipairs(st.others or {}) do
    o.shape = o.shape or Tow.Fd.shape(o.x, o.z, o.fx, o.fz, o.half or 4.2)
    local lim = TOW.touch
    local ga = Tow.Fd.gap(A, o.shape)
    if ga - 0.3 < lim then lim = ga - 0.3 end
    if B then
      local gb = Tow.Fd.gap(B, o.shape)
      if gb - 0.3 < lim then lim = gb - 0.3 end
    end
    o.lim = lim
    o.tlim = math.min(TOW.tugTouch, Tow.Fd.gap(T, o.shape.low) - 0.2)
  end
end

-- What is wrong with the tow as it stands (the tractor's own point at tx, tz, pointing hx, hz; the nose wheel at lx, lz;
-- the middle of the main wheels at mx, mz), or nil; and how far the nose wheel is turned (degrees). others (with
-- `half`, the towed aircraft's wing): the other aircraft on the deck, each with its shape and room (Tow.Fd.limits):
-- the aircraft in tow and the tractor are held against them.
function Tow.Fd.check(tx, tz, hx, hz, lx, lz, mx, mz, blocks, others, half)
  local Hx, Hz = tx - hx * TOW.hitch, tz - hz * TOW.hitch
  local ux, uz = Tow.unit(Hx - lx, Hz - lz)
  local fx, fz = Tow.unit(lx - mx, lz - mz)
  local steer = math.abs(math.deg(atan2(fx * uz - fz * ux, fx * ux + fz * uz)))
  if steer > TOW.steerMax then return string.format('the nose wheel would be turned %.0f degrees (%d at most)', steer, TOW.steerMax), steer end
  if math.abs(math.deg(atan2(hx * uz - hz * ux, hx * ux + hz * uz))) > TOW.kinkMax then return 'the bar would fold against the tractor', steer end
  if not Tow.Fd.on(tx, tz, 1.2) then return string.format('the tractor would leave the deck (%.0f m forward, %.0f m to starboard)', tx, tz), steer end
  local half0 = TOW.track / 2
  local inside = Tow.Fd.inside or insideDeck
  if not (inside(lx, lz) and inside(mx + fz * half0, mz - fx * half0) and inside(mx - fz * half0, mz + fx * half0)) then
    return string.format('the jet\'s wheels would leave the deck (near %.0f m forward, %.0f m to starboard)', lx, lz), steer
  end
  if Tow.Fd.wall then
    -- (in the hangar: the aircraft's nose, its wing tips, its tail and tailplane tips against the walls and fittings)
    local jx, jz = lx - fx * TOW.noseGear, lz - fz * TOW.noseGear
    local hw = half or 4.2
    for _, q in ipairs({ { 8.4, 0 }, { 5.5, 0 }, { -2.2, hw }, { -2.2, -hw }, { -0.6, hw - 0.3 }, { -0.6, 0.3 - hw }, { -3.8, hw - 0.3 }, { -3.8, 0.3 - hw }, { -8.3, 0 }, { -7.0, 3.1 }, { -7.0, -3.1 } }) do
      local px, pz = jx + fx * q[1] - fz * q[2], jz + fz * q[1] + fx * q[2]
      if Tow.Fd.wall(px, pz) then return string.format('the aircraft in tow would run into the hangar\'s side or a fitting (near %.0f m forward, %.0f m to starboard)', px, pz), steer end
    end
  end
  for _, b in ipairs(blocks or {}) do
    if inBox(b, tx, tz) or inBox(b, lx, lz) or inBox(b, mx, mz) then return 'elevator ' .. tostring(b.idx) .. ' is down and in the way', steer end
  end
  if others and #others > 0 then
    local jx, jz = lx - fx * TOW.noseGear, lz - fz * TOW.noseGear
    local J, T
    for _, o in ipairs(others) do
      -- (two Hornets' own positions more than 21 m apart cannot touch; nor the tractor 13 m from one)
      local dj = (o.x - jx) ^ 2 + (o.z - jz) ^ 2
      if dj < 441 then
        J = J or Tow.Fd.shape(jx, jz, fx, fz, half or 4.2)
        local g = Tow.Fd.gap(J, o.shape)
        local F = Tow.Fd.least
        if F and (not F.gap or g < F.gap) then F.gap, F.name = g, o.name end
        if g < o.lim and not Tow.Fd.soft then
          return string.format('the aircraft in tow would %s %s (near %.0f m forward, %.0f m to starboard)', g < 0 and 'run into' or string.format('come within %.1f m of', g), tostring(o.name or 'another aircraft'), jx, jz), steer
        end
      end
      if (o.x - tx) ^ 2 + (o.z - tz) ^ 2 < 169 then
        T = T or Tow.Fd.tugShape(tx, tz, hx, hz)
        local gt = Tow.Fd.gap(T, o.shape.low)
        if gt < o.tlim and Tow.Fd.soft then
          local F = Tow.Fd.least
          if F and (not F.tug or gt < F.tug) then F.tug, F.tugName = gt, o.name end
        elseif gt < o.tlim then
          return string.format('the tractor would run into %s (near %.0f m forward, %.0f m to starboard)', tostring(o.name or 'another aircraft'), tx, tz), steer
        end
      end
    end
  end
  return nil, steer
end

-- The bar and the jet trailing the tractor d ({ x, z, hx, hz }), exactly as Tow.apply places them. q: { lx, lz (the
-- nose wheel), mx, mz (the middle of the main wheels), fl (the bar from the hitch to the nose wheel, on the flat),
-- steer (the most the nose wheel has turned), blocks (lowered elevators), others / half (the other aircraft on the
-- deck: looked at every third time, some 0.4 m of travel) }. Returns what is wrong where they now stand, or nil.
function Tow.Fd.trail(q, d)
  local hx, hz = d.x - d.hx * TOW.hitch, d.z - d.hz * TOW.hitch
  local ux, uz = Tow.unit(hx - q.lx, hz - q.lz)
  q.lx, q.lz = hx - ux * q.fl, hz - uz * q.fl
  local fx, fz = Tow.unit(q.lx - q.mx, q.lz - q.mz)
  local L = TOW.noseGear + TOW.mainGear
  q.mx, q.mz = q.lx - fx * L, q.lz - fz * L
  q.fx, q.fz = fx, fz
  q.n = (q.n or 0) + 1
  local bad, steer = Tow.Fd.check(d.x, d.z, d.hx, d.hz, q.lx, q.lz, q.mx, q.mz, q.blocks, (q.n % 3 == 0) and q.others or nil, q.half)
  if steer > q.steer then q.steer = steer end
  return bad
end

-- A tow driven in the head: the tractor from st.d on along `path` as Tow.drive drives it (turning no tighter than
-- turnR), the bar and the jet trailing from st (lx, lz, mx, mz, fl, blocks, others, half). Returns where it all ends
-- ({ d, lx, lz, mx, mz, steer }), or nil and what goes wrong.
function Tow.Fd.sim(st, path, speed, turnR)
  local d = { x = st.d.x, z = st.d.z, hx = st.d.hx, hz = st.d.hz, v = 0, path = path, s = routeLengths(path), at = 0, speed = speed, turnR = turnR, acc = TOW.simAccel, brk = TOW.simBrake }
  local q = { lx = st.lx, lz = st.lz, mx = st.mx, mz = st.mz, fl = st.fl, steer = 0, blocks = st.blocks, others = st.others, half = st.half }
  local limit = 40 * (d.s[#path] + 20)
  local F = {} -- (the least room to another aircraft on the way, and whose: Tow.Fd.check keeps it)
  Tow.Fd.least = F
  for _ = 1, limit do
    local done = Tow.drive(d, 0.1)
    local bad = Tow.Fd.trail(q, d)
    if bad then
      Tow.Fd.least = nil
      return nil, bad
    end
    if done then
      Tow.Fd.least = nil
      return { d = d, lx = q.lx, lz = q.lz, mx = q.mx, mz = q.mz, fx = q.fx, fz = q.fz, steer = q.steer, gap = F.gap, gapName = F.name, tug = F.tug, tugName = F.tugName }
    end
  end
  Tow.Fd.least = nil
  return nil, 'the tractor does not get to the end of its way'
end

-- the tractor by itself along `path` in the head: true, or nil and what goes wrong. goal ({ x, z, hx, hz }): it must
-- end there, within 0.5 m (0.3 m to either side) and 6 degrees: on the aircraft's nose line, facing away from it
-- others ({ x, z, shape } each: the other aircraft): it goes under a nose or a wing, not through the wheels of one
function Tow.Fd.simSolo(d0, path, blocks, goal, others)
  local d = { x = d0.x, z = d0.z, hx = d0.hx, hz = d0.hz, v = 0, path = path, s = routeLengths(path), at = 0, speed = TOW.simSpeed, acc = TOW.simAccel, brk = TOW.simBrake }
  local n = 0
  for _ = 1, 40 * (d.s[#path] + 20) do
    local done = Tow.drive(d, 0.1)
    if not Tow.Fd.on(d.x, d.z, 1.0) then return nil, string.format('the tractor would leave the deck on its way (%.0f m forward, %.0f m to starboard)', d.x, d.z) end
    n = n + 1
    if others and n % 3 == 0 then
      local T
      for _, o in ipairs(others) do
        if (o.x - d.x) ^ 2 + (o.z - d.z) ^ 2 < 169 then
          o.shape = o.shape or Tow.Fd.shape(o.x, o.z, o.fx, o.fz, o.half or 4.2)
          T = T or Tow.Fd.tugShape(d.x, d.z, d.hx, d.hz)
          if Tow.Fd.gap(T, o.shape.low) < TOW.tugTouch then
            return nil, string.format('the tractor would run into the wheels of %s on its way (%.0f m forward, %.0f m to starboard)', tostring(o.name or 'another aircraft'), d.x, d.z)
          end
        end
      end
    end
    for _, b in ipairs(blocks or {}) do
      if inBox(b, d.x, d.z) then return nil, 'elevator ' .. tostring(b.idx) .. ' is down and in the tractor\'s way' end
    end
    if done then
      if goal then
        local ox, oz = d.x - goal.x, d.z - goal.z
        local side = math.abs(ox * -goal.hz + oz * goal.hx)
        local turn = Tow.Net.turn(d.hx, d.hz, goal.hx, goal.hz)
        -- (goal.turnOk: the deck spotting demo's tractors in the packed hangar: they back the last metres onto the
        -- ring and straighten as they back: up to that many degrees round is let pass)
        if math.sqrt(ox * ox + oz * oz) > 0.5 or side > 0.3 or turn > (goal.turnOk or 6) then
          return nil, string.format('the tractor would not come out of its turn in line with the nose (%.1f m to the side, %.0f degrees round)', side, turn)
        end
      end
      return true
    end
  end
  return nil, 'the tractor does not get to the end of its way'
end

-- the tractor's way along a route made for the jet's own position: from where the tractor stands, onto the route
-- `skip` metres along it (the tractor stands that far ahead of the jet), and on to its end
function Tow.Fd.join(d, route, skip)
  local s = routeLengths(route)
  local out = { { d.x, d.z } }
  for i = 1, #route do
    local last = out[#out]
    if s[i] >= skip and math.sqrt((route[i][1] - last[1]) ^ 2 + (route[i][2] - last[2]) ^ 2) > 0.05 then out[#out + 1] = route[i] end
  end
  return out
end

-- To catapult k: along the taxi route and on up the track, the nose wheel left TOW.catShort short of the shuttle, THE
-- JET IN LINE WITH THE TRACK. The tractor, the bar and the jet are 13 m from end to end, and a taxi route may come
-- onto a catapult's line 8 m short of its shuttle: stopped there the jet stands several degrees across the track
-- (7.6 from elevator 2 to catapult 2). So, in turn, until the jet ends within TOW.catTurn degrees of the track and its
-- nose wheel within TOW.catOff of its line:
--   1. a taxi way that makes no sharp turn within TOW.catLineUp of the shuttle (if there is one);
--   2. the taxi way as it is;
--   3. the taxi way as it is, pulled on up the track 12, 20 or 28 m PAST the place, then pushed straight back to it
--      (Tow.Fd.back: the push steers the jet onto the track's line as it comes).
function Tow.Fd.planCat(g, st0, jet, k, reach)
  local N = Tow.Net
  local name = 'catapult ' .. k
  local skip = TOW.noseGear + reach + 1.5
  local L = TOW.noseGear + TOW.mainGear
  local why
  for _, try in ipairs({ { lineup = TOW.catLineUp, extra = 0 }, { extra = 0 }, { extra = 12 }, { extra = 20 }, { extra = 28 } }) do
    local wp = N.waypoints(g, { jet.x, jet.z }, 'C' .. k, jet.fx, jet.fz, { tow = true, lineup = try.lineup })
    if not wp or #wp < 2 then
      if not try.lineup then return nil, string.format('no way from here to catapult %d along which the jet can be pulled nose first (it is pulled, never turned on the spot).', k) end
    else
      local route = N.smooth(wp)
      wp = N.corners(wp)
      local n = #wp
      local ex, ez = N.dir(wp[n - 1], wp[n]) -- up the catapult's track
      local sh = wp[n]                       -- its shuttle
      local len = routeLengths(route)[#route]
      if len < skip + 2 then return nil, string.format('you are %.0f m from catapult %d\'s shuttle already: too near for a tow.', len, k) end
      local path = Tow.Fd.join(st0.d, route, skip)
      path[#path + 1] = { sh[1] + ex * (reach - TOW.catShort + try.extra), sh[2] + ez * (reach - TOW.catShort + try.extra) }
      -- (the room to keep from every other aircraft on the deck: as the jet starts, and where it will stand)
      Tow.Fd.limits(st0, jet, { x = sh[1] - ex * (TOW.catShort + TOW.noseGear), z = sh[2] - ez * (TOW.catShort + TOW.noseGear), fx = ex, fz = ez })
      local res, bad = Tow.Fd.sim(st0, path, TOW.simSpeed, TOW.towR)
      if not res then
        why = why or tostring(bad)
      else
        -- where the jet is to stand: its own point, and the middle of its main wheels
        local dest = { x = sh[1] - ex * (TOW.catShort + TOW.noseGear), z = sh[2] - ez * (TOW.catShort + TOW.noseGear), fx = ex, fz = ez, name = name, short = name }
        local mF = { x = dest.x - ex * TOW.mainGear, z = dest.z - ez * TOW.mainGear }
        local plen = routeLengths(path)[#path]
        local turn = N.turn(res.fx, res.fz, ex, ez)
        local off = math.abs((res.lx - sh[1]) * -ez + (res.lz - sh[2]) * ex)
        local what = try.lineup and string.format('a taxi way with no sharp turn within %d m of the shuttle', try.lineup) or 'the taxi way as it is'
        if try.extra == 0 then
          if turn <= TOW.catTurn and off <= TOW.catOff then
            return { kind = 'cat', pull = path, steer = res.steer, dest = dest, room = Tow.Fd.roomText(res), roomOf = { Tow.Fd.roomOf(res) },
              text = string.format('%.0f m along the deck to %s, your nose wheel left %.0f m short of its shuttle', plen, name, TOW.catShort),
              note = string.format('to %s by %s: the tractor\'s way %d points, %.0f m, ends %.1f / %.1f; in the head the nose wheel turns %.0f degrees at most and the jet ends %.1f degrees off the track, its nose wheel %.2f m off its line', name, what, #path,
                plen, path[#path][1], path[#path][2], res.steer, turn, off) }
          end
          logLine(string.format('tow: to %s by %s the jet would end %.1f degrees off the track, its nose wheel %.2f m off its line: not taken', name, what, turn, off))
          why = why or string.format('the jet would end %.0f degrees off the track', turn)
        else
          local K = { mF.x + ex * try.extra / 2, mF.z + ez * try.extra / 2 }
          local rec, facts = Tow.Fd.back({ d = res.d, lx = res.lx, lz = res.lz, mx = res.mx, mz = res.mz, fl = st0.fl, blocks = st0.blocks, others = st0.others, half = st0.half }, mF, ex, ez, K, TOW.backR)
          if rec then
            return { kind = 'cat', pull = path, steer = math.max(res.steer, facts.steer), dest = dest, push = { mF = mF, hx = ex, hz = ez, K = K, rho = TOW.backR }, room = Tow.Fd.roomText(res, facts), roomOf = { Tow.Fd.roomOf(res, facts) },
              pushText = string.format('tow: on %s\'s track, %.0f m past the place. Now the tractor pushes you straight back to it, into line with the track: hands off.', name, try.extra),
              text = string.format('%.0f m along the deck onto %s\'s track and %.0f m past the place, then pushed %.0f m straight back into line, your nose wheel left %.0f m short of the shuttle', plen, name, try.extra, facts.len, TOW.catShort),
              note = string.format('to %s by the taxi way as it is, %d m past and back: the pull %d points, %.0f m, ends %.1f / %.1f, the jet then %.1f degrees off the track; the push %.1f m; in the head the nose wheel turns %.0f degrees at most on the pull and %.0f on the push, which ends %.2f m and %.1f degrees off the place (taken out over its last 3 m)',
                name, try.extra, #path, plen, path[#path][1], path[#path][2], turn, facts.len, res.steer, facts.steer, facts.off, facts.turn) }
          end
          Tow.Fd.log(string.format('tow: to %s, pulled %d m past and pushed back, is not driven: %s', name, try.extra, tostring(facts)))
          why = why or tostring(facts)
        end
      end
    end
  end
  return nil, string.format('no tow to catapult %d from here: %s.', k, tostring(why))
end

-- THE PUSH, worked out: the jet backed, tail first, from where the tow stands (st: d, lx, lz, mx, mz, fl, blocks) round
-- the corner K onto the spot (mF: where the middle of its main wheels stands on it; hx, hz: the spot's heading).
-- The middle of the main wheels is steered along the way { where it is, K, mF }, its corner rounded on rho, as a car
-- is backed: aimed TOW.backLook ahead, its turn changing no faster than TOW.backRate, the nose wheel never beyond
-- TOW.backSteer. THE NOSE WHEEL, THE BAR AND THE TRACTOR FOLLOW FROM THAT, exactly: the nose wheel is the jet's
-- wheelbase ahead of the main wheels; the bar lies the way the nose wheel moves (atan(wheelbase x curvature) off the
-- jet's nose); the tractor's hitch is at the bar's other end, and the tractor's own point trails its hitch (backing,
-- the hitch leads). Nothing in this is unstable: a pushed trailer is hard to steer from the tractor's end, and this
-- is worked out from the jet's. It starts with the nose wheel turned as it is, so nothing jumps.
-- Returns the record { ds, { tractor x, z, heading x, z, nose wheel x, z, main wheels x, z }, ... }, an entry every
-- ds metres of the main wheels' way, and its facts { steer, len, off, turn }; or nil and what is wrong.
function Tow.Fd.back(st, mF, hx, hz, K, rho)
  local N = Tow.Net
  local L = TOW.noseGear + TOW.mainGear
  local fx, fz = Tow.unit(st.lx - st.mx, st.lz - st.mz)
  local Hx, Hz = st.d.x - st.d.hx * TOW.hitch, st.d.z - st.d.hz * TOW.hitch
  local ux, uz = Tow.unit(Hx - st.lx, Hz - st.lz)
  -- as it stands: the nose wheel's turn (+ to the right), and so the curvature the main wheels' way starts with
  -- (backing, a nose wheel turned right swings the nose left)
  local kap = -math.tan(atan2(fx * uz - fz * ux, fx * ux + fz * uz)) / L
  -- (K.pts: more corners than one, in the order they are passed: the deck spotting demo's pushes in the hangar, where
  -- an aircraft standing a few metres off its place's line is backed over onto it in a shallow S)
  local way = { { st.mx, st.mz } }
  -- (K.ease: first that many metres straight back the way the aircraft points: a push that begins where a pull ended,
  -- the tow still bent, is not thrown hard over at once)
  if K.ease then way[2] = { st.mx - fx * K.ease, st.mz - fz * K.ease } end
  if K.pts then
    for _, q in ipairs(K.pts) do way[#way + 1] = q end
  else
    way[#way + 1] = K
  end
  way[#way + 1] = { mF.x, mF.z }
  local path = N.smooth(way, rho, 0.25)
  if #path < 2 then return nil, 'the jet stands on the spot already' end
  local s = routeLengths(path)
  local total = s[#path]
  local mx, mz, tx, tz = st.mx, st.mz, -fx, -fz -- (tx, tz: the way the main wheels go: the jet's tail's)
  local Tx, Tz = st.d.x, st.d.z
  local ds, at = 0.05, 0
  local kmax = math.tan(math.rad(TOW.backSteer)) / L
  local rec, most = { ds = ds }, 0
  local F = {} -- (the least room to another aircraft on the push, and whose: Tow.Fd.check keeps it)
  Tow.Fd.least = F
  for _ = 1, math.floor((total + 15) / ds) do
    local near = routeNearest(path, s, mx, mz, at - 0.5, at + 2)
    if near > at then at = near end
    local remain = total - at
    if remain <= 0.02 then break end
    local ax, az, adx, adz = routeAt(path, s, math.min(total, at + TOW.backLook))
    if remain < TOW.backLook then ax, az = ax + adx * (TOW.backLook - remain), az + adz * (TOW.backLook - remain) end
    local vx, vz = ax - mx, az - mz
    local al = math.sqrt(vx * vx + vz * vz)
    local want = al > 0.01 and 2 * math.sin(atan2(tx * vz - tz * vx, tx * vx + tz * vz)) / al or 0
    want = math.max(-kmax, math.min(kmax, want))
    kap = kap + math.max(-TOW.backRate * ds, math.min(TOW.backRate * ds, want - kap))
    local c, sn = math.cos(ds * kap), math.sin(ds * kap)
    tx, tz = tx * c - tz * sn, tx * sn + tz * c
    mx, mz = mx + tx * ds, mz + tz * ds
    local lx, lz = mx - tx * L, mz - tz * L
    local del = math.atan(-L * kap)
    local cu, su = math.cos(del), math.sin(del)
    local bx, bz = -tx * cu + tz * su, -tx * su - tz * cu -- the bar, from the nose wheel to the hitch
    local hxx, hzz = lx + bx * st.fl, lz + bz * st.fl
    local thx, thz = Tow.unit(Tx - hxx, Tz - hzz)
    Tx, Tz = hxx + thx * TOW.hitch, hzz + thz * TOW.hitch
    -- (the other aircraft on the deck: looked at every eighth time, 0.4 m of the push)
    local bad, steer = Tow.Fd.check(Tx, Tz, thx, thz, lx, lz, mx, mz, st.blocks, (#rec % 8 == 0) and st.others or nil, st.half)
    if bad then
      Tow.Fd.least = nil
      return nil, bad
    end
    if steer > most then most = steer end
    rec[#rec + 1] = { Tx, Tz, thx, thz, lx, lz, mx, mz }
  end
  Tow.Fd.least = nil
  local n = #rec
  if n < 2 then return nil, 'the jet stands on the spot already' end
  local e = rec[n]
  local ox, oz = e[7] - mF.x, e[8] - mF.z
  local off = math.sqrt(ox * ox + oz * oz)
  local jfx, jfz = Tow.unit(e[5] - e[7], e[6] - e[8])
  local turn = N.turn(jfx, jfz, hx, hz)
  if off > 0.4 or turn > 3 then return nil, string.format('the jet would not come onto the spot squarely (%.1f m and %.0f degrees out)', off, turn) end
  -- the last centimetres and the last degree: the whole tow slid and turned (about where the main wheels end) onto
  -- the spot over the push's last 3 m, as one piece
  local ang = atan2(jfx * hz - jfz * hx, jfx * hx + jfz * hz) -- from the jet's nose as it ends round to the spot's heading
  local n0 = math.max(1, n - math.floor(3 / ds))
  for i = n0, n do
    local k = smooth((i - n0) / math.max(1, n - n0))
    local r = rec[i]
    local c, sn = math.cos(ang * k), math.sin(ang * k)
    for _, j in ipairs({ 1, 5, 7 }) do
      local px, pz = r[j] - ox * k - mF.x, r[j + 1] - oz * k - mF.z
      r[j], r[j + 1] = mF.x + px * c - pz * sn, mF.z + px * sn + pz * c
    end
    r[3], r[4] = r[3] * c - r[4] * sn, r[3] * sn + r[4] * c
  end
  -- how hard the tractor itself turns: the most its heading changes over a metre of its own travel (degrees a metre)
  local pivot, j, run = 0, 1, { 0 }
  for i = 2, n do run[i] = run[i - 1] + math.sqrt((rec[i][1] - rec[i - 1][1]) ^ 2 + (rec[i][2] - rec[i - 1][2]) ^ 2) end
  for i = 1, n do
    while j < n and run[j] - run[i] < 1 do j = j + 1 end
    if run[j] - run[i] >= 1 then pivot = math.max(pivot, N.turn(rec[i][3], rec[i][4], rec[j][3], rec[j][4]) / (run[j] - run[i])) end
  end
  if j == n and run[n] < 1 then pivot = N.turn(rec[1][3], rec[1][4], rec[n][3], rec[n][4]) end
  return rec, { steer = most, len = (n - 1) * ds, off = off, turn = turn, pivot = pivot, tug = run[n], gap = F.gap, gapName = F.name, tugGap = F.tug, tugName = F.tugName }
end

-- the least room to another aircraft on the pull (res) and the push (facts), and whose; and how far the tractor went
-- into one's wheels (the second go only), and whose
function Tow.Fd.roomOf(res, facts)
  local g, name = res and res.gap, res and res.gapName
  if facts and facts.gap and (not g or facts.gap < g) then g, name = facts.gap, facts.gapName end
  local tg, tname = res and res.tug, res and res.tugName
  if facts and facts.tugGap and (not tg or facts.tugGap < tg) then tg, tname = facts.tugGap, facts.tugName end
  return g, name, tg, tname
end

-- for a plan's note
function Tow.Fd.roomText(res, facts)
  local g, name = Tow.Fd.roomOf(res, facts)
  if not g then return '; no other aircraft within reach of the way' end
  return string.format('; the nearest it comes to another aircraft: %.1f m (%s)', g, tostring(name))
end

-- One way of putting the jet on a spot: pulled along the taxi way and then along a line across the spot's front
-- (through K, along ax, az) until the whole tow is past K; then backed round K into the spot (Tow.Fd.back), turning
-- on rho. onRoad: the line is the taxi road's own (K the spot's corner on it): the pull just carries on past it.
-- The plan, or nil and what is wrong with it.
function Tow.Fd.trySpot(st0, spot, reach, wp, hx, hz, ax, az, K, rho, onRoad)
  local N = Tow.Net
  local L = TOW.noseGear + TOW.mainGear
  local mF = { x = spot.x - hx * TOW.mainGear, z = spot.z - hz * TOW.mainGear }
  local t = rho * math.tan(math.rad(N.turn(hx, hz, ax, az)) / 2) -- from K to where the push's bend begins
  local train = TOW.hitch + st0.fl + L -- from the tractor's own point back to the main wheels, the tow straight
  -- where the tractor stops: the main wheels then 2 m beyond the bend's beginning
  local P = { K[1] + ax * (t + 2 + train), K[2] + az * (t + 2 + train) }
  local n = #wp
  local corners = {}
  for i = 1, math.max(1, n - 2) do corners[#corners + 1] = wp[i] end
  local V = corners[#corners]
  local ix, iz = N.dir(V, wp[n - 1]) -- the way the taxi way comes to the spot's corner
  if not onRoad then
    local cr = ix * az - iz * ax
    if math.abs(cr) < 0.14 then
      -- alongside the road but not on it: over onto the line well before K
      if ix * ax + iz * az < 0 then return nil, 'the line across the spot runs against the way the jet comes' end
      local q0 = { K[1] - ax * 6, K[2] - az * 6 }
      local along = (q0[1] - ax * 12 - V[1]) * ix + (q0[2] - az * 12 - V[2]) * iz
      if along > 1 then corners[#corners + 1] = { V[1] + ix * along, V[2] + iz * along } end
      local last = corners[#corners]
      if (q0[1] - last[1]) * ax + (q0[2] - last[2]) * az > 1 then corners[#corners + 1] = q0 end
    else
      -- the two lines cross: the pull turns onto the line there
      local tt = ((P[1] - V[1]) * az - (P[2] - V[2]) * ax) / cr
      local X = { V[1] + ix * tt, V[2] + iz * tt }
      if tt < -0.5 or (P[1] - X[1]) * ax + (P[2] - X[2]) * az < 6 then return nil, 'there is no clean way onto the line across the spot' end
      if tt > 0.5 then corners[#corners + 1] = X end
    end
  end
  corners[#corners + 1] = P
  local route = N.smooth(corners)
  local skip = TOW.noseGear + reach + 1.5
  if routeLengths(route)[#route] < skip + 4 then return nil, 'the spot is too near for a tow' end
  local path = Tow.Fd.join(st0.d, route, skip)
  local res, why = Tow.Fd.sim(st0, path, TOW.simSpeed, TOW.towR)
  if not res then return nil, 'on the pull past the spot ' .. tostring(why) end
  -- (spot.pushK: the push's own corner(s), where it is not the line's: the demo's tows in the hangar)
  local pushK = spot.pushK or K
  local rec, facts = Tow.Fd.back({ d = res.d, lx = res.lx, lz = res.lz, mx = res.mx, mz = res.mz, fl = st0.fl, blocks = st0.blocks, others = st0.others, half = st0.half }, mF, hx, hz, pushK, spot.pushRho or rho)
  if not rec then return nil, 'on the push into the spot ' .. tostring(facts) end
  local plen = routeLengths(path)[#path]
  return { kind = 'spot', pull = path, push = { mF = mF, hx = hx, hz = hz, K = pushK, rho = spot.pushRho or rho }, steer = math.max(res.steer, facts.steer), pivot = facts.pivot, room = Tow.Fd.roomText(res, facts), roomOf = { Tow.Fd.roomOf(res, facts) },
    dest = { x = spot.x, z = spot.z, fx = hx, fz = hz, name = spot.name, short = spot.name },
    text = string.format('%.0f m along the deck past %s, then pushed back %.0f m into it, tail first', plen, spot.name, facts.len),
    note = string.format('to %s (spot %s): the pull %d points, %.0f m, ends %.1f / %.1f; the push %.1f m round %.1f / %.1f on %.1f m; in the head the nose wheel turns %.0f degrees at most on the pull and %.0f on the push, which ends %.2f m and %.1f degrees off the spot (the %.2f m taken out over its last 3 m); the tractor backs %.1f m, turning %.0f degrees a metre at most',
      spot.name, tostring(spot.spot), #path, plen, P[1], P[2], facts.len, K[1], K[2], rho, res.steer, facts.steer, facts.off, facts.turn, facts.off, facts.tug, facts.pivot) }
end

-- To a deck spot. The ways tried, in turn, until one can be driven (in the head):
--   1. along the taxi road's own line past the spot's corner, and back round that corner (if the bend fits between the
--      corner and the spot on TOW.backRmin or more; if the corner is more than TOW.roadFar ahead of the spot, this
--      way is tried last: the port side spots' corners are across the deck, 50 m of pushing);
--   2. a line across the spot's front, TOW.passClear ahead of where the main wheels will stand (clear of the noses of
--      the jets either side), at 90, 60 and 120 degrees to the spot's heading, on the side the jet comes from; then
--      the other side.
-- The first that can be driven with the tractor itself turning no harder than TOW.pivotOk is taken; if none is that
-- gentle, the gentlest.
function Tow.Fd.planSpot(g, st0, jet, spot, reach)
  local N = Tow.Net
  if not spot.id then return nil, 'the routes file is an older one (no spot ids): run crew-test\\install.ps1 with DCS closed' end
  local wp = N.waypoints(g, { jet.x, jet.z }, spot.id, jet.fx, jet.fz, { tow = true })
  if not wp or #wp < 2 then return nil, 'no way from here to ' .. spot.name .. ' along which the jet can be pulled nose first (it is pulled, never turned on the spot).' end
  wp = N.corners(wp)
  local hx, hz = Tow.unit(spot.fx, spot.fz)
  local mFx, mFz = spot.x - hx * TOW.mainGear, spot.z - hz * TOW.mainGear
  local n = #wp
  local W = wp[n - 1]
  local ix, iz = N.dir(wp[math.max(1, n - 2)], W)
  -- from the spot's heading round to the way the jet comes to the spot's corner, + to the right
  local phiIn = math.deg(atan2(hx * iz - hz * ix, hx * ix + hz * iz))
  local sg = phiIn >= 0 and 1 or -1
  -- (the room to keep from every other aircraft on the deck: as the jet starts, and where it will stand)
  Tow.Fd.limits(st0, jet, { x = spot.x, z = spot.z, fx = hx, fz = hz })
  local tries, road = {}, nil
  if math.abs(phiIn) >= 20 and math.abs(phiIn) <= 165 then
    local dW = (W[1] - mFx) * hx + (W[2] - mFz) * hz
    local rho = math.min(TOW.backR, (dW - 2) / math.tan(math.rad(math.abs(phiIn)) / 2))
    if rho >= TOW.backRmin then
      road = { ax = ix, az = iz, K = W, rho = rho, onRoad = true, what = string.format('along the road, %.0f degrees round from the spot\'s heading, its corner %.0f m ahead of the main wheels', phiIn, dW) }
      if dW <= TOW.roadFar then tries[#tries + 1] = road end
    end
  end
  for _, ang in ipairs({ sg * 90, sg * 60, sg * 120, -sg * 90, -sg * 60, -sg * 120 }) do
    local c, sn = math.cos(math.rad(ang)), math.sin(math.rad(ang))
    local rho = 4.5
    local dK = math.max(rho * math.tan(math.rad(math.abs(ang)) / 2) + 2, TOW.passClear)
    tries[#tries + 1] = { ax = hx * c - hz * sn, az = hx * sn + hz * c, K = { mFx + hx * dK, mFz + hz * dK }, rho = rho, what = string.format('a line %.0f degrees round from the spot\'s heading, %.0f m ahead of its main wheels', ang, dK) }
  end
  if road and #tries == 6 then tries[#tries + 1] = road end
  -- the first way that can be driven with the tractor turning gently is taken; failing that, the gentlest that can.
  -- (In the second go, Tow.Fd.soft, when no way is clear of the other aircraft: of all that can be driven, the one
  -- that goes least far into another aircraft.)
  local first, best, bestI
  local roomy, roomyI
  for i, t in ipairs(tries) do
    -- (the deck spotting demo's: a plan that is spread over frames may give up the frame here: Tow.pauseIn)
    if Tow.pauseIn then Tow.pauseIn() end
    local plan, why = Tow.Fd.trySpot(st0, spot, reach, wp, hx, hz, t.ax, t.az, t.K, t.rho, t.onRoad)
    if plan and Tow.Fd.soft then
      plan.note = plan.note .. string.format('; way %d of %d tried: %s', i, #tries, t.what)
      local g = math.min(plan.roomOf[1] or 99, plan.roomOf[3] or 99)
      if not roomy or g > roomy.g then roomy, roomyI = { plan = plan, g = g }, i end
    elseif plan then
      plan.note = plan.note .. string.format('; way %d of %d tried: %s%s', i, #tries, t.what, first and ('; the first was dropped: ' .. first) or '')
      if plan.pivot <= TOW.pivotOk then return plan end
      logLine(string.format('tow: to %s, way %d of %d (%s) can be driven, but the tractor would turn %.0f degrees a metre: a gentler one is looked for', tostring(spot.name), i, #tries, t.what, plan.pivot))
      if not best or plan.pivot < best.pivot then best, bestI = plan, i end
    else
      Tow.Fd.log(string.format('tow: to %s, way %d of %d (%s) is not driven: %s', tostring(spot.name), i, #tries, t.what, tostring(why)))
      first = first or string.format('%s (%s)', tostring(why), t.what)
    end
  end
  if roomy then
    Tow.Fd.log(string.format('tow: to %s: no way is clear of the other aircraft: way %d keeps the most room', tostring(spot.name), roomyI))
    return roomy.plan
  end
  if best then
    logLine(string.format('tow: to %s: no gentler way: way %d is driven', tostring(spot.name), bestI))
    return best
  end
  return nil, string.format('no tow to %s from here: %s; nor any of the other %d ways tried (the log has each).', spot.name, tostring(first), #tries - 1)
end

-- J: where the aircraft to tow stands ({ x, z }); subj: it is a parked aircraft of the deck tool's (Tow.begin), not
-- the player's jet; me: the player's own jet on this deck, when another aircraft is towed
-- others: the other aircraft on the deck ({ x, z, fx, fz, name, half } each): the pull and the push are held against
-- them (Tow.Fd.limits, Tow.Fd.check); half: the towed aircraft's own wing, half its span as it stands
function Tow.Fd.plan(J, mode, arg, reach, fx, fz, nx, nz, subj, me, others, half)
  local plan, why = Tow.Fd.planOnce(J, mode, arg, reach, fx, fz, nx, nz, subj, me, others, half)
  if plan or not (others and #others > 0) then return plan, why end
  -- NOT CLEAR OF THE OTHER AIRCRAFT (or not at all): once more with a contact noted instead of refused. If that can be
  -- driven, it is the taxi road itself that runs through a parked aircraft (the roads are PriFly's, drawn before the
  -- deck was re-spotted): the tow goes, and says whom it goes through.
  Tow.Fd.log('tow: no way clear of the other aircraft (' .. tostring(why) .. '): looked for again with a contact allowed')
  Tow.Fd.soft = true
  local okp, plan2, why2 = pcall(Tow.Fd.planOnce, J, mode, arg, reach, fx, fz, nx, nz, subj, me, others, half)
  Tow.Fd.soft = nil
  if not okp then return nil, 'the plan failed: ' .. tostring(plan2) end
  if not plan2 then return nil, why end
  local g, name, tg, tname = plan2.roomOf[1], plan2.roomOf[2], plan2.roomOf[3], plan2.roomOf[4]
  local parts = {}
  if g and g < 0 then parts[#parts + 1] = string.format('the aircraft in tow goes %.1f m into %s', -g, tostring(name)) end
  if tg and tg < 0 then parts[#parts + 1] = string.format('the tractor goes through the wheels of %s', tostring(tname)) end
  if #parts == 0 then parts[1] = string.format('it comes within %.1f m of %s', g or 0, tostring(name or 'another aircraft')) end
  plan2.soft = true
  plan2.text = tostring(plan2.text) .. '. NOT CLEAR: ' .. table.concat(parts, ' and ') .. ' (the taxi road runs there; no clear way was found)'
  return plan2
end

-- the plan, once (Tow.Fd.soft: a contact with another aircraft is noted, not refused)
function Tow.Fd.planOnce(J, mode, arg, reach, fx, fz, nx, nz, subj, me, others, half)
  local routes = loadRoutes()
  local g = routes and routes.net
  if not g then return nil, 'the taxi network is missing (Scripts\\CATCC\\crewtest_routes.lua is absent or an older one): run crew-test\\install.ps1 with DCS closed' end
  local L = TOW.noseGear + TOW.mainGear
  local st0 = { d = { x = nx + fx * reach, z = nz + fz * reach, hx = fx, hz = fz }, lx = nx, lz = nz, mx = nx - fx * L, mz = nz - fz * L, fl = reach - TOW.hitch, blocks = Tow.Fd.blockList(),
    others = others, half = half }
  local jet = { x = J.x, z = J.z, fx = fx, fz = fz }
  if mode == 'cat' then
    if not (arg and arg >= 1 and arg <= 4 and arg == math.floor(arg)) then return nil, 'tow to which catapult? (1 to 4)' end
    return Tow.Fd.planCat(g, st0, jet, arg, reach)
  end
  local spot
  for _, e in ipairs(routes) do
    if e.spot == arg then spot = e end
  end
  if not spot then return nil, 'there is no deck spot ' .. tostring(arg) .. '.' end
  if math.sqrt((jet.x - spot.x) ^ 2 + (jet.z - spot.z) ^ 2) < 3 then return nil, 'you are on ' .. tostring(spot.name) .. ' already.' end
  -- one of the deck tool's Hornets on it (where each stands NOW: one that was towed away has left its spot free)? The
  -- player's own jet?
  if me and math.sqrt((me.x - spot.x) ^ 2 + (me.z - spot.z) ^ 2) < 8 then return nil, tostring(spot.name) .. ' is taken: your own jet stands on it.' end
  local by = Tow.Deck.taken(arg, subj and subj.e, J.ship)
  if by then
    if by.skipped then return nil, tostring(spot.name) .. ' is taken: an aircraft of the mission stood on it when the deck was filled.' end
    return nil, string.format('%s is taken: one of the deck tool\'s Hornets stands on it (%s).', tostring(spot.name), tostring(by.name))
  end
  return Tow.Fd.planSpot(g, st0, jet, spot, reach)
end

-- The tractor's way to the jet: along the roads to a point beside the jet's nose line, a U-turn onto the line clear
-- of the radome, and on to TOW.ahead beyond the hook-up place (as in the hangar); on the side it comes from, or the
-- other if there is no deck there. Driven in the head first.
-- others: the other aircraft on the deck ({ x, z, fx, fz } each): the tractor's way keeps clear of them as it does of
-- the jet it comes for; if there is no such way (a road runs close past a parked nose), it takes the roads
-- regardless of them, and the log says so.
-- BACKING OUT (2026-11-17): the tractor starts from where the last tow left it, facing whichever way it came to a
-- stop (at its waiting place: the way it drove in). Facing the deck's edge or the island it cannot turn onto its way
-- (a second tow was refused: "the tractor would leave the deck on its way"): it then backs STRAIGHT out TOW.backOut
-- metres first (the least that works; phase 'backout'), and its way starts there. Returns the way, nil, the metres
-- backed; or nil and why.
function Tow.Fd.arrival(d0, jet, nx, nz, fx, fz, reach, others)
  local g = Tow.Net.graph()
  if not g then return nil, 'the taxi network is missing' end
  local A = TOW.arr
  local pref = ((d0.x - nx) * -fz + (d0.z - nz) * fx) >= 0 and 1 or -1
  local blocks = Tow.Fd.blockList()
  -- where the tractor is to end: on the nose line, facing away from the aircraft, `near + R + run` beyond the hook-up
  -- place (it then backs straight onto the ring)
  local uG = reach + A.near + A.R + A.run
  local goal = { x = nx + fx * uG, z = nz + fz * uG, hx = fx, hz = fz }
  -- THE TURN ONTO THE NOSE LINE, drawn as it is to be driven (a point every half metre of the bend), in the
  -- aircraft's own frame (u: ahead of the nose wheel, along the nose; v: to the side `side`):
  --   'u'  along a line 2 R to the side TOWARDS the aircraft, a half circle of radius R (nearest the aircraft `near`
  --        beyond the hook-up place, R to the side), and out along the nose line;
  --   'q'  straight in from the side at `near` beyond the hook-up place, a quarter circle onto the nose line, and out.
  -- (2026-11-17, the first run on the flight deck: the turn was three square corners 8 m apart, which the tractor,
  -- turning on 4 m, cut: it ended 3.7 m off the nose line FACING the aircraft, and "backing onto the ring" slid it
  -- 10 m and spun it half round: the user: "the tug warped into its position and did a rapid/unrealistic turn". The
  -- way was only held to the deck, not to how it ended.)
  local function pattern(kind, side)
    local px, pz = -fz * side, fx * side
    local function at(u, v) return { nx + fx * u + px * v, nz + fz * u + pz * v } end
    local cu, cv = reach + A.near + A.R, A.R -- the bend's centre
    local pts, from
    if kind == 'u' then
      pts, from = { at(cu + A.lead, 2 * A.R), at(cu, 2 * A.R) }, 90
    else
      pts, from = { at(cu - A.R, A.R + A.lead), at(cu - A.R, A.R) }, 180
    end
    local n = math.max(2, math.ceil(math.rad(270 - from) * A.R / 0.5))
    for i = 1, n do
      local phi = math.rad(from + (270 - from) * i / n)
      pts[#pts + 1] = at(cu + A.R * math.cos(phi), cv + A.R * math.sin(phi))
    end
    pts[#pts + 1] = at(uG, 0)
    return pts
  end
  -- from s0 (the tractor where it stands, or backed out), clear of obs: the first turn that can be driven and ends in line
  local function ways(obs, s0, strict)
    local why
    for _, c in ipairs({ { 'u', pref }, { 'q', pref }, { 'q', -pref }, { 'u', -pref } }) do
      -- (the deck spotting demo's: planning that is spread over frames may give up the frame here: Tow.pauseIn)
      if Tow.pauseIn then Tow.pauseIn() end
      local pat = pattern(c[1], c[2])
      local room = true
      for _, p in ipairs(pat) do
        if not Tow.Fd.on(p[1], p[2], 2) then room = false end
      end
      if not room then
        why = why or string.format('there is not the deck ahead of your nose for the tractor to turn round on (it needs %.0f m straight ahead of the nose wheel and %.0f m to one side)', uG + A.lead - A.run, 2 * A.R)
      else
        -- (Tow.Fd.finder: the deck spotting demo's own way across the open deck; else along the taxi roads)
        local way = (Tow.Fd.finder or Tow.Net.solo)(g, { s0.x, s0.z }, pat[1], obs, s0)
        if not way then
          why = why or 'the tractor finds no way to your nose'
        else
          local path = Tow.Net.smooth(way, 5)
          for i = 2, #pat do path[#path + 1] = pat[i] end
          local good, bad = Tow.Fd.simSolo(s0, path, blocks, goal, strict and others or nil)
          if good then return path, nil, c[1] .. (c[2] == pref and '' or ', from the other side') end
          why = why or bad
        end
      end
    end
    return nil, why
  end
  -- where the tractor stands after backing straight out `back` metres, if there is the deck for it
  local function backed(back)
    for k = 1, back do
      local x, z = d0.x - d0.hx * k, d0.z - d0.hz * k
      -- (the tractor's own point, and the end of the bar trailing 7.4 m behind it, which goes first)
      if not (Tow.Fd.on(x, z, 1.0) and Tow.Fd.on(x - d0.hx * 7.4, z - d0.hz * 7.4, 0.3)) then return nil end
      for _, b in ipairs(blocks or {}) do
        if inBox(b, x, z) then return nil end
      end
    end
    return { x = d0.x - d0.hx * back, z = d0.z - d0.hz * back, hx = d0.hx, hz = d0.hz }
  end
  local sets = {}
  if others and #others > 0 then
    local obs = { jet }
    for _, o in ipairs(others) do obs[#obs + 1] = o end
    sets[1] = { obs = obs, clear = true }
  end
  sets[#sets + 1] = { obs = { jet } }
  local why
  for _, set in ipairs(sets) do
    for _, back in ipairs(TOW.backOut) do
      local s0 = backed(back)
      if s0 then
        local path, bad, how = ways(set.obs, s0, set.clear)
        if path then
          if others and #others > 0 then
            Tow.Fd.log(set.clear and string.format('tow: the tractor\'s way to the aircraft keeps clear of the %d other aircraft on the deck', #others)
              or string.format('tow: the tractor finds no way to the aircraft that keeps clear of the %d other aircraft on the deck: it takes the roads regardless of them', #others))
          end
          Tow.Fd.log(string.format('tow: the tractor\'s turn onto the nose line: %s; it ends %.1f m beyond the hook-up place, at %.1f / %.1f, and backs onto the ring from there',
            how:sub(1, 1) == 'u' and ('a half circle of ' .. A.R .. ' m' .. how:sub(2)) or ('in from the side, a quarter circle of ' .. A.R .. ' m' .. how:sub(2)), uG - reach, goal.x, goal.z))
          if back > 0 then Tow.Fd.log(string.format('tow: from where it stands (%.1f / %.1f, heading %.2f %.2f) the tractor cannot turn onto its way: it backs straight out %d m first', d0.x, d0.z, d0.hx, d0.hz, back)) end
          return path, nil, back
        end
        why = why or bad
      end
    end
  end
  return nil, why
end

-- unhooked: the tractor's way back to its waiting place (round the jet it has just let go), or nil
function Tow.Fd.homeWay(w)
  local g = Tow.Net.graph()
  if not g then return nil end
  local d, H = w.d, w.home or TOW.deckHome
  local from = { d.x + d.hx * 4, d.z + d.hz * 4 }
  local obs = w.jfx and { { x = w.jx, z = w.jz, fx = w.jfx, fz = w.jfz } } or {}
  -- the ways to try: clear of the other aircraft on the deck too (if there are any), then regardless of them; each
  -- with its corners rounded on 5 m, then tighter (3, 2: a way that cuts a corner of the island on 5 m may clear it)
  local sets = {}
  if w.others and #w.others > 0 then
    local all = {}
    for _, o in ipairs(obs) do all[#all + 1] = o end
    for _, o in ipairs(w.others) do all[#all + 1] = o end
    sets[1] = { obs = all, what = string.format('clear of the %d other aircraft on the deck', #w.others) }
  end
  sets[#sets + 1] = { obs = obs, what = (w.others and #w.others > 0) and string.format('regardless of the %d other aircraft on the deck', #w.others) or nil }
  local blocks = Tow.Fd.blockList()
  local why
  for _, set in ipairs(sets) do
    local way = (Tow.Fd.finder or Tow.Net.solo)(g, from, { H.x, H.z }, set.obs, d)
    if way then
      for _, r in ipairs({ 5, 3, 2 }) do
        local path = Tow.Net.smooth(way, r)
        table.insert(path, 1, { d.x, d.z })
        local good, bad = Tow.Fd.simSolo(d, path, blocks)
        if good then
          Tow.Fd.log(string.format('tow: the tractor\'s way home: %d points, %.0f m%s%s', #path, routeLengths(path)[#path], set.what and (', ' .. set.what) or '', r ~= 5 and string.format(' (its corners rounded on %d m)', r) or ''))
          return path
        end
        why = why or bad
      end
    end
  end
  Tow.Fd.log('tow: the tractor\'s way home is not driven (' .. tostring(why or 'no way found') .. '): it moves 8 m on and waits there')
  return nil
end

-- the pull has ended: the push is worked out again from where the tow ACTUALLY stands (the plan's was from where
-- the pull ended in the head: a few centimetres from this). True; or nil and why it is not driven
function Tow.Fd.pushBegin(w)
  local p = w.push
  -- (held against the other aircraft as the plan was: their shapes and the room for each are the plan's; a plan that
  -- was not clear of them is not refused for it now)
  Tow.Fd.soft = w.soft
  local okb, rec, facts = pcall(Tow.Fd.back, { d = w.d, lx = w.lx, lz = w.lz, mx = w.mx, mz = w.mz, fl = Tow.flat(w), blocks = (w.env and w.env.blocks or Tow.Fd.blockList)(), others = w.others, half = w.half }, p.mF, p.hx, p.hz, p.K, p.rho)
  Tow.Fd.soft = nil
  if not okb then rec, facts = nil, rec end
  if not rec then
    logLine('tow: the push is not driven from where the pull ended: ' .. tostring(facts))
    return nil, tostring(facts)
  end
  w.pushRec, w.pushAt = rec, { s = 0, v = 0 }
  w.d.v = 0
  -- (w.pushDoor = { s, lim, x1, x2, pts }: the deck spotting demo's: a push onto a hangar elevator that is still up
  -- STOPS SHORT OF ITS DOOR: where the first of the aircraft's points (pts: { forward, to the side } of its own
  -- position) would come past the line `lim` metres out on side s (1 starboard, -1 port), between x1 and x2 forward.
  -- w.pushStop: how far along the push that is; the demo takes both off when the platform is down, and the push goes on)
  w.pushStop, w.pushHeld = nil, nil
  local D = w.pushDoor
  if D then
    for i = 1, #rec do
      local q = rec[i]
      local fx, fz = Tow.unit(q[5] - q[7], q[6] - q[8])
      local px, pz = q[5] - fx * TOW.noseGear, q[6] - fz * TOW.noseGear
      local over = false
      for _, pt in ipairs(D.pts) do
        local x, z = px + fx * pt[1] - fz * pt[2], pz + fz * pt[1] + fx * pt[2]
        if x >= D.x1 and x <= D.x2 and D.s * z > D.lim then
          over = true
          break
        end
      end
      if over then
        w.pushStop = math.max(0, (i - 2) * rec.ds)
        break
      end
    end
  end
  logLine(string.format('tow: the push worked out from where the pull ended: %.1f m, the nose wheel turned %.0f degrees at most; it ends %.2f m and %.1f degrees off the spot (the %.2f m taken out over its last 3 m)',
    facts.len, facts.steer, facts.off, facts.turn, facts.off))
  return true
end

-- the push, dt on: the tractor, the nose wheel and the main wheels put where the record has them (Tow.apply then
-- places everything from those). True when the jet is on the spot.
function Tow.Fd.pushStep(w, dt)
  local r, p, d = w.pushRec, w.pushAt, w.d
  local total = (#r - 1) * r.ds
  -- (w.pushStop: it stops there, short of a hangar door, until that is taken off: Tow.Fd.pushBegin)
  local lim = (w.pushStop and w.pushStop < total) and w.pushStop or total
  local remain = math.max(0, lim - p.s)
  local done = total - p.s <= 0.005
  local held = not done and lim < total and remain <= 0.005
  w.pushHeld = held or nil
  if held then
    p.v = 0
  elseif not done then
    -- (where neither the aircraft nor the tractor turns over the next 4 m of the push: TOW.straight times as fast)
    local vmax = TOW.backSpeed
    do
      local i0 = math.max(1, math.min(#r, math.floor(p.s / r.ds) + 1))
      local a0, a1 = r[i0], r[math.min(#r, i0 + math.floor(4 / r.ds))]
      local j0x, j0z = Tow.unit(a0[5] - a0[7], a0[6] - a0[8])
      local j1x, j1z = Tow.unit(a1[5] - a1[7], a1[6] - a1[8])
      if j0x * j1x + j0z * j1z > 0.9994 and a0[3] * a1[3] + a0[4] * a1[4] > 0.9994 then vmax = TOW.backSpeed * TOW.straight end
    end
    p.v = math.min(math.min(vmax, math.sqrt(2 * TOW.accel * remain) + 0.03), p.v + TOW.accel * dt)
    p.s = math.min(lim, p.s + p.v * dt)
  end
  local at = done and #r or (p.s / r.ds + 1)
  local i = math.max(1, math.min(#r - 1, math.floor(at)))
  local k = math.min(1, at - i)
  local a, b = r[i], r[i + 1]
  local function mix(j) return a[j] + (b[j] - a[j]) * k end
  d.x, d.z = mix(1), mix(2)
  d.hx, d.hz = Tow.unit(mix(3), mix(4))
  d.v = (done or held) and 0 or -p.v
  w.lx, w.lz, w.mx, w.mz = mix(5), mix(6), mix(7), mix(8)
  return done
end

-- the deck spots for the menu's "Tow me to a parking spot", bow to stern, in groups of at most ten (an F10 menu holds
-- ten items): "label::number=name,number=name;;label::..."
function Tow.Fd.menu()
  local routes = loadRoutes()
  if not routes then return '' end
  local areas, order = {}, {}
  for _, e in ipairs(routes) do
    if e.spot and e.name and e.x then
      local area = e.area or (tostring(e.name):gsub('%s*%d+$', ''))
      local a = areas[area]
      if not a then
        a = { name = area, x = -1e9, list = {} }
        areas[area] = a
        order[#order + 1] = a
      end
      a.list[#a.list + 1] = e
      if e.x > a.x then a.x = e.x end
    end
  end
  table.sort(order, function(p, q) return p.x > q.x end)
  local groups, cur = {}, nil
  for _, a in ipairs(order) do
    table.sort(a.list, function(p, q) return tostring(p.name) < tostring(q.name) end)
    if not cur or #cur.items + #a.list > 10 then
      cur = { names = {}, items = {} }
      groups[#groups + 1] = cur
    end
    cur.names[#cur.names + 1] = a.name
    for _, e in ipairs(a.list) do cur.items[#cur.items + 1] = e.spot .. '=' .. tostring(e.name) end
  end
  local out = {}
  for _, gr in ipairs(groups) do out[#out + 1] = table.concat(gr.names, ', ') .. '::' .. table.concat(gr.items, ',') end
  return table.concat(out, ';;')
end

-- the in-game panel shown or put away from the F10 menu (its hot key is Ctrl+Shift+F10)
function commands.panel()
  if not (CATCC_UI and CATCC_UI.toggle) then return say('the in-game panel is not there (Scripts\\CATCC\\crewtest_ui.lua was not loaded: the hook\'s log says why).') end
  local shown, why = CATCC_UI.toggle()
  if shown == nil then return say('the in-game panel could not be shown: ' .. tostring(why)) end
  logLine('panel: ' .. (shown and 'shown' or 'put away') .. ' from the F10 menu')
end

-- ---- the axle finder
-- A marker (a rod in magenta and cyan bands across the jet, a yellow cube on each end, a yellow disc at its
-- middle) stood under where the hook takes the nose wheel axle to be: a static LINKED to the ship, made by the
-- mission script (CATCC_CR.marker) exactly as the chock test made its chocks, and made anew at every move (a
-- static cannot be moved). A linked static stands on the flight deck, so the rod's height is in the model: one
-- model for every centimetre, CATCC_AxleMarker_H15 ... _H40 (crew-test/model/build_axle_marker.py, Blender-made
-- as the chock was). It does not follow the jet: "Report" or any move puts it under the jet as it then stands.
-- (2026-11-15: the first finder made unlinked statics of types named "CATCC axle marker" with models from our
-- own .edm writer and placed them every frame through the native module; DCS made none of them.)
function Tow.axleCm() return math.max(15, math.min(40, math.floor(Tow.axleUp() * 100 + 0.5))) end

function Tow.axleText()
  return string.format('the marker axle is %.3f m ahead of your jet\'s own position and %.3f m below it (the rod %.2f m above the deck)', TOW.noseGear, TOW.axleDown, Tow.axleCm() / 100)
end

-- the marker made (again) where the numbers now put it: { id, name, type, x, z }; or nil, why
function Tow.axlePlace(ctx)
  local fx, fz = Tow.unit(ctx.fx, ctx.fz)
  local x, z = ctx.jx + fx * TOW.noseGear, ctx.jz + fz * TOW.noseGear
  local typ = string.format('CATCC_AxleMarker_H%02d', Tow.axleCm())
  local ok, r = pcall(dostring, string.format('return (CATCC_CR and CATCC_CR.marker) and CATCC_CR.marker("catcc-axle", %q, %.4f, %.4f, %.5f)', typ, x, z, (math.atan2 or math.atan)(fz, fx))
    .. ' or "ERR|the menu script cannot place markers: run crew-test\\\\install.ps1 with DCS closed"')
  local p = (ok and type(r) == 'string') and split(r) or { 'ERR', tostring(r) }
  if p[1] ~= 'OK' then return nil, tostring(p[2]) end
  -- THE WIDTH (the user, 2026-11-16: "a tool for gauging the width of the hornet axles... the width still needs to be
  -- set for the tow bar to look correct"): an upright cyan plate either side of the nose gear, along the jet's own
  -- line, TOW.axleLen apart (CATCC_AxleEnd: one model, it stands on the deck). Moved in and out until each touches
  -- its nose tyre's outer face: the tow bar's heads then come 2 cm outside them, their pins inwards into the axle.
  -- (the jet's right on the ship is (-fz, fx))
  local half, ang = TOW.axleLen / 2, (math.atan2 or math.atan)(fz, fx)
  local ends = {}
  for _, sd in ipairs({ { 'catcc-axle-l', -1 }, { 'catcc-axle-r', 1 } }) do
    local oke, re = pcall(dostring, string.format('return CATCC_CR.marker(%q, "CATCC_AxleEnd", %.4f, %.4f, %.5f)', sd[1], x - fz * half * sd[2], z + fx * half * sd[2], ang))
    ends[#ends + 1] = (oke and type(re) == 'string' and re:sub(1, 3) == 'OK|') and 'made' or tostring(re)
  end
  return { id = tonumber(p[2]), name = p[3], type = typ, x = x, z = z, jy = ctx.jy, ends = ends[1] == 'made' and ends[2] == 'made' and 'made' or (ends[1] .. ' / ' .. ends[2]) }
end

function Tow.axleWidthText()
  return string.format('the end plates are %.3f m apart', TOW.axleLen)
end

function commands.axle(what, arg)
  local a = Tow.ax
  local shown = (a and a.on) and '' or ' (The marker is not shown: F10 > Tow > Axle finder > Show.)'
  local function place(why)
    local ctx, err = getCtx()
    if not ctx then return nil, "can't tell where you are: " .. tostring(err) end
    local m, e = Tow.axlePlace(ctx)
    if not m then
      logLine('axle finder: no marker (' .. why .. '): ' .. tostring(e))
      return nil, 'the marker axle could not be made: ' .. tostring(e)
    end
    logLine(string.format('axle finder: marker "%s" (%s, object %s) linked to the ship at %.3f fwd %.3f stbd; the jet at %.3f / %.3f / %.3f, nose %.3f %.3f (%s); end plates %.3f m apart: %s', tostring(m.name), m.type,
      tostring(m.id), m.x, m.z, ctx.jx, ctx.jy, ctx.jz, ctx.fx, ctx.fz, why, TOW.axleLen, tostring(m.ends)))
    return m
  end
  local function numbers() return string.format('noseGear=%.3f axleDown=%.3f axleLen=%.3f', TOW.noseGear, TOW.axleDown, TOW.axleLen) end
  if what == 'show' then
    if a and a.on then
      a.on = false
      for _, key in ipairs({ 'catcc-axle', 'catcc-axle-l', 'catcc-axle-r' }) do
        pcall(dostring, string.format('return CATCC_CR and CATCC_CR.marker and CATCC_CR.marker(%q, "", 0, 0, 0)', key))
      end
      logLine('command axle show: put away. ' .. numbers())
      return say('axle finder: the marker is put away; ' .. Tow.axleText():gsub('^the marker axle is', 'the axle is taken to be') .. '. The tow uses these.')
    end
    if not a then
      a = {}
      Tow.ax = a
      -- once a mission, for the log: which of our static types DCS makes, linked and not
      local ok, r = pcall(dostring, 'return (CATCC_CR and CATCC_CR.probe) and CATCC_CR.probe() or "ERR|the menu script has no probe"')
      logLine('axle finder: what DCS makes of our static types: ' .. tostring(r))
    end
    -- (the rod's height goes by whole centimetres, the nearest to the tow's number; "Up / down" steps from there)
    local m, e = place('shown')
    if not m then return say(e) end
    a.on = true
    logLine('command axle show: shown. ' .. numbers())
    return say('axle finder: a rod in magenta and cyan bands with a yellow cube on each end stands across your nose gear, where the hook takes the nose wheel axle to be: '
      .. Tow.axleText() .. '. Move it (F10 > Tow > Axle finder) until, seen from the side, the yellow cube is on the middle of the wheel hub. The two cyan plates either side are the axle\'s width (' .. Tow.axleWidthText()
      .. '): move them (Width) until each touches its nose tyre\'s outer face. It all stands on the flight deck and does not follow the jet.')
  end
  if what == 'fwd' or what == 'up' or what == 'len' then
    local step = tonumber(arg)
    if not step then return say('unknown axle finder step') end
    local note = ''
    if what == 'fwd' then
      TOW.noseGear = TOW.noseGear + step
    elseif what == 'len' then
      TOW.axleLen = math.max(0.20, math.min(1.20, TOW.axleLen + step))
    else
      local cm = Tow.axleCm() + math.floor(step * 100 + 0.5)
      if cm < 15 or cm > 40 then
        cm = math.max(15, math.min(40, cm))
        note = ' (The marker goes from 0.15 to 0.40 m above the deck.)'
      end
      TOW.axleDown = TOW.gearUp - cm / 100
    end
    logLine(string.format('command axle %s %+.3f: %s', what, step, numbers()))
    if a and a.on then
      local m, e = place(what)
      if not m then
        a.on = false
        return say(e)
      end
    end
    if what == 'len' then return say('axle finder: ' .. Tow.axleWidthText() .. ' (the tow bar\'s pins go ' .. string.format('%.3f', TOW.axleLen / 2 - TOW.pinIn) .. ' m either side).' .. shown) end
    return say('axle finder: ' .. Tow.axleText() .. '.' .. note .. shown)
  end
  if what == 'report' then
    if a and a.on then place('report') end
    logLine('command axle report: ' .. numbers() .. ((a and a.on) and '' or ' (marker not shown)'))
    return say('axle finder: ' .. Tow.axleText() .. '; ' .. Tow.axleWidthText() .. '. The tow uses these.' .. shown)
  end
  say('unknown axle finder command ' .. tostring(what))
end

-- ---------------------------------------------------------------- the deck spotting tool (F10 > CATCC deck spots)
-- Asked for by the user (2026-11-16): he always starts on the same spot and cannot judge the others: "spawn a full
-- deck of aircraft for me to review ... menu items to lock on to the nearest aircraft and adjust its position in
-- large and small increments, including rotation, so I can spot the entire deck accurately and you can record the
-- exact locations".
--   A static F/A-18C is parked on every deck spot (the spots of crewtest_routes.lua: PriFly's spotting plan), each a
--   static LINKED to the ship, made by the mission script (CATCC_CR.deck) and made anew when it is moved (as the chock
--   test's and the axle finder's). No spot is filled where a live aircraft stands (the player's own).
--   Lock: the aircraft the camera looks at (where its line of sight meets the deck; looking level or up, the one
--   nearest the camera): so from any outside view, F11's free camera best. Moves are along the aircraft's OWN nose and
--   wings, 1 m / 10 cm / 1 cm; turns 5 / 1 / 0.1 degrees.
--   Everything is written, at every change, to Saved Games\DCS\Logs\catcc-deck-spots.lua (a Lua table: for every spot
--   its place now and the built-in place it started from; added and removed ones marked), and that file is taken up
--   again the next time the deck is filled: the work carries over from mission to mission, and it is the record.
--   Wings: the statics' model argument 8 (the F/A-18C's wing fold: FA-18C_Collision.edm, 100 degrees at 1) is set
--   through native.objarg, every second; folded to begin with (the spots were drawn for folded wings).
-- (All of it hangs on Tow: a Lua chunk takes 200 local names and this file has them.)
-- jy: a parked jet's own position above the ship's origin (the flight deck 20.149 m, the jet 1.826 m above it: the
-- player's stood at 21.975): the height the camera's line of sight is measured against.
-- THE HANGAR TOO (the user, 2026-11-18: "The hangar space doesn't actually manage what was generated in the svg. I need
-- to manually adjust the deck spotting. Make the 'Park Hornets' function add all the aircraft in the hangar as well so I
-- can adjust them through the UI"): the hangar plan's slots (Scripts/CATCC/crewtest_hangar.lua, the deck spotting demo's)
-- are parked with the rest, on the hangar floor (made on the flight deck like the others, then put down by the native
-- module in the ship's frame, as the demo does). They are entries like the deck's, `hangar = true`, numbered 1000 + the
-- slot ("Hangar 7" is n = 1007), saved in the same file. Which level the tool works on follows the CAMERA: below the
-- flight deck (TOW.hangarBelow) the hangar's aircraft are the ones locked, clicked and added; above it the deck's. They
-- are not the tow tool's (it neither tows them nor steers round them). hy: a hangar aircraft's own position above the
-- ship's origin (the floor + 1.856, the demo's DY).
Tow.Deck = { type = 'FA-18C_hornet', clear = 14, foldArg = 8, fold = true, foldT = 0, file = writedir .. 'Logs/catcc-deck-spots.lua', jy = 21.975, hangarN = 1000, hy = 8.711 + 1.856 }

-- AN OBJECT'S MODEL ARGUMENTS, ALL AT ONCE (the demo's lookalike: a parked static Hornet's pose, crewtest_demo.lua
-- LOOK.scan): every argument from 0 until the model has no more (or max) read on the main thread; "<last read>|n=v;n=v..."
-- with the ones not 0, or nil and why. On the demo's own thread one call to the main thread for all of them (the
-- worker's WORKER.objargs), not one a value.
function Tow.objargs(h, id, max)
  if CATCC_WORKER then
    if not CATCC_WORKER.objargs then return nil, 'the worker has no objargs' end
    return CATCC_WORKER.objargs(h, id, max)
  end
  if not (native and native.objarg) then return nil, 'no native module' end
  max = tonumber(max) or 1100
  local out, n = {}, 0
  while n <= max do
    local ok, v = pcall(native.objarg, h, id, n)
    if not ok or type(v) ~= 'number' then break end
    if v ~= 0 then out[#out + 1] = string.format('%d=%.4f', n, v) end
    n = n + 1
  end
  return (n - 1) .. '|' .. table.concat(out, ';')
end

-- the hangar plan's slots as entries (none without the plan or without the native module to put them down)
function Tow.Deck.hangarBuiltIn()
  local D, out = Tow.Deck, {}
  if not (native and native.staticpos) then return out end
  local f = loadfile(writedir .. 'Scripts/CATCC/crewtest_hangar.lua')
  local ok, H = pcall(function() return f and f() end)
  if not (ok and type(H) == 'table' and type(H.slots) == 'table') then return out end
  if tonumber(H.floor) then D.hy = H.floor + 1.856 end
  for _, s in ipairs(H.slots) do
    local hd = math.deg(atan2(s.fz or 0, s.fx or 1)) % 360
    out[#out + 1] = { n = D.hangarN + s.n, name = 'Hangar ' .. s.n, x = s.x, z = s.z, hdg = hd, x0 = s.x, z0 = s.z, hdg0 = hd, hangar = true }
  end
  return out
end

-- an entry's own height above the ship's origin; is the camera (its height cy) in the hangar
function Tow.Deck.yOf(e) return e.hangar and Tow.Deck.hy or Tow.Deck.jy end
-- (IN THE HANGAR: the camera below the flight deck's own surface (jy is a parked jet's position, 1.826 m above it),
-- less 0.4 m. Until 2026-11-18 the line was TOW.hangarBelow, 14 m above the ship's origin, which is right for a
-- JET's own position (10.6 in the hangar, 22 on deck) but not for a camera: the hangar is some 7 m high, and a camera
-- looking down from under its roof was above 14: the user: "when I tried to add an aircraft it appeared on the flight
-- deck instead of inside the hangar", and his clicks from up there locked deck aircraft 11 m off the line of sight.
-- From below the flight deck no aircraft on it can be seen, so nothing of the deck's is lost by this.)
function Tow.Deck.below(cy) return cy ~= nil and cy < Tow.Deck.jy - 1.826 - 0.4 end

-- a hangar entry put down on the hangar floor (after it is made, and in turn every tenth of a second: Tow.Deck.tick)
function Tow.Deck.putDown(e)
  if not (e.hangar and e.id and native and native.staticpos) then return end
  local hr = math.rad(e.hdg)
  local ok, res, er = pcall(native.staticpos, e.id, unpack(Tow.pose(Tow.OWN, e.x, Tow.Deck.hy, e.z, math.cos(hr), math.sin(hr))))
  if not (ok and res) and not Tow.Deck.downBad then
    Tow.Deck.downBad = true
    logLine(string.format('deck spots: %s could not be put down in the hangar: %s', Tow.Deck.text(e), tostring(ok and er or res)))
  end
end

-- What the deck tool says on the screen takes the place of its last message (the user, 2026-11-16: a line for every
-- nudge, 20 s each, made "a huge long stack that blocks the screen"), and stays 8 s. The panel shows it too.
function Tow.Deck.say(text) return say(text, 8, true) end

-- WHICH CARRIER (the user, 2026-11-16): the one the CAMERA is at, not the one the player's jet stands on ("if I slot into
-- an aircraft 100 km away, but have the camera overhead the carrier I want to spot it should still work"). So: the
-- Supercarrier-class ship nearest the camera, within 5 km (CATCC_CR.ctx with the camera's place); once aircraft are
-- parked, that same ship by name until they are taken away (a camera wandering to another carrier does not move the
-- work there). With no camera to read: the jet's own carrier, as before. Asked once a frame at most (t).
function Tow.Deck.ctx(t)
  local D = Tow.Deck
  if t and D.ctxT == t then return D.ctxV, D.ctxErr end
  -- ON THE DEMO'S THREAD: the main thread's own answer to this, one value sent with each frame. NOT asked here with
  -- the camera's place: that place is another number every frame (the ship steams), so the question was a new one
  -- every frame: the user's first run on the thread, 2026-11-20: each was waited for (a frame of DCS's for every
  -- step) and then asked again by the main thread for another 600 steps: 650 to 830 questions to the mission's
  -- scripting state every frame, 240 KB a frame sent, the hook 47 ms a frame where it had taken 2.
  -- (CATCC_DEMO_NO_DECKCTX: the rig's: as it was, to try what the worker does when a question does change every frame)
  if CATCC_WORKER and not CATCC_DEMO_NO_DECKCTX then
    local c, err = CATCC_WORKER.read('h.deckctx')
    D.ctxT, D.ctxV, D.ctxErr = t, c, err
    return c, err
  end
  local c, err
  if D.shown and D.ship and t then
    c = Tow.ctx(t, D.ship) -- (asked once a frame for the tow and the deck tool alike)
    if not c then c, err = getCtx(nil, nil, D.ship) end
  elseif D.shown and D.ship then
    c, err = getCtx(nil, nil, D.ship)
  elseif D.want then
    -- (the slot picker's "Spot Deck": the carrier it shows, by name, wherever the camera is: demo2|start|<ship>)
    c, err = getCtx(nil, nil, D.want)
  else
    local okc, cp = pcall(function() return Export and Export.LoGetCameraPosition and Export.LoGetCameraPosition() end)
    if okc and type(cp) == 'table' and cp.p then c, err = getCtx(cp.p.x, cp.p.z) end
    if not c then
      local c2, err2 = getCtx()
      c, err = c2, err or err2
    end
  end
  D.ctxT, D.ctxV, D.ctxErr = t, c, err
  return c, err
end

function Tow.Deck.builtIn()
  local out = {}
  for _, e in ipairs(loadRoutes() or {}) do
    if e.spot and e.x and e.z then
      local hd = math.deg((math.atan2 or math.atan)(e.fz or 0, e.fx or 1)) % 360
      out[#out + 1] = { n = e.spot, name = tostring(e.name or ('spot ' .. e.spot)), x = e.x, z = e.z, hdg = hd, x0 = e.x, z0 = e.z, hdg0 = hd }
    end
  end
  return out
end

-- the list to work on: the saved file's if there is one (and `fresh` is not asked for), else the built-in spots
function Tow.Deck.begin(fresh)
  local D = Tow.Deck
  local list, from = nil, 'the built-in spots'
  if not fresh then
    local f = loadfile(D.file)
    local ok, t = pcall(function() return f and f() end)
    if ok and type(t) == 'table' and #t > 0 then list, from = t, 'the saved file (Logs\\catcc-deck-spots.lua)' end
  end
  list = list or D.builtIn()
  -- (the hangar's: from the plan, if the list has none of them yet: a file saved before they were there has none)
  local hasH = false
  for _, e in ipairs(list) do if e.hangar then hasH = true end end
  if not hasH then
    for _, e in ipairs(D.hangarBuiltIn()) do list[#list + 1] = e end
  elseif not (native and native.staticpos) then
    local keep = {}
    for _, e in ipairs(list) do if not e.hangar then keep[#keep + 1] = e end end
    list = keep
  else
    D.hangarBuiltIn() -- (the floor's height)
  end
  for i, e in ipairs(list) do e.key, e.id, e.skipped = 'catcc-spot-' .. i, nil, nil end
  D.list, D.lock = list, nil
  return from
end

function Tow.Deck.save()
  local D = Tow.Deck
  if not D.list then return false end
  local f = io.open(D.file, 'w')
  if not f then
    logLine('deck spots: the file could not be written: ' .. D.file)
    return false
  end
  f:write('-- CATCC deck spots as set in DCS with F10 > CATCC deck spots. Written by the crew test hook, ' .. tostring(os.date('%Y-%m-%d %H:%M:%S')) .. '.\n')
  f:write('-- x: metres forward of the ship\'s origin; z: metres to starboard; hdg: the way the nose points, degrees clockwise from the bow.\n')
  f:write('-- x0, z0, hdg0: the built-in spot it started from. moved / added / removed: what was done to it.\n')
  f:write('return {\n')
  for _, e in ipairs(D.list) do
    local moved = e.x0 and (math.abs(e.x - e.x0) > 0.0005 or math.abs(e.z - e.z0) > 0.0005 or math.abs(e.hdg - e.hdg0) > 0.005)
    f:write(string.format('  { n = %d, name = %q, x = %.3f, z = %.3f, hdg = %.2f%s%s%s%s%s },\n', e.n, e.name, e.x, e.z, e.hdg,
      e.x0 and string.format(', x0 = %.3f, z0 = %.3f, hdg0 = %.2f', e.x0, e.z0, e.hdg0) or '', moved and ', moved = true' or '', e.added and ', added = true' or '', e.removed and ', removed = true' or '',
      e.hangar and ', hangar = true' or ''))
  end
  f:write('}\n')
  f:close()
  return true
end

-- these made (anew) as linked statics, or taken away (removed ones; all with `away`). How many now stand, and the note
function Tow.Deck.make(entries, away)
  local D = Tow.Deck
  local parts = {}
  for _, e in ipairs(entries) do
    -- (its height: the mission script then minds only a live aircraft on the same level)
    parts[#parts + 1] = (away or e.removed) and e.key or string.format('%s,%.3f,%.3f,%.5f,%.3f', e.key, e.x, e.z, math.rad(e.hdg), D.yOf(e))
  end
  local ok, r = pcall(dostring, string.format('return (CATCC_CR and CATCC_CR.deck) and CATCC_CR.deck(%q, %q, %d, %s)', table.concat(parts, ';'), D.type, D.clear, D.ship and string.format('%q', D.ship) or 'nil')
    .. ' or "ERR|the menu script cannot park aircraft: run crew-test\\\\install.ps1 with DCS closed"')
  local p = (ok and type(r) == 'string') and split(r) or { 'ERR', tostring(r) }
  if p[1] ~= 'OK' then return nil, tostring(p[2]) end
  local n = 0
  for i, e in ipairs(entries) do
    local id = tonumber(p[1 + i])
    e.id, e.skipped = (id and id > 0) and id or nil, id == -1 or nil
    e.at = nil -- (made anew, it stands on its spot again, wherever a tow had taken it)
    if e.id then n = n + 1 end
    if e.hangar and e.id and not (away or e.removed) then D.putDown(e) end
  end
  D.foldT = 0 -- (the wings of the new ones: at the next frame)
  return n, (p[2 + #entries] and p[2 + #entries] ~= '') and p[2 + #entries] or nil
end

-- the wings of every parked aircraft set as D.fold says (once a second, and at once after anything was made)
function Tow.Deck.tick(t)
  local D = Tow.Deck
  -- (the hangar's told their place again, one every tenth of a second in turn, as the demo does with its own)
  if D.list and D.shown and #D.list > 0 and t >= (D.keepT or 0) then
    D.keepT = t + 0.1
    D.keepI = (D.keepI or 0) % #D.list + 1
    local e = D.list[D.keepI]
    if e and e.hangar and not e.removed then D.putDown(e) end
  end
  if not (D.list and D.shown and native and native.objarg) or D.foldBad or t < D.foldT then return end
  -- (all at once only after something was made or the wings were changed, D.foldT == 0; from then on ONE aircraft
  -- every tenth of a second, in turn: all forty every second was a hitch every second)
  local all = D.foldT == 0
  D.foldT = t + 0.1
  local h = shipHandle()
  if not h then
    if all then D.foldT = 0 end
    return
  end
  if not all then
    D.foldI = (D.foldI or 0) % #D.list + 1
    local e = D.list[D.foldI]
    if e and e.id then pcall(native.objarg, h, e.id, D.foldArg, D.fold and 1 or 0) end
    return
  end
  local done, bad, why = 0, 0, nil
  for _, e in ipairs(D.list) do
    if e.id then
      local ok, res, er = pcall(native.objarg, h, e.id, D.foldArg, D.fold and 1 or 0)
      if ok and res then done = done + 1 else bad, why = bad + 1, tostring(ok and er or res) end
    end
  end
  if not D.foldSaid or D.foldSaid ~= (done .. '/' .. bad) then
    D.foldSaid = done .. '/' .. bad
    logLine(string.format('deck spots: wings %s (model argument %d) on %d aircraft%s', D.fold and 'folded' or 'spread', D.foldArg, done,
      bad > 0 and string.format('; NOT on %d: %s', bad, tostring(why)) or ''))
  end
  if done == 0 and bad > 0 then
    D.foldBad = true -- (a static aircraft's arguments cannot be set this way: left as DCS draws them)
    Tow.Deck.say('deck spots: the parked aircraft\'s wings could not be folded (' .. tostring(why) .. '): they stay as DCS draws them.')
  end
end

-- where the camera is on the ship and where it looks: the point of the deck it looks at (nil: it looks level or up),
-- its own place, its heading (degrees clockwise from the bow), its height. In the hangar (the camera below the flight
-- deck) the point is where it looks at the height of a hangar aircraft.
function Tow.Deck.camera(ctx)
  if not (Export and Export.LoGetCameraPosition) then return nil end
  local ok, cp = pcall(Export.LoGetCameraPosition)
  if not (ok and type(cp) == 'table' and cp.p) then return nil end
  local s = ctx.s
  local function onShip(v, rel)
    local dx, dy, dz = v.x - (rel and s[10] or 0), v.y - (rel and s[11] or 0), v.z - (rel and s[12] or 0)
    return dx * s[1] + dy * s[2] + dz * s[3], dx * s[4] + dy * s[5] + dz * s[6], dx * s[7] + dy * s[8] + dz * s[9]
  end
  local cx, cy, cz = onShip(cp.p, true)
  local fx, fy, fz = 1, 0, 0
  if cp.x then fx, fy, fz = onShip(cp.x, false) end
  local at
  local up = cy - (Tow.Deck.below(cy) and Tow.Deck.hy or Tow.Deck.jy) -- (above the height a parked jet's own position has)
  if fy < -0.05 and up > 0.5 then
    local k = up / -fy
    if k < 400 then at = { cx + fx * k, cz + fz * k } end
  end
  return at, { cx, cz }, math.deg((math.atan2 or math.atan)(fz, fx)) % 360, cy
end

-- the aircraft nearest a line of sight (o: where it starts, d: its direction, both in the ship's frame: forward, up, to
-- starboard) is locked on: the in-game panel's click. Within 12 m of the line, else nothing changes. Only the aircraft
-- of the camera's own level: the flight deck's, or the hangar's with the camera below the flight deck.
function Tow.Deck.pick(o, d, ctx, why)
  local D = Tow.Deck
  if not (D.list and D.shown) then return nil end
  local dd = d[1] * d[1] + d[2] * d[2] + d[3] * d[3]
  local best, bd
  local inH = D.below(o[2])
  for i, e in ipairs(D.list) do
    if not e.removed and (e.hangar and true or false) == inH then
      local ex, ez = D.pose(e) -- (where it stands now: one that was towed is not on its spot)
      local v = { ex - o[1], D.yOf(e) - o[2], ez - o[3] }
      local k = (v[1] * d[1] + v[2] * d[2] + v[3] * d[3]) / dd
      if k > 0 then
        local off = math.sqrt((v[1] - d[1] * k) ^ 2 + (v[2] - d[2] * k) ^ 2 + (v[3] - d[3] * k) ^ 2)
        if not bd or off < bd then best, bd = i, off end
      end
    end
  end
  if not best or bd > 12 then
    logLine(string.format('deck spots: %s: no aircraft within 12 m of that line of sight (the nearest: %s)', tostring(why), bd and string.format('%.1f m', bd) or 'none ahead'))
    Tow.Deck.say('deck spots: no aircraft there.')
    return nil
  end
  D.lock = best
  logLine(string.format('command spot pick: %s; %.1f m from the line of sight (%s)', D.text(D.list[best]), bd, tostring(why)))
  Tow.Deck.say('deck spots: locked on ' .. D.text(D.list[best]) .. '.')
  return D.list[best]
end

function Tow.Deck.text(e)
  local d = ''
  if e.added then
    d = ' (added)'
  elseif e.x0 and (math.abs(e.x - e.x0) > 0.0005 or math.abs(e.z - e.z0) > 0.0005 or math.abs(e.hdg - e.hdg0) > 0.005) then
    d = string.format(' (from the built-in spot: %+.2f m forward, %+.2f m to starboard, %+.1f degrees)', e.x - e.x0, e.z - e.z0, (e.hdg - e.hdg0 + 180) % 360 - 180)
  end
  return string.format('%s %d "%s": %.2f m forward, %.2f m to starboard, nose %.1f degrees%s', e.hangar and 'hangar slot' or 'spot', e.hangar and (e.n - Tow.Deck.hangarN) or e.n,
    e.name, e.x, e.z, e.hdg, d)
end

-- WHERE AN AIRCRAFT STANDS NOW. A deck entry is a SPOT (e.x, e.z, e.hdg: what the file records) with the aircraft
-- parked on it; a tow takes the aircraft elsewhere: e.at = { x, z, hdg, where } then (kept by Tow.apply while it is
-- on the bar). The spot is not changed by a tow, nor the file. Made anew by the deck tool (a move, a turn, parked
-- again), the aircraft stands on its spot again (Tow.Deck.make).
function Tow.Deck.pose(e)
  local a = e.at
  if a then return a.x, a.z, a.hdg end
  return e.x, e.z, e.hdg
end

function Tow.Deck.label(e)
  return string.format('the Hornet of spot %d "%s"%s', e.n, tostring(e.name), e.at and (', now ' .. tostring(e.at.where)) or '')
end

-- is deck spot n (the routes file's number) taken: one of the deck tool's aircraft within 6 m of it as they stand now
-- (or a live aircraft, for which the tool left a spot empty)? Its entry, or nil. except: not counting that entry's;
-- ship: only if the deck tool works on that carrier
function Tow.Deck.taken(n, except, ship)
  local D = Tow.Deck
  if not (D.list and D.shown) or (ship and D.ship ~= ship) then return nil end
  local spot
  for _, r in ipairs(loadRoutes() or {}) do
    if r.spot == n then spot = r end
  end
  if not spot then return nil end
  for _, e in ipairs(D.list) do
    if e ~= except and not e.removed and not e.hangar and (e.id or e.skipped) then
      local x, z = D.pose(e)
      if math.sqrt((x - spot.x) ^ 2 + (z - spot.z) ^ 2) < 6 then return e end
    end
  end
  return nil
end

-- the deck tool's aircraft as they stand now, { x, z, fx, fz } each (not `except`'s; none if the tool works on
-- another carrier than `ship`): what the tow tractor keeps clear of
function Tow.Deck.others(except, ship)
  local D, out = Tow.Deck, {}
  if not (D.list and D.shown) or (ship and D.ship ~= ship) then return out end
  for _, e in ipairs(D.list) do
    if e ~= except and e.id and not e.removed and not e.hangar then
      local x, z, hdg = D.pose(e)
      -- (name, half: for "do two aircraft touch": whose it is, and its wing as the deck tool has them all: Tow.Fd.shape)
      out[#out + 1] = { x = x, z = z, fx = math.cos(math.rad(hdg)), fz = math.sin(math.rad(hdg)), name = 'the Hornet of ' .. tostring(e.name), half = D.fold and 4.2 or 6.3 }
    end
  end
  return out
end

function commands.spot(what, a, b)
  local D = Tow.Deck
  -- (whatever the tool does makes or takes away static aircraft: a spike of the tool's own, left out of "performance")
  if what ~= 'lock' and what ~= 'next' and what ~= 'report' then Tow.Prof.testOnly('the spotting tool making or taking away static aircraft') end
  local ctx, err = D.ctx()
  if not ctx then return Tow.Deck.say('deck spots: ' .. tostring(err) .. ' (put the camera over the carrier to spot).') end
  if what == 'spawn' or what == 'reset' then
    if D.list and D.shown then D.make(D.list, true) end
    -- (the carrier: the one the camera is at now; kept until the aircraft are taken away)
    D.shown, D.ship = nil, nil
    ctx, err = D.ctx()
    if not ctx then return Tow.Deck.say('deck spots: ' .. tostring(err) .. ' (put the camera over the carrier to spot).') end
    D.ship = ctx.ship
    local from = D.begin(what == 'reset')
    if #D.list == 0 then return Tow.Deck.say('deck spots: no spots to fill (Scripts\\CATCC\\crewtest_routes.lua is missing: run crew-test\\install.ps1 with DCS closed).') end
    local n, note = D.make(D.list)
    if not n then
      logLine('deck spots: nothing parked: ' .. tostring(note))
      return Tow.Deck.say('deck spots: the aircraft could not be parked: ' .. tostring(note))
    end
    D.shown, D.foldBad, D.foldSaid = true, nil, nil
    if not shipHandle() then doScan(ctx, 'for the deck spots', false) end
    local empty, gone, nh = {}, 0, 0
    for _, e in ipairs(D.list) do
      if e.removed then gone = gone + 1 elseif e.skipped then empty[#empty + 1] = e.hangar and ('hangar ' .. (e.n - D.hangarN)) or tostring(e.n) elseif e.hangar and e.id then nh = nh + 1 end
    end
    local inH = nh > 0 and string.format(' (%d of them in the hangar)', nh) or ''
    D.save()
    logLine(string.format('command spot %s: %d aircraft parked on %s (the carrier at the camera) from %s%s; left empty for a live aircraft: %s; removed spots: %d%s', what, n, tostring(D.ship), from, inH,
      #empty > 0 and table.concat(empty, ', ') or 'none', gone, note and ('; ' .. note) or ''))
    return Tow.Deck.say(string.format('deck spots: %d aircraft parked on %s%s, from %s%s%s. Look at one from outside (F11) and F10 > CATCC deck spots > Lock on the one the camera looks at.', n,
      tostring(D.ship), inH, from, #empty > 0 and ('; spot ' .. table.concat(empty, ', ') .. ' left empty (an aircraft stands there)') or '', gone > 0 and ('; ' .. gone .. ' removed before') or ''))
  end
  if not (D.list and D.shown) then return Tow.Deck.say('deck spots: park the aircraft first (F10 > CATCC deck spots > Park a Hornet on every deck spot).') end
  if what == 'clear' then
    D.make(D.list, true)
    D.shown, D.lock, D.ship = nil, nil, nil
    D.save()
    logLine('command spot clear: all taken away (their places are kept in the file)')
    return Tow.Deck.say('deck spots: all taken away. Their places are kept (Logs\\catcc-deck-spots.lua) and come back with "Park a Hornet on every deck spot".')
  end
  if what == 'fold' then
    D.fold, D.foldT, D.foldBad, D.foldSaid = not D.fold, 0, nil, nil
    logLine('command spot fold: wings ' .. (D.fold and 'folded' or 'spread'))
    return Tow.Deck.say('deck spots: wings ' .. (D.fold and 'folded.' or 'spread.'))
  end
  if what == 'lock' or what == 'add' then
    local at, cam, chdg, cy = D.camera(ctx)
    if not cam then return Tow.Deck.say('deck spots: the camera cannot be read here (no LoGetCameraPosition).') end
    local px, pz = (at or cam)[1], (at or cam)[2]
    local inH = D.below(cy) -- (the camera in the hangar: the hangar's aircraft)
    if what == 'add' then
      local n, base = 0, inH and D.hangarN or 0
      for _, e in ipairs(D.list) do if (e.hangar and true or false) == inH then n = math.max(n, e.n - base) end end
      local lock = D.lock and D.list[D.lock]
      local e = { n = base + n + 1, name = (inH and 'added hangar ' or 'added ') .. (n + 1), x = px, z = pz, hdg = lock and lock.hdg or chdg, added = true, hangar = inH or nil, key = 'catcc-spot-' .. (#D.list + 1) }
      D.list[#D.list + 1] = e
      D.lock = #D.list
      local made, note = D.make({ e })
      D.save()
      logLine(string.format('command spot add (the camera %.1f m above the ship\'s origin: %s): %s%s', cy or 0, inH and 'in the hangar' or 'over the flight deck', D.text(e), (made == 1) and '' or ('; NOT parked: ' .. tostring(note or (e.skipped and 'an aircraft stands there' or 'DCS made nothing')))))
      return Tow.Deck.say('deck spots: added and locked on: ' .. D.text(e) .. (made == 1 and '.' or '. It could not be parked there.'))
    end
    local best, bd
    for i, e in ipairs(D.list) do
      if not e.removed and (e.hangar and true or false) == inH then
        local ex, ez = D.pose(e) -- (where it stands now)
        local dd = math.sqrt((ex - px) ^ 2 + (ez - pz) ^ 2)
        if not bd or dd < bd then best, bd = i, dd end
      end
    end
    if not best then return Tow.Deck.say('deck spots: no aircraft to lock on.') end
    D.lock = best
    logLine(string.format('command spot lock: %s; %.1f m from %s (%.1f / %.1f)', D.text(D.list[best]), bd, at and 'where the camera looks' or 'the camera (it looks level or up)', px, pz))
    return Tow.Deck.say(string.format('deck spots: locked on %s (%.0f m from %s).', D.text(D.list[best]), bd, at and 'where the camera looks' or 'the camera'))
  end
  if what == 'next' then
    local n, i = #D.list, D.lock or 0
    for _ = 1, n do
      i = (i - 1 + (tonumber(a) or 1)) % n + 1
      if not D.list[i].removed then break end
    end
    D.lock = i
    logLine('command spot next: ' .. D.text(D.list[i]))
    return Tow.Deck.say('deck spots: locked on ' .. D.text(D.list[i]) .. '.')
  end
  local e = D.lock and D.list[D.lock]
  if what == 'report' then
    D.save()
    local moved, added, gone = 0, 0, 0
    for _, q in ipairs(D.list) do
      if q.removed then gone = gone + 1 elseif q.added then added = added + 1
      elseif math.abs(q.x - q.x0) > 0.0005 or math.abs(q.z - q.z0) > 0.0005 or math.abs(q.hdg - q.hdg0) > 0.005 then moved = moved + 1 end
    end
    logLine(string.format('command spot report: %d spots: %d moved, %d added, %d removed; saved to %s%s', #D.list, moved, added, gone, D.file, e and ('; locked: ' .. D.text(e)) or ''))
    return Tow.Deck.say(string.format('deck spots: %s. All saved: %d moved, %d added, %d removed (Logs\\catcc-deck-spots.lua).', e and ('locked on ' .. D.text(e)) or 'none locked', moved, added, gone))
  end
  if not e then return Tow.Deck.say('deck spots: lock on an aircraft first (look at it; F10 > CATCC deck spots > Lock on the one the camera looks at).') end
  if what == 'move' then
    local d = tonumber(b)
    if not d then return Tow.Deck.say('unknown deck spot step') end
    local hr = math.rad(e.hdg)
    if a == 'fwd' then
      e.x, e.z = e.x + math.cos(hr) * d, e.z + math.sin(hr) * d
    else -- to its own right
      e.x, e.z = e.x - math.sin(hr) * d, e.z + math.cos(hr) * d
    end
  elseif what == 'turn' then
    local d = tonumber(a)
    if not d then return Tow.Deck.say('unknown deck spot turn') end
    e.hdg = (e.hdg + d) % 360
  elseif what == 'undo' then
    if not e.x0 then return Tow.Deck.say('deck spots: this one was added here: it has no built-in place (remove it instead).') end
    e.x, e.z, e.hdg = e.x0, e.z0, e.hdg0
  elseif what == 'remove' then
    e.removed = true
  else
    return Tow.Deck.say('unknown deck spot command ' .. tostring(what))
  end
  local made, note = D.make({ e })
  D.save()
  logLine(string.format('command spot %s %s %s: %s%s', what, tostring(a or ''), tostring(b or ''), D.text(e),
    e.removed and '; REMOVED' or (made == 1 and '' or ('; NOT parked: ' .. tostring(note or (e.skipped and 'an aircraft stands there' or 'DCS made nothing'))))))
  if e.removed then
    D.lock = nil
    return Tow.Deck.say('deck spots: removed: ' .. D.text(e) .. '. Nothing is locked now.')
  end
  return Tow.Deck.say('deck spots: ' .. D.text(e) .. (made == 1 and '.' or '. It could not be parked there (an aircraft in the way?).'))
end

-- ---------------------------------------------------------------- hangar marks (the in-game panel's "Hangar marks")
-- Asked for by the user (2026-11-18): "can I just point a cross hair (dot in the middle of the screen) at a surface
-- that I want to be included in the hangar collision model and you record that?" (the hangar's map, made from DCS's
-- own models, misses some of it: "the actual forward wall (toward the bow) of the hangar deck"). The line from the
-- camera through the screen's centre gives a direction, not how far: the point is found one of two ways:
--   FLOOR POINT    where that line meets the floor of the level the camera is on (the hangar's, 8.711 m above the
--                  ship's origin; the flight deck's 20.149): aimed at the foot of a wall, where it meets the floor.
--   TWO-ANGLE      the same point aimed at from two places: where the two lines come nearest each other (the middle
--                  of the shortest line between them; how long that is, is the error, and is recorded). Not taken if
--                  the two lines are less than 8 degrees apart (too near to tell the distance).
-- Every point is kept in the ship's own frame (x forward, y up, z to starboard, metres from its origin), drawn as a
-- marker standing there (CATCC_AxleEnd, the axle finder's upright cyan plate, put at the point's own height), and
-- written at once to Saved Games\DCS\Logs\catcc-hangar-marks.lua, which is read again next time: the work carries
-- over from mission to mission. (All of it hangs on Tow: this chunk has its 200 local names.)
Tow.Marks = { list = nil, file = writedir .. 'Logs/catcc-hangar-marks.lua', seq = 0, keepT = 0, keepI = 0, minDeg = 8 }

function Tow.Marks.load()
  local M = Tow.Marks
  if M.list then return M.list end
  M.list = {}
  local f = loadfile(M.file)
  local ok, t = pcall(function() return f and f() end)
  if ok and type(t) == 'table' then
    for _, e in ipairs(t) do
      if tonumber(e.x) and tonumber(e.y) and tonumber(e.z) then M.list[#M.list + 1] = e end
    end
  end
  for _, e in ipairs(M.list) do M.seq = math.max(M.seq, tonumber(e.n) or 0) end
  return M.list
end

function Tow.Marks.save()
  local M = Tow.Marks
  local f = io.open(M.file, 'w')
  if not f then
    logLine('hangar marks: the file could not be written: ' .. M.file)
    return false
  end
  f:write('-- CATCC hangar marks: points aimed at with the in-game panel\'s crosshair. Written by the crew test hook, ' .. tostring(os.date('%Y-%m-%d %H:%M:%S')) .. '.\n')
  f:write('-- x: metres forward of the ship\'s origin; y: up; z: to starboard. kind: "floor" (where the line of sight meets the floor)\n')
  f:write('-- or "two-angle" (where two lines of sight come nearest: gap is how near, deg the angle between them). ship: the carrier.\n')
  f:write('return {\n')
  for _, e in ipairs(M.list) do
    f:write(string.format('  { n = %d, kind = %q, x = %.3f, y = %.3f, z = %.3f%s%s, ship = %q },\n', e.n, e.kind, e.x, e.y, e.z,
      e.gap and string.format(', gap = %.3f', e.gap) or '', e.deg and string.format(', deg = %.1f', e.deg) or '', tostring(e.ship or '')))
  end
  f:write('}\n')
  f:close()
  return true
end

-- its marker: made anew (linked to the ship) and put at the point's own height
function Tow.Marks.show(e, ship)
  local ok, r = pcall(dostring, string.format('return (CATCC_CR and CATCC_CR.marker) and CATCC_CR.marker(%q, "CATCC_AxleEnd", %.4f, %.4f, 0, nil, %s) or "ERR|no menu script"',
    'catcc-hmark-' .. e.n, e.x, e.z, ship and string.format('%q', ship) or 'nil'))
  local id = ok and type(r) == 'string' and tonumber(r:match('^OK|(%d+)|'))
  e.id = (id and id > 0) and id or nil
  Tow.Marks.put(e)
  return e.id ~= nil, (ok and r) or tostring(r)
end

function Tow.Marks.put(e)
  if e.id and native and native.staticpos then pcall(native.staticpos, e.id, unpack(Tow.pose(Tow.OWN, e.x, e.y, e.z, 1, 0))) end
end

-- every marker of this carrier made (the first time the page is opened in a mission)
function Tow.Marks.showAll(ship)
  local M = Tow.Marks
  if M.shownFor == ship then return end
  M.shownFor = ship
  local n = 0
  for _, e in ipairs(M.load()) do
    if (e.ship or '') == '' or e.ship == ship then
      if M.show(e, ship) then n = n + 1 end
    end
  end
  if n > 0 then logLine(string.format('hangar marks: %d marker(s) of earlier points made on %s', n, tostring(ship))) end
end

-- (told their place again, one every fifth of a second in turn, as the spotting tool does with its own)
function Tow.Marks.tick(t)
  local M = Tow.Marks
  if not M.list or #M.list == 0 or t < M.keepT then return end
  M.keepT = t + 0.2
  M.keepI = M.keepI % #M.list + 1
  M.put(M.list[M.keepI])
end

-- the floor of the level a camera at height cy is on
function Tow.Marks.floorY(cy) return Tow.Deck.below(cy) and (Tow.Deck.hy - 1.856) or (Tow.Deck.jy - 1.826) end

function Tow.Marks.text(e)
  return string.format('point %d (%s): %.2f m forward, %.2f up, %.2f to starboard%s', e.n, e.kind, e.x, e.y, e.z,
    e.gap and string.format('; the two lines %.2f m apart, %.0f degrees between them', e.gap, e.deg or 0) or '')
end

function Tow.Marks.add(e, ship)
  local M = Tow.Marks
  M.load()
  M.seq = M.seq + 1
  e.n, e.ship = M.seq, ship
  M.list[#M.list + 1] = e
  local made, r = M.show(e, ship)
  M.save()
  logLine('hangar marks: ' .. Tow.Marks.text(e) .. (made and '' or ('; its marker NOT made: ' .. tostring(r))))
  return 'hangar marks: ' .. Tow.Marks.text(e) .. '.'
end

-- o, d: the camera's place and the line of sight through the screen's centre, in the ship's frame (as the panel has them)
function Tow.Marks.floor(o, d, ship)
  local fy = Tow.Marks.floorY(o[2])
  if d[2] > -0.02 then return nil, 'hangar marks: the crosshair looks level or up: it never meets the floor. Aim at the foot of the wall, where it meets the floor.' end
  local k = (fy - o[2]) / d[2]
  if k > 300 then return nil, 'hangar marks: the floor is more than 300 m away along that line: not taken.' end
  return Tow.Marks.add({ kind = 'floor', x = o[1] + d[1] * k, y = fy, z = o[3] + d[3] * k }, ship)
end

-- the first shot is kept; the second gives the point
function Tow.Marks.shot(o, d, ship)
  local M = Tow.Marks
  local P = M.pending
  if not P then
    M.pending = { o = o, d = d }
    logLine(string.format('hangar marks: first shot from %.2f / %.2f / %.2f', o[1], o[2], o[3]))
    return 'hangar marks: first shot taken. Move the camera well round (more than ' .. M.minDeg .. ' degrees), aim at the same point and take the second.'
  end
  local function dot(a, b) return a[1] * b[1] + a[2] * b[2] + a[3] * b[3] end
  local a, b = P.d, d
  local aa, bb, ab = dot(a, a), dot(b, b), dot(a, b)
  local deg = math.deg(math.acos(math.max(-1, math.min(1, ab / math.sqrt(aa * bb)))))
  if deg < M.minDeg then
    return nil, string.format('hangar marks: the two lines are only %.1f degrees apart: move the camera further round and take the second shot again (the first is kept).', deg)
  end
  local w = { P.o[1] - o[1], P.o[2] - o[2], P.o[3] - o[3] }
  local den = aa * bb - ab * ab
  local s1 = (ab * dot(b, w) - bb * dot(a, w)) / den
  local s2 = (aa * dot(b, w) - ab * dot(a, w)) / den
  if s1 < 0 or s2 < 0 then
    return nil, 'hangar marks: the two lines meet behind the camera: aim at the same point from both places. Take the second shot again (the first is kept).'
  end
  local p1 = { P.o[1] + a[1] * s1, P.o[2] + a[2] * s1, P.o[3] + a[3] * s1 }
  local p2 = { o[1] + b[1] * s2, o[2] + b[2] * s2, o[3] + b[3] * s2 }
  M.pending = nil
  local gap = math.sqrt((p1[1] - p2[1]) ^ 2 + (p1[2] - p2[2]) ^ 2 + (p1[3] - p2[3]) ^ 2)
  local msg = M.add({ kind = 'two-angle', x = (p1[1] + p2[1]) / 2, y = (p1[2] + p2[2]) / 2, z = (p1[3] + p2[3]) / 2, gap = gap, deg = deg }, ship)
  if gap > 0.3 then msg = msg .. ' The two lines pass ' .. string.format('%.2f', gap) .. ' m apart: were both aimed at the same point?' end
  return msg
end

function Tow.Marks.cancel()
  local had = Tow.Marks.pending ~= nil
  Tow.Marks.pending = nil
  return had and 'hangar marks: the first shot is dropped.' or 'hangar marks: no first shot to drop.'
end

function Tow.Marks.undo()
  local M = Tow.Marks
  M.load()
  local e = table.remove(M.list)
  if not e then return 'hangar marks: there are no points.' end
  pcall(dostring, string.format('return CATCC_CR and CATCC_CR.marker and CATCC_CR.marker(%q, "", 0, 0, 0)', 'catcc-hmark-' .. e.n))
  M.save()
  logLine('hangar marks: removed ' .. Tow.Marks.text(e))
  return 'hangar marks: removed ' .. Tow.Marks.text(e) .. '.'
end

function commands.walkthru()
  withTarget(function(p, d, ctx)
    local dx, dz = ctx.jx - p.x, ctx.jz - p.z
    local m = math.sqrt(dx * dx + dz * dz)
    if m < 6 then return say(string.format('%s is only %.0f m from your jet: pick someone further away', tostring(p.name), m)) end
    local tx, tz = ctx.jx + dx / m * 14, ctx.jz + dz / m * 14
    local ok, res, e = walkOrder(p.h, tx, tz, 0, 0, ctx.s, p.name)
    if not ok or not res then return say(string.format('%s: walk failed: %s', tostring(p.name), tostring(ok and e or res))) end
    logLine(string.format('command walkthru: %s from %.1f fwd %.1f stbd to %.1f fwd %.1f stbd, the jet at %.1f fwd %.1f stbd on the line; walk: %s', tostring(p.name), p.x, p.z, tx, tz,
      ctx.jx, ctx.jz, tostring(e)))
    say(string.format('%s told to walk to the far side of your jet (%.0f m, straight through where it stands). Watch him: through it, or round it?', tostring(p.name), m + 14))
    startWatch(p, 60, { x = tx, z = tz }, 'walk past the jet')
    watch.near = { x = ctx.jx, z = ctx.jz }
  end)
end

-- ends whatever of ours runs (the demo, the signal test or the marshalling) and puts the men back to
-- their idle and to day; the marshalling's people walk back to where they stood
-- on-screen messages off / on. Going off: one short notice that also clears what is on screen now (outText's third
-- argument), then nothing more until they are switched on again
function commands.messages()
  if quiet then
    quiet = false
    return say('on-screen messages are ON again.', 6)
  end
  logLine('command messages: on-screen messages OFF (they still go to this log)')
  pcall(dostring, string.format('trigger.action.outText(%q, 4, true)', 'CATCC crew test: on-screen messages are OFF (F10 > CATCC crew test > Tow > Messages on screen brings them back; they still go to the log).'))
  quiet = true
end

function commands.demostop()
  if not (demo or sigtest or marsh) then return say('nothing of ours is running (no demo, signal test or marshalling)') end
  local what = demo and 'demo' or (sigtest and 'signal test' or 'marshalling')
  if marsh then marshalHome(marsh, getCtx()) end
  local hs = demo and { demo.first and demo.first.h or false, demo.last.h } or (sigtest and { sigtest.h } or {})
  if sigtest and nightOn[sigtest.h] then setNight(sigtest.h, false) end
  demo, sigtest, marsh = nil, nil, nil
  for _, h in ipairs(hs) do
    if h then toIdle(h) end
  end
  say(what .. ' stopped.')
end

-- Path finding switched on, once a mission, when the people are first found: from then on everyone we
-- send somewhere walks round aircraft and the island instead of through them (2026-11-14: with the crew
-- environment's "path avoids collisions" and the character code's "use the path finder" both on, the
-- walker went round the jet, 4.8 m from its middle; with them off, as DCS has them, straight through).
local pathOnDone = false
local function pathFindingOn(r)
  if pathOnDone or not (native and native.envflags and native.debugset) then return end
  local p = r and r.mine and r.mine[1]
  if not p then return end
  pathOnDone = true
  local ok, av, pa = pcall(native.envflags, p.h, -1, 1)
  local ok2 = pcall(native.debugset, 3, 1)
  logLine(string.format('path finding switched on at mission start: environment "path avoids collisions" %s, character code "use the path finder" %s', (ok and av ~= nil) and onOff(pa) or 'FAILED',
    ok2 and 'ON' or 'FAILED'))
end
local function run(cmd)
  logLine('menu: ' .. cmd)
  local parts = split(cmd)
  local f = commands[parts[1]]
  if not f then return info('unknown command ' .. cmd) end
  local ok, err = pcall(f, parts[2], parts[3], parts[4])
  if not ok then say('error in "' .. cmd .. '": ' .. tostring(err)) end
end

-- ---------------------------------------------------------------- the menu script, every mission
local function installMenu(t)
  if t - lastInstallAt < 5 then return end
  lastInstallAt = t
  local ok, present = pcall(dostring, 'return type(CATCC_CR)')
  if installed and ok and present == 'table' then return end
  local fh = io.open(writedir .. 'Scripts/CATCC/crewtest.lua', 'r')
  if not fh then
    if not installWarned then
      installWarned = true
      info('Scripts/CATCC/crewtest.lua is missing')
    end
    return
  end
  local src = fh:read('*a')
  fh:close()
  -- (the deck spots for the menu's "Tow me to a parking spot", which the mission's Lua state cannot read for itself)
  local okm, spotList = pcall(Tow.Fd.menu)
  src = 'CATCC_CR_SPOTS = ' .. string.format('%q', (okm and type(spotList) == 'string') and spotList or '') .. ' ' .. src
  local ok2, r = pcall(dostring, src .. '\nreturn (type(CATCC_CR) == "table") and "CATCC_OK" or "CATCC_FAIL"')
  if ok2 and r == 'CATCC_OK' then
    installed = true
    info('crew test menu installed (F10 > CATCC crew test)')
    if not native and not nativeSaid then
      nativeSaid = true
      say('the native module is not loaded: ' .. tostring(nativeWhy))
    end
  elseif not installWarned then
    installWarned = true
    info('crew test menu install failed: ' .. tostring(r) .. ' (check autoexec.cfg: net.allow_dostring_in must include "' .. STATE .. '")')
  end
end

-- The people on deck, once a mission, by itself: when the simulation has run for 8 s (model time: the
-- briefing screen and pauses don't count; on 2026-11-14 the list was made while the mission still sat
-- paused before "Fly" and found the crew environments empty) and the player sits in a jet on a carrier.
-- If the quick scan finds nobody, the memory scan follows by itself (a freeze of a few seconds, said
-- first), so the recorder has people to follow without anyone asking.
local function modelTime()
  local ok, v = pcall(function() return DCS.getModelTime() end)
  return ok and tonumber(v) or nil
end

local function autoList(t)
  if autoListed or not native then return end
  startT = startT or t
  if t - lastAutoTry < 2 then return end
  lastAutoTry = t
  local mt = modelTime()
  if mt then
    if mt < 8 then return end
  elseif t - startT < 20 then
    return -- no model time to go by: 20 s of real time instead
  end
  local ctx = getCtx()
  if not ctx then return end -- no player in a cockpit on a carrier yet: ask again in 2 s
  autoListed = true
  local r = doScan(ctx, 'mission start', true)
  if not r then return end
  pathFindingOn(r)
  if #r.people > 0 then
    -- (in the log only: settled, the user, 2026-11-24: "remove any debugging messages that are for systems we've
    -- already settled")
    logLine('at mission start: ' .. summary(r, ctx) .. (customClip ~= nil and (customClip and ' Our own animation clip: in the list.' or ' Our own animation clip: NOT in the list.') or ''))
  else
    say('at mission start: ' .. summary(r, ctx) .. ' the quick way. Scanning memory instead: DCS will freeze for a few seconds.')
    pending = { at = now() + 1, fn = function() commands.memory(true) end }
  end
end

-- PERFORMANCE, IN THE USER'S TERMS (2026-11-18: "Start reporting performance in the following terms: fps range and
-- average fps; frame time range and average frame time; 1% and .1% lows in ms; exclude spikes for testing only
-- functions (e.g. suddenly spawning 40 statics)"). The "frame cost" line (below) says what OUR CODE takes of a frame;
-- this says what the frame itself takes: the real time from one frame of the simulation to the next, every frame,
-- kept as a count for every half millisecond (Tow.Prof.S.hist), apart for each state of the deck (Tow.Prof.context:
-- the demo running; static aircraft parked by the spotting tool; nothing of ours there). Written to the log
-- ("performance, ...") every minute, when the state changes, and when the mission ends:
--   fps: frames / time; its range: the lowest and highest count over a whole second;
--   frame time: average, shortest, longest;
--   1% low / 0.1% low: the average of the slowest 1% / 0.1% of the frames, in ms (and as frames a second);
--   the hook's share: our own code's time in those frames: average, and the average of its slowest 1% / 0.1%.
-- LEFT OUT: frames while the mission is paused (its clock stands), and TEST-ONLY SPIKES: the two seconds from the
-- moment something that only the test tools do was done (Tow.Prof.testOnly: the spotting tool making or taking away
-- static aircraft, the demo making or taking away its forty, the first seconds of a mission): how many frames were
-- left out, the longest of them and for what is said with the rest.
function Tow.Prof.testOnly(what, secs)
  local P = Tow.Prof
  local c = (P.clock or os.clock)()
  if not (P.skipUntil and c <= P.skipUntil) then P.skipFrom = c end
  P.skipUntil = math.max(P.skipUntil or 0, c + (secs or 2))
  P.skipWhat = what
end

function Tow.Prof.context()
  -- (with what of the demo is drawn, once its "Hide" switches were used: Tow.Hide)
  if (CATCC_DEMO and CATCC_DEMO.on) or (Tow.Thr and Tow.Thr.live and Tow.Thr.on) then
    return 'the deck spotting demo running' .. ((Tow.Hide and Tow.Hide.used) and (', ' .. Tow.Hide.label()) or '')
  end
  if Tow.Deck.list and Tow.Deck.shown then return 'static aircraft parked by the spotting tool' end
  return 'nothing of ours on the deck'
end

-- the average of the slowest `share` of what a histogram counts (bins of `w` ms; n: how many it counts)
function Tow.Prof.slowest(hist, top, w, n, share)
  local want = math.max(1, math.floor(n * share + 0.5))
  local got, sum = 0, 0
  for b = top, 0, -1 do
    local k = hist[b]
    if k then
      local take = math.min(k, want - got)
      got, sum = got + take, sum + take * (b + 0.5) * w
      if got >= want then break end
    end
  end
  return got > 0 and sum / got or 0
end

function Tow.Prof.say(S, why)
  if not S or S.n < 2 then return end
  local P = Tow.Prof
  local avg = 1000 * S.sum / S.n
  local l1, l01 = P.slowest(S.hist, S.top, 0.5, S.n, 0.01), P.slowest(S.hist, S.top, 0.5, S.n, 0.001)
  local h1, h01 = P.slowest(S.hhist, S.htop, 0.1, S.n, 0.01), P.slowest(S.hhist, S.htop, 0.1, S.n, 0.001)
  local what = {}
  for k in pairs(S.exclWhat) do what[#what + 1] = k end
  table.sort(what)
  logLine(string.format('performance, %s (%s; %.0f s, %d frames): fps %.1f average, %s by the second; frame time %.1f ms average, %.1f to %.1f; 1%% low %.1f ms (%.0f fps), 0.1%% low %.1f ms (%.0f fps); '
    .. 'the hook\'s share: %.2f ms average, its slowest 1%% %.1f ms, 0.1%% %.1f ms; left out as test-only: %s', S.key, why, S.sum, S.n, S.n / S.sum,
    S.fpsMin and string.format('%.0f to %.0f', S.fpsMin, S.fpsMax) or 'no whole second', avg, 1000 * S.min, 1000 * S.max, l1, 1000 / math.max(l1, 0.001), l01, 1000 / math.max(l01, 0.001),
    1000 * S.hsum / S.n, h1, h01, S.excl > 0 and string.format('%d frames (the longest %.0f ms): %s', S.excl, 1000 * S.exclMax, table.concat(what, '; ')) or 'none')
    .. ((Tow.Thr and Tow.Thr.live and Tow.Thr.report()) and ('; ' .. Tow.Thr.report() .. ' (since it began)') or ''))
  S.said = S.sum
end

-- one frame: f0: when it began (P.clock); whole: what the hook took of it. What is counted is the frame BEFORE it,
-- now that its length is known (from its beginning to this one's).
function Tow.Prof.frame(f0, whole)
  local P = Tow.Prof
  local okm, mt = pcall(function() return DCS.getModelTime() end)
  mt = okm and tonumber(mt) or nil
  local ctx = P.context()
  if P.pf0 then
    local dt = f0 - P.pf0
    local S = P.S
    if not S or S.key ~= P.pctx then
      P.say(S, 'ended')
      S = { key = P.pctx, n = 0, sum = 0, min = 1e9, max = 0, hist = {}, top = 0, hsum = 0, hhist = {}, htop = 0, excl = 0, exclMax = 0, exclWhat = {}, secT = 0, secN = 0, said = 0 }
      P.S = S
    end
    local paused = mt ~= nil and P.pmt ~= nil and mt == P.pmt
    local skip = P.skipUntil and P.pf0 <= P.skipUntil and f0 >= (P.skipFrom or 0)
    if paused or dt <= 0 then
      S.secT, S.secN = 0, 0
    elseif skip or dt > 5 then
      S.excl = S.excl + 1
      if dt > S.exclMax then S.exclMax = dt end
      S.exclWhat[skip and tostring(P.skipWhat) or 'a frame of over 5 s'] = true
      S.secT, S.secN = 0, 0
    else
      S.n, S.sum = S.n + 1, S.sum + dt
      if dt < S.min then S.min = dt end
      if dt > S.max then S.max = dt end
      local b = math.min(4000, math.floor(dt * 2000))
      S.hist[b] = (S.hist[b] or 0) + 1
      if b > S.top then S.top = b end
      local hw = P.pwhole or 0
      S.hsum = S.hsum + hw
      local hb = math.min(20000, math.floor(hw * 10000))
      S.hhist[hb] = (S.hhist[hb] or 0) + 1
      if hb > S.htop then S.htop = hb end
      S.secT, S.secN = S.secT + dt, S.secN + 1
      if Tow.Hide and Tow.Hide.used then Tow.Hide.count(P.pctx, dt) end
      if S.secT >= 1 then
        local fps = S.secN / S.secT
        if not S.fpsMin or fps < S.fpsMin then S.fpsMin = fps end
        if not S.fpsMax or fps > S.fpsMax then S.fpsMax = fps end
        S.secT, S.secN = 0, 0
      end
      if S.sum - S.said >= 60 then P.say(S, 'so far') end
    end
  end
  P.pf0, P.pwhole, P.pctx, P.pmt = f0, whole, ctx, mt
end

-- ---------------------------------------------------------------- THE DECK SPOTTING DEMO ON ITS OWN THREAD: the main thread's side
-- (catcc-handoff/WORKER-THREAD-PLAN.md; the other side: Scripts/CATCC/crewtest_worker.lua, which says what the
-- messages are.) The native module makes a thread with a Lua state of its own; that state loads this file and the demo
-- a second time and runs the demo there, whole. Here, every frame (Tow.Thr.tick): what the worker sent is taken
-- (Tow.Thr.pump): its lists of commands applied in order (Tow.Thr.apply), its calls answered (Tow.Thr.serve); then the
-- frame is sent to it: the mission's clock, real time, active pause, and every value it reads that has changed
-- (Tow.Thr.frame). Nothing of DCS's is called on the worker's thread: every call it asks for is made here.
--   CATCC_DEMO_THREAD = false   the demo runs on the main thread, as before (also when the worker cannot be started)
--   CATCC_DEMO_LOCKSTEP         (the rig) each frame waits for the worker's step: the same run every time. 'late': and
--                               its commands are applied a frame later, as in DCS
--   CATCC_DEMO_DISORDER = seed  (the rig) frames left out and lists of commands held back up to 3 frames, by a seeded
--                               sequence: what a busy worker and a busy DCS do to each other
-- BETWEEN TWO LISTS an object that was moving is moved on by what it moved between the last two (its place only, for
-- up to 3 frames): a frame in which the worker's list has not come yet does not show as a halt (Tow.Thr.carry).
Tow.Thr = { subs = {}, applied = 0, n = 0, on = false, live = false, held = {}, said = {}, stat = { n = 0, ms = 0, max = 0, calls = 0, late = 0, carried = 0 }, move = {}, tk = 0 }
-- (in a function of its own: this chunk has its 200 local names)
(function()
  local T = Tow.Thr
  CATCC_THR = T -- (for what is defined above this table, and for the rig)
  local floor, huge, fmt, concat = math.floor, math.huge, string.format, table.concat
  -- (COMMA: a C locale that writes 1,5: put right, or the worker could not read the number)
  local COMMA = fmt('%.1f', 0.5):find(',', 1, true) ~= nil
  local function num(v)
    if v ~= v then return '(0/0)' end
    if v == huge then return 'math.huge' elseif v == -huge then return '-math.huge' end
    if v == floor(v) and v > -1e15 and v < 1e15 then return fmt('%.0f', v) end
    local s = fmt('%.17g', v)
    if COMMA then s = s:gsub(',', '.') end
    return s
  end
  local function ser(v)
    local t = type(v)
    if t == 'number' then return num(v) end
    if t == 'string' then return fmt('%q', v) end
    if t == 'boolean' then return v and 'true' or 'false' end
    if t == 'table' then
      local out, n = {}, 0
      for k, x in pairs(v) do
        local tk = type(k)
        if tk == 'number' or tk == 'string' or tk == 'boolean' then
          n = n + 1
          out[n] = '[' .. ser(k) .. ']=' .. ser(x)
        end
      end
      return '{' .. concat(out, ',') .. '}'
    end
    return 'nil'
  end
  -- what a call gave: { n = how many, ... }
  local function vals(ok, ...)
    local n = select('#', ...)
    if not ok then return false, tostring((...)) end
    local out = { 'n=' .. n }
    for i = 1, n do out[i + 1] = ser((select(i, ...))) end
    return true, '{' .. concat(out, ',') .. '}', (...)
  end
  -- what a message's function name stands for: n. the native module, D. DCS, E. Export, N. net, h. this file's own
  -- (deckctx: which carrier, where it and the jet are: this thread's own answer for this frame, for the worker's
  -- Tow.Deck.ctx: the question has the camera's place in it, which is another every frame)
  local own = { log = logLine, info = info, say = say, deckctx = function() return Tow.Deck.ctx(now()) end,
    deckmap = function(text) if CATCC_SLOTS then CATCC_SLOTS.setMap(text) end end,
    -- (the worker's WORKER.objargs: an object's model arguments all at once, Tow.objargs)
    objargs = function(h, id, max) return Tow.objargs(h, id, max) end }
  local function target(f)
    local kind, name = f:sub(1, 1), f:sub(3)
    if kind == 'n' then return native and native[name] end
    if kind == 'D' then return DCS and DCS[name] end
    if kind == 'E' then return Export and Export[name] end
    if kind == 'N' then return net and net[name] end
    if kind == 'h' then return own[name] end
    return nil
  end
  function T.post(s)
    T.stat.out = (T.stat.out or 0) + #s
    return native.worker_post(s)
  end

  function T.fail(err)
    err = tostring(err)
    if T.said[err] then return end
    T.said[err] = true
    logLine('demo thread: error: ' .. err)
    if not T.saidOne then
      T.saidOne = true
      say('the deck spotting demo\'s thread: an error (in the log): ' .. err:sub(1, 300))
    end
  end

  -- a list of commands, in its order
  function T.apply(m)
    local mv = T.move
    for i = 1, #m do
      local c = m[i]
      local fn = target(c.f)
      local ok, r, e
      if c.key and c.first then
        -- (the first command for an object, not waited for: what DCS answered goes back, for the calls after it)
        local body
        if fn then ok, body, r = vals(pcall(fn, unpack(c, 1, c.n))) else ok, body = false, 'the main thread has no ' .. tostring(c.f) end
        if ok then
          T.post('{k="a",key=' .. fmt('%q', c.key) .. ',v=' .. body .. '}')
        else
          T.post('{k="a",key=' .. fmt('%q', c.key) .. ',v={n=2,nil,' .. fmt('%q', body) .. '}}')
        end
      elseif fn then
        ok, r, e = pcall(fn, unpack(c, 1, c.n))
      else
        ok, r = false, 'the main thread has no ' .. tostring(c.f)
      end
      if c.key then
        if not c.first and not (ok and r) then
          -- (the worker gives this failure to every later call for the same object)
          T.post('{k="x",key=' .. fmt('%q', c.key) .. ',err=' .. fmt('%q', tostring(ok and e or r)) .. '}')
        end
        if not (ok and r) then
          -- (nothing to move on)
        elseif not T.useBlob and m.mt and (c.f == 'n.staticpos' or c.f == 'n.place') then
          -- where it is now and where it was a list before: what Tow.Thr.carry moves it on by
          local q = mv[c.key]
          if not q then
            q = {}
            mv[c.key] = q
          end
          if q.st ~= m.st then q.p, q.pt = q.c, q.t end
          q.c, q.t, q.fn, q.st, q.ext = c, m.mt, fn, m.st, nil
        end
      end
    end
    if m.done then
      -- (what the worker's step did not place again stands: it is not moved on, and if it was, it is put back)
      for key, q in pairs(mv) do
        if q.st ~= m.st then
          if q.ext then pcall(q.fn, unpack(q.c, 1, q.c.n)) end
          mv[key] = nil
        end
      end
    end
    T.head(m.seq, m.done, m.on, m.ran, m.ms, m.calls, m.idle, m.idleMs)
  end
  -- what a list says of itself when it has been applied: a text list's fields, a packed list's numbers
  function T.head(seq, done, on, ran, ms, calls, idle, idleMs)
    T.applied = seq
    if on ~= nil then T.on = on end
    if ran then T.ran = ran end
    if done then
      T.doneN = done
      if not T.defer and not T.held[1] then T.got = done end
      if T.stepCalls then
        if #T.stepCalls >= 2 then
          local key = table.concat(T.stepCalls, ' + ')
          T.stat.together = T.stat.together or {}
          T.stat.together[key] = (T.stat.together[key] or 0) + 1
        end
        T.stepCalls = nil
      end
      local S = T.stat
      S.n, S.ms, S.calls = S.n + 1, S.ms + (ms or 0), S.calls + (calls or 0)
      S.idle, S.idleMs = (S.idle or 0) + (idle or 0), (S.idleMs or 0) + (idleMs or 0)
      if (ms or 0) > S.max then S.max = ms end
      -- (its steps' times, counted by the tenth of a millisecond for the slowest 1 % and 0.1 %)
      S.hist = S.hist or {}
      local b = math.min(20000, floor((ms or 0) * 10))
      S.hist[b] = (S.hist[b] or 0) + 1
      if b > (S.top or 0) then S.top = b end
      -- (late: its list was not there when the frame after its own began)
      if T.n - done >= 1 then S.late = S.late + 1 end
    end
  end
  -- A PACKED LIST (the native module's worker_blob: WORKER-THREAD-PLAN.md, step 6): the worker's places and model
  -- arguments as bytes: the module reads them and makes the calls itself, and follows what moves (worker_carry, below:
  -- what T.carry does here for the text lists). What failed comes back and is told to the worker as for a text list.
  function T.blob(s)
    local fails, seq, _, _, done, on, ms, calls, idle, idleMs, count = native.worker_blob(s, CATCC_THREAD_SINK)
    if not fails then return T.fail('a packed list could not be read: ' .. tostring(seq)) end
    for i = 1, #fails do
      local f = fails[i]
      local op, x, y, z = f[1], f[2], f[3], f[4]
      local key = (op == 1 and ('n.staticpos:' .. tostring(x))) or (op == 2 and ('n.place:' .. tostring(x))) or (op == 3 and ('n.objarg:' .. tostring(y) .. ':' .. tostring(z)))
        or ('n.shiparg:' .. tostring(x) .. ':' .. tostring(y))
      T.post('{k="x",key=' .. fmt('%q', key) .. ',err=' .. fmt('%q', tostring(f[5])) .. '}')
    end
    T.stat.bin = (T.stat.bin or 0) + count
    T.head(seq, done >= 0 and done or nil, on == 1, nil, ms, calls, idle, idleMs)
  end
  -- held lists (CATCC_DEMO_LOCKSTEP = 'late', CATCC_DEMO_DISORDER) that are due
  function T.release(all)
    local held = T.held
    while held[1] and (all or held[1].due <= T.n) do
      local m = table.remove(held, 1)
      if m.blob then T.blob(m.blob) else T.apply(m) end
    end
  end

  -- a call: made, and answered
  function T.serve(m)
    T.release(true) -- (everything before it in its order first)
    local by = T.stat.by or {}
    T.stat.by = by
    if T.on then
      local run = T.stat.run or {}
      T.stat.run = run
      run[m.f] = (run[m.f] or 0) + 1
    end
    local what = m.f .. ((CATCC_DEMO_THREAD_CALLS and m.f == 'n.objarg') and (' arg ' .. tostring(m.a[3]) .. (m.a.n > 3 and ' written' or ' read') .. (T.on and ' (running)' or ' (starting)')) or '')
    by[what] = (by[what] or 0) + 1
    if CATCC_DEMO_THREAD_CALLS and T.on then
      -- (the rig: which calls come together in one step)
      T.stepCalls = T.stepCalls or {}
      T.stepCalls[#T.stepCalls + 1] = m.f:sub(3) .. ((m.f == 'n.objarg' or m.f == 'n.shiparg' or m.f == 'n.elevator') and (' ' .. tostring(m.a[2]) .. (m.a.n > 2 and ('=' .. tostring(m.a[3])) or '')) or '') .. (m.key and ' (read)' or '')
    end
    local fn = target(m.f)
    if not fn then return T.post('{k="r",id=' .. num(m.id) .. ',err=' .. fmt('%q', 'the main thread has no ' .. tostring(m.f)) .. '}') end
    local ok, body = vals(pcall(fn, unpack(m.a, 1, m.a.n)))
    if not ok then return T.post('{k="r",id=' .. num(m.id) .. ',err=' .. fmt('%q', body) .. '}') end
    if m.key then T.subs[m.key] = { f = m.f, a = m.a, last = body } end
    T.post('{k="r",id=' .. num(m.id) .. ',v=' .. body .. '}')
  end

  function T.pump()
    while true do
      local msgs = native.worker_poll()
      if not msgs then return end
      for i = 1, #msgs do
        local s = msgs[i]
        local c = s:sub(1, 1)
        T.stat.inn = (T.stat.inn or 0) + #s
        if c == 'B' then
          -- (a packed list: held like a text one where lists are held (the rig); else applied by the module)
          if T.defer or T.held[1] then
            local _, _, _, done = native.worker_blobinfo(s)
            if done and done >= 0 then T.got = done end
            T.held[#T.held + 1] = { blob = s, due = T.n + (T.defer and T.defer() or 0) }
          else
            T.blob(s)
          end
        elseif c == 'E' then
          T.fail(s:sub(2))
        elseif c == 'X' then
          T.ended = true
        else
          local f, e = loadstring('return ' .. s)
          local ok, m = pcall(f or error, e)
          if not ok or type(m) ~= 'table' then
            T.fail('a message from the worker could not be read: ' .. tostring(m) .. ': ' .. s:sub(1, 160))
          elseif m.k == 'c' then
            -- (got: the worker has finished the step for that frame, whenever its list is applied)
            if m.done then T.got = m.done end
            if T.defer or T.held[1] then
              m.due = T.n + (T.defer and T.defer() or 0)
              T.held[#T.held + 1] = m
              if m.ran then T.release(true) end
            else
              T.apply(m)
            end
          elseif m.k == 'q' then
            local oks, es = pcall(T.serve, m)
            if not oks then T.post('{k="r",id=' .. num(m.id or 0) .. ',err=' .. fmt('%q', 'the main thread: ' .. tostring(es)) .. '}') end
          elseif m.k == 'u' then
            for _, key in ipairs(m.keys or {}) do T.subs[key] = nil end
          elseif m.k == 'e' then
            T.fail(m.err)
          elseif m.k == 'ready' then
            T.ready = true
          end
        end
      end
    end
  end

  -- waits (the worker's messages taken meanwhile) until `cond` holds, the worker has ended, or about `ms` have passed
  function T.await(cond, ms)
    for _ = 1, math.max(1, floor(ms / 5)) do
      T.pump()
      if cond() then return true end
      if T.ended then return false end
      native.worker_wait(5)
    end
    T.pump()
    return cond() == true
  end

  -- the clocks, as text for a message: the mission's, real time, active pause (with every frame, and with every
  -- command for the worker: it may have had no frame yet, and the demo begins by the mission's clock)
  function T.clocks()
    local okm, mt = pcall(function() return DCS.getModelTime() end)
    return fmt('mt=%s,rt=%s,ap=%s', num(okm and tonumber(mt) or 0), num(now()), tostring(Tow.ap.on == true))
  end

  -- the frame: the clocks, and every read whose value has changed
  function T.frame(t)
    T.n = T.n + 1
    local r, nr = {}, 0
    for key, s in pairs(T.subs) do
      local fn = target(s.f)
      local body
      if fn then
        local ok, b = vals(pcall(fn, unpack(s.a, 1, s.a.n)))
        body = ok and b or ('{n=0,err=' .. fmt('%q', b) .. '}')
      else
        body = '{n=0,err="the main thread no longer has it"}'
      end
      if body ~= s.last then
        s.last = body
        nr = nr + 1
        r[nr] = '[' .. fmt('%q', key) .. ']=' .. body
      end
    end
    T.post(fmt('{k="f",n=%d,mt=%s,rt=%s,ap=%s,seq=%d,r={%s}}', T.n, num(T.mt), num(t), tostring(Tow.ap.on == true), T.applied, concat(r, ',', 1, nr)))
  end

  -- AN OBJECT THAT IS MOVING IS SHOWN WHERE IT IS A FRAME BEHIND THE MISSION'S CLOCK (see the top). The worker's list
  -- for a frame comes in the next one: then every place is the worker's own, and nothing is done here. When a list is
  -- late (the worker deep in a step, or DCS's frames shorter than its steps), an object whose last place is for an
  -- earlier moment is moved on from it, by what it moved between the worker's last two steps, to where it would be a
  -- frame behind the clock: so a late list shows neither as a halt nor, when it comes, as a jump. Its place only; not
  -- one that jumped (over 12 m/s: a tractor turned round on its hitch, an aircraft set on its spot); 3 frames at the most.
  function T.carry()
    local tt = T.mtPrev
    if not tt then return end
    if T.useBlob then
      -- (the module follows what it places itself)
      T.stat.carried = T.stat.carried + (native.worker_carry(tt, T.mt or tt, CATCC_THREAD_SINK) or 0)
      return
    end
    local dtF = (T.mt or tt) - tt
    if dtF <= 0 then return end
    for _, q in pairs(T.move) do
      local ext = tt - q.t
      if ext > 1e-9 and q.p and q.pt and q.t > q.pt then
        if ext > 3 * dtF then ext = 3 * dtF end
        if ext ~= q.ext then
          local c, p = q.c, q.p
          local a = c.f == 'n.place' and 2 or 11
          local k = ext / (q.t - q.pt)
          local dx, dy, dz = (c[a] - p[a]) * k, (c[a + 1] - p[a + 1]) * k, (c[a + 2] - p[a + 2]) * k
          local d2 = dx * dx + dy * dy + dz * dz
          if d2 > 0 and d2 < (12 * ext) ^ 2 then
            local x, y, z = c[a], c[a + 1], c[a + 2]
            c[a], c[a + 1], c[a + 2] = x + dx, y + dy, z + dz
            pcall(q.fn, unpack(c, 1, c.n))
            c[a], c[a + 1], c[a + 2] = x, y, z
            q.ext = ext
            T.stat.carried = T.stat.carried + 1
          end
        end
      end
    end
  end

  -- what the worker's steps took (its own clock), and how the two threads kept up with each other
  function T.report()
    local S = T.stat
    if not S or S.n < 1 then return nil end
    local P = Tow.Prof
    local reads = 0
    for _ in pairs(T.subs) do reads = reads + 1 end
    return string.format('the demo\'s thread: %d steps, %.2f ms average, its slowest 1%% %.1f ms, 0.1%% %.1f ms, the longest %.0f ms; %d calls it waited for; %d lists of commands came late (not there when the next frame began); objects moved on meanwhile %d times; '
      .. 'planning between the frames: %d pieces, %.1f s in all; %d values read for it every frame; %.1f KB a frame to it, %.1f KB from it (%s)',
      S.n, S.ms / S.n, P.slowest(S.hist or {}, S.top or 0, 0.1, S.n, 0.01), P.slowest(S.hist or {}, S.top or 0, 0.1, S.n, 0.001), S.max, S.calls, S.late, S.carried,
      S.idle or 0, (S.idleMs or 0) / 1000, reads, (S.out or 0) / 1024 / math.max(1, T.n), (S.inn or 0) / 1024 / math.max(1, T.n),
      T.useBlob and string.format('%.0f places and model arguments a frame applied by the native module itself', (S.bin or 0) / math.max(1, T.n)) or 'all of it as text for Lua')
      .. (function()
        -- (by function, the most first: the calls it waited for while the demo ran (not while it made its objects),
        -- and the values read for it now: what to look at when the hook's share or the late lists are high)
        local function top(t, n)
          local list = {}
          for f, k in pairs(t) do list[#list + 1] = { f, k } end
          table.sort(list, function(a, b) return a[2] > b[2] or (a[2] == b[2] and a[1] < b[1]) end)
          local out = {}
          for i = 1, math.min(n, #list) do out[i] = list[i][1] .. ' ' .. list[i][2] end
          return #out > 0 and table.concat(out, ', ') or 'none'
        end
        local byF = {}
        for _, sub in pairs(T.subs) do byF[sub.f] = (byF[sub.f] or 0) + 1 end
        return '; waited for while the demo ran: ' .. top(S.run or {}, 8) .. '; read every frame: ' .. top(byF, 8)
          .. string.format('; the main thread\'s side of it: %.2f ms a frame taking its messages and applying its commands, %.2f ms reading and sending the frame, %.1f ms at the most', 1000 * (S.tApply or 0) / math.max(1, S.tN or 0),
            1000 * (S.tFrame or 0) / math.max(1, S.tN or 0), 1000 * (S.tMax or 0))
      end)()
      .. (CATCC_DEMO_THREAD_CALLS and (function()
        -- (the rig: which calls it waited for, the most first)
        local list = {}
        for f, n in pairs(S.by or {}) do list[#list + 1] = { f, n } end
        table.sort(list, function(a, b) return a[2] > b[2] end)
        local out = {}
        for i = 1, math.min(12, #list) do out[i] = list[i][1] .. ' ' .. list[i][2] end
        local tg = {}
        for k, n in pairs(S.together or {}) do tg[#tg + 1] = n .. ' x [' .. k .. ']' end
        table.sort(tg)
        return '; calls: ' .. table.concat(out, ', ') .. '; together in one step: ' .. table.concat(tg, '; ')
      end)() or '')
  end

  function T.stop(why)
    if not T.live then return end
    local rep = T.report()
    if rep then logLine('demo thread: ' .. rep) end
    T.live, T.on = false, false
    pcall(T.post, '{k="quit"}')
    local ended = native.worker_stop(200)
    T.subs, T.held, T.move = {}, {}, {}
    if native.worker_moves then pcall(native.worker_moves) end
    logLine('demo thread: stopped' .. (why and (' (' .. why .. ')') or '') .. (ended and '' or '; its thread is still in a step and ends by itself'))
  end

  -- the worker started (if it is not running): true: it runs and has loaded the demo
  function T.start()
    if T.live and not T.ended then return true end
    if CATCC_DEMO_THREAD == false then
      -- (switched off: said once a mission)
      if not T.offSaid and not CATCC_WORKER then
        T.offSaid = true
        logLine('demo thread: switched off (demoThread = false in Config\\CATCC-test.lua): the deck spotting demo runs on the main thread')
      end
      return false
    end
    if CATCC_WORKER or not (native and native.worker_start and native.worker_post and native.worker_poll and native.worker_wait and native.worker_stop) then return false end
    if T.live then T.stop('its thread had ended') end
    local names, dcs, export, globals = {}, {}, {}, {}
    for k, v in pairs(native) do if type(v) == 'function' then names[#names + 1] = k end end
    for k, v in pairs(DCS or {}) do if type(v) == 'function' then dcs[k] = true end end
    for k, v in pairs(Export or {}) do if type(v) == 'function' then export[k] = true end end
    for k, v in pairs(_G) do
      if type(k) == 'string' and k:find('^CATCC_DEMO_') and type(v) ~= 'function' and type(v) ~= 'userdata' then globals[k] = v end
    end
    local files = { ['Scripts/CATCC/crewtest_ui.lua'] = false }
    for k, v in pairs(CATCC_THREAD_FILES or {}) do files[k] = v end
    local script = CATCC_THREAD_SCRIPT or (writedir .. 'Scripts\\CATCC\\crewtest_worker.lua')
    -- (useBlob: this module takes the worker's places and model arguments as a packed list: T.blob)
    T.useBlob = (native.worker_blob and native.worker_blobinfo and native.worker_carry and native.worker_moves and not CATCC_DEMO_NO_BLOB) and true or false
    if native.worker_moves then pcall(native.worker_moves) end
    local arg = ser({ writedir = CATCC_THREAD_WRITEDIR or writedir, natives = names, dcs = dcs, export = export, globals = globals, files = files, lockstep = CATCC_DEMO_LOCKSTEP and true or false,
      blob = T.useBlob })
    local ok, r, why = pcall(native.worker_start, script, arg)
    if not (ok and r) then
      logLine('demo thread: not started (the demo runs on the main thread): ' .. tostring(ok and why or r))
      return false
    end
    T.live, T.ready, T.ended, T.on, T.subs, T.held, T.move, T.applied, T.n, T.ran, T.runId, T.doneN, T.said, T.saidOne = true, false, false, false, {}, {}, {}, 0, 0, nil, 0, nil, {}, nil
    T.got, T.tk, T.mt, T.mtPrev = nil, 0, nil, nil
    T.stat = { n = 0, ms = 0, max = 0, calls = 0, late = 0, carried = 0 }
    T.defer = nil
    if CATCC_DEMO_DISORDER then
      -- (a seeded sequence: 0 .. 3 frames a list is held back)
      local seed = tonumber(CATCC_DEMO_DISORDER) or 1
      T.rnd = function(n)
        seed = (seed * 1103515245 + 12345) % 2147483648
        return floor(seed / 65536) % n
      end
      T.defer = function() return T.rnd(4) end
    elseif CATCC_DEMO_LOCKSTEP == 'late' then
      -- (held until the next frame begins: T.release, before anything else of that frame)
      T.defer = function() return 0 end
    end
    -- (the worker loads this file and the demo: its calls are answered here until it says it is ready)
    if not T.await(function() return T.ready end, 20000) then
      T.stop('it did not load the demo')
      logLine('demo thread: the demo runs on the main thread')
      return false
    end
    T.runId = T.runId + 1
    T.post('{k="sim",on=true,id=' .. T.runId .. ',' .. T.clocks() .. '}')
    T.await(function() return T.ran == T.runId end, 10000)
    logLine('demo thread: started: the deck spotting demo runs on a thread of its own (Scripts\\CATCC\\crewtest_worker.lua)')
    return true
  end

  -- a command of the demo's (start, stop, report, toggle), run by the worker: waited for (its calls answered meanwhile:
  -- the demo makes and takes away its static aircraft in one go, as it did on the main thread)
  function T.run(what)
    T.runId = T.runId + 1
    local id = T.runId
    T.post('{k="run",c=' .. fmt('%q', 'demo2|' .. tostring(what or 'toggle')) .. ',id=' .. id .. ',' .. T.clocks() .. '}')
    if not T.await(function() return T.ran == id end, 30000) then T.fail('the demo\'s thread did not answer "' .. tostring(what) .. '" in 30 s') end
  end

  function T.tick(t)
    if not T.live then return end
    T.tk = T.tk + 1
    -- (what this side takes of the frame, by the hook's own clock: its messages taken and its commands applied;
    -- the frame read and sent: said with the worker's figures)
    local clock = Tow.Prof.clock or os.clock
    local c0 = clock()
    T.release(false)
    T.pump()
    local c1 = clock()
    if T.ended then
      -- (its Lua state is gone, and with it what the demo knew: what it had made stays where it is)
      if T.on then say('the deck spotting demo\'s thread has ended (the log says why). What it had on the deck stays there: restart the mission to clear it.') end
      return T.stop('its thread ended')
    end
    local okm, mt = pcall(function() return DCS.getModelTime() end)
    T.mtPrev, T.mt = T.mt, okm and tonumber(mt) or 0
    local skip = T.rnd and T.rnd(5) == 0
    if skip then T.n = T.n + 1 else T.frame(t) end
    do
      local S, c2 = T.stat, clock()
      S.tN, S.tApply, S.tFrame = (S.tN or 0) + 1, (S.tApply or 0) + (c1 - c0), (S.tFrame or 0) + (c2 - c1)
      if c2 - c0 > (S.tMax or 0) then S.tMax = c2 - c0 end
    end
    if CATCC_DEMO_LOCKSTEP and not skip then
      local n = T.n
      if not T.await(function() return T.got == n end, 120000) then T.fail('the demo\'s thread did not finish frame ' .. n .. ' in two minutes') end
    end
    T.carry()
  end
end)()

-- ---------------------------------------------------------------- A VIEW SAVED AND HELD (the same camera in every recording)
-- (2026-11-20, the user: "I'd want the camera angle to be something like this, set by the UI so that it's consistent in
-- both recordings".) "Save view" (the panel's Tow page; view|save): where the camera is now and how it is turned, in
-- the ship's own frame (the carrier at the camera), written to Logs\catcc-camera.lua: it is there for every later
-- mission. "Saved view" (view|hold): the camera is put there every frame, so it rides with the ship, until the button
-- is pressed again. How: Export's LoGetCameraPosition / LoSetCameraPosition (Scripts\Export.lua: "view camera current
-- position table": its x, y, z axes and its point p, in metres). NOT YET SEEN IN DCS: whether DCS takes the place in
-- the outside view the user records in, and keeps it for the frame, is what the first try shows.
Tow.View = { on = false, file = writedir .. 'Logs/catcc-camera.lua' }
(function()
  local V = Tow.View
  local function shipAxes(t)
    local c = Tow.Deck.ctx(t)
    return c and c.s, c and c.ship
  end
  function V.load()
    if V.pose == nil then
      V.pose = false
      local f = loadfile(V.file)
      local ok, q = pcall(function() return f and f() end)
      if ok and type(q) == 'table' and q.p and q.x and q.y and q.z then V.pose = q end
    end
    return V.pose or nil
  end
  function V.save(t)
    local okc, cp = pcall(function() return Export.LoGetCameraPosition() end)
    if not (okc and type(cp) == 'table' and cp.p and cp.x and cp.y and cp.z) then return say('Save view: the camera could not be read (no LoGetCameraPosition).') end
    local s, ship = shipAxes(t)
    if not s then return say('Save view: no carrier near the camera: the view is kept as seen from a carrier.') end
    -- (into the ship's frame: forward, up, to starboard of its origin)
    local function rel(v, point)
      local dx, dy, dz = v.x - (point and s[10] or 0), v.y - (point and s[11] or 0), v.z - (point and s[12] or 0)
      return { dx * s[1] + dy * s[2] + dz * s[3], dx * s[4] + dy * s[5] + dz * s[6], dx * s[7] + dy * s[8] + dz * s[9] }
    end
    local q = { p = rel(cp.p, true), x = rel(cp.x), y = rel(cp.y), z = rel(cp.z) }
    local f = io.open(V.file, 'w')
    if f then
      local function three(v) return string.format('{ %.4f, %.4f, %.4f }', v[1], v[2], v[3]) end
      f:write('-- The saved view (F10 panel > Tow > Save view): the camera in the ship\'s frame: its point p and its axes x, y, z\n',
        '-- (forward, up, to starboard of the ship\'s origin; metres).\n',
        string.format('return { p = %s, x = %s, y = %s, z = %s }\n', three(q.p), three(q.x), three(q.y), three(q.z)))
      f:close()
    end
    V.pose = q
    logLine(string.format('view saved (%s): the camera %.1f m forward, %.1f m up, %.1f m to starboard of the ship\'s origin, looking %.3f / %.3f / %.3f%s', tostring(ship), q.p[1], q.p[2], q.p[3],
      q.x[1], q.x[2], q.x[3], f and '' or '; THE FILE COULD NOT BE WRITTEN'))
    say(string.format('View saved: the camera %.0f m forward, %.0f m up, %.0f m to starboard of the ship. "Saved view" puts it back there.', q.p[1], q.p[2], q.p[3]))
  end
  function V.hold()
    if V.on then
      V.on = false
      logLine('saved view: off')
      return say('Saved view: off: the camera is yours again.')
    end
    if not V.load() then return say('Saved view: none saved yet: put the camera where you want it and press "Save view".') end
    if not (Export and Export.LoSetCameraPosition) then return say('Saved view: the camera cannot be set here (no LoSetCameraPosition).') end
    V.on, V.failed, V.n = true, nil, 0
    logLine(string.format('saved view: on: the camera is held %.1f m forward, %.1f m up, %.1f m to starboard of the ship\'s origin', V.pose.p[1], V.pose.p[2], V.pose.p[3]))
    say('Saved view: on: the camera is held at the saved place. Press it again to let go.')
  end
  function V.tick(t)
    if not V.on then return end
    local s, q = shipAxes(t), V.pose
    if not (s and q) then return end
    local o = Tow.pose3(s, q.p, q.x, q.y, q.z)
    local ok, err = pcall(Export.LoSetCameraPosition, { x = { x = o[1], y = o[2], z = o[3] }, y = { x = o[4], y = o[5], z = o[6] }, z = { x = o[7], y = o[8], z = o[9] }, p = { x = o[10], y = o[11], z = o[12] } })
    V.n = (V.n or 0) + 1
    if not ok and not V.failed then
      V.failed = true
      logLine('saved view: the camera could not be set: ' .. tostring(err))
    elseif ok and V.n == 30 then
      -- (once, after 30 frames: is the camera where it was put? what the first try in DCS is to show)
      local okc, cp = pcall(function() return Export.LoGetCameraPosition() end)
      if okc and type(cp) == 'table' and cp.p then
        logLine(string.format('saved view: after 30 frames the camera is %.2f m from where it is put each frame', math.sqrt((cp.p.x - o[10]) ^ 2 + (cp.p.y - o[11]) ^ 2 + (cp.p.z - o[12]) ^ 2)))
      end
    end
  end
end)()

-- ---------------------------------------------------------------- WHAT OF THE DEMO IS DRAWN (Tow.Hide: what each part costs a frame)
-- (2026-11-20: the frame took 54 ms in the demo's run, the hook 0.85 ms of it; of the rest, which of the demo's objects
-- cost DCS the most to draw is not known. The user: "Sure, build this into the demo. It's only a visibility switch
-- right? the run will still complete as normal".) The panel's Tow page: "Hide drivers", "Hide tow bars", "Hide
-- tractors", "Hide hangar aircraft", "Hide deck aircraft" (each on or off; marked while on) and "Hide each in turn"
-- (H.SEQ, H.every seconds each, everything drawn between every two, so that each is set against the frames just before
-- and after it: what the frame takes changes over the run with what is moving). ONLY WHAT IS DRAWN CHANGES: the demo
-- plans, tows and times everything as before; a hidden object is put far off and back where it is when shown again
-- (the demo's M.hide). Each state is a context of the performance lines ("performance, the deck spotting demo running,
-- hidden: tractors (...)"); the 2 s after each switch are left out as test-only (every object put somewhere else at
-- once, and the worker's step waited for). When the demo stops, or "Hide each in turn" is pressed again: one line
-- ("demo drawn, ...") with each state's frames, all its periods together, and how much shorter its frame was than
-- with everything drawn.
Tow.Hide = { on = {}, KINDS = { 'drivers', 'bars', 'tractors', 'hangar', 'deck' }, every = 15, acc = {},
  NAME = { drivers = 'drivers', bars = 'tow bars', tractors = 'tractors', hangar = 'hangar aircraft', deck = 'deck aircraft' } }
(function()
  local H = Tow.Hide
  CATCC_HIDE = H -- (for the rig: demo-run.lua's HIDE)
  H.SEQ ={ {}, { 'drivers' }, {}, { 'bars' }, {}, { 'tractors' }, {}, { 'hangar' }, {}, { 'deck' }, {}, { 'drivers', 'bars', 'tractors', 'hangar', 'deck' } }
  local function running() return (CATCC_DEMO and CATCC_DEMO.on) or (Tow.Thr.live and Tow.Thr.on) end
  local function kinds()
    local list = {}
    for _, k in ipairs(H.KINDS) do
      if H.on[k] then list[#list + 1] = k end
    end
    return list
  end
  function H.label()
    local list = kinds()
    for i, k in ipairs(list) do list[i] = H.NAME[k] end
    return #list == 0 and 'everything drawn' or ('hidden: ' .. table.concat(list, ', '))
  end
  function H.send()
    local list = kinds()
    local arg = #list > 0 and table.concat(list, ',') or 'none'
    Tow.Prof.testOnly('the demo hiding or showing what it draws', 2)
    H.used = true
    if Tow.Thr.live and Tow.Thr.on then
      Tow.Thr.run('hide|' .. arg)
    elseif CATCC_DEMO and CATCC_DEMO.on then
      local ok, err = pcall(CATCC_DEMO.hide, arg)
      if not ok then logLine('demo: hiding: ' .. tostring(err)) end
    end
    logLine('demo drawn: ' .. H.label() .. (H.cycle and string.format(' (each in turn: %d)', H.cycle.i) or ''))
  end
  function H.set(what)
    if not running() then return say('Hide: the deck spotting demo is not running.') end
    if what == 'cycle' then
      if H.cycle then
        H.cycle, H.on = nil, {}
        H.send()
        H.summary('"Hide each in turn" switched off')
        return say('Hide each in turn: off: everything is drawn.')
      end
      H.cycle = { i = 0, at = 0 }
      return say(string.format('Hide each in turn: on, %d s each; the log has what a frame takes with each.', H.every))
    end
    H.cycle = nil
    if H.NAME[what] then H.on[what] = not H.on[what] or nil else H.on = {} end
    H.send()
    say('Demo: ' .. H.label() .. '.')
  end
  function H.tick(t)
    if not (H.used or H.cycle) then return end
    if not running() then
      -- (the demo stopped: what it made is gone; the totals)
      H.summary('the demo stopped')
      H.on, H.cycle, H.used, H.acc, H.periods = {}, nil, nil, {}, nil
      return
    end
    local c = H.cycle
    if not c or t < c.at then return end
    c.i, c.at = c.i + 1, t + H.every
    H.on = {}
    for _, k in ipairs(H.SEQ[(c.i - 1) % #H.SEQ + 1]) do H.on[k] = true end
    H.send()
  end
  -- one frame of `dt` s in the state `key` (Tow.Prof.frame: a counted frame)
  function H.count(key, dt)
    local A = H.acc[key]
    if not A then
      A = { n = 0, sum = 0, hist = {}, top = 0 }
      H.acc[key] = A
    end
    A.n, A.sum = A.n + 1, A.sum + dt
    -- (and by period, in their order: each hidden period against those with everything drawn either side of it)
    H.periods = H.periods or {}
    local Pd = H.periods[#H.periods]
    if not Pd or Pd.key ~= key then
      Pd = { key = key, n = 0, sum = 0 }
      H.periods[#H.periods + 1] = Pd
    end
    Pd.n, Pd.sum = Pd.n + 1, Pd.sum + dt
    local b = math.min(4000, math.floor(dt * 2000))
    A.hist[b] = (A.hist[b] or 0) + 1
    if b > A.top then A.top = b end
  end
  function H.summary(why)
    local out = {}
    -- (each hidden period's average frame against the average of the periods with everything drawn just before and
    -- just after it; the state's figure: the mean of its periods')
    local PL, diff = H.periods or {}, {}
    local function avgOf(Pd) return (Pd and Pd.n >= 2 and Pd.key:find('everything drawn', 1, true)) and 1000 * Pd.sum / Pd.n or nil end
    for i, Pd in ipairs(PL) do
      if Pd.n >= 2 and not Pd.key:find('everything drawn', 1, true) then
        local a, b = avgOf(PL[i - 1]), avgOf(PL[i + 1])
        local ref = (a and b) and (a + b) / 2 or a or b
        if ref then
          local D = diff[Pd.key] or { n = 0, sum = 0 }
          diff[Pd.key] = D
          D.n, D.sum = D.n + 1, D.sum + 1000 * Pd.sum / Pd.n - ref
        end
      end
    end
    local keys = {}
    for key in pairs(H.acc) do keys[#keys + 1] = key end
    table.sort(keys)
    for _, key in ipairs(keys) do
      local A = H.acc[key]
      if A.n >= 2 then
        local avg = 1000 * A.sum / A.n
        local l1 = Tow.Prof.slowest(A.hist, A.top, 0.5, A.n, 0.01)
        local D = diff[key]
        local vs = D and string.format(', %+.1f ms against everything drawn just before and after (%d periods)', D.sum / D.n, D.n) or ''
        out[#out + 1] = string.format('%s: %d frames, %.1f ms average (%.1f fps), 1%% low %.1f ms%s', key:gsub('^the deck spotting demo running, ', ''), A.n, avg, 1000 / math.max(avg, 0.001), l1, vs)
      end
    end
    if #out > 0 then logLine(string.format('demo drawn, all the periods of each state together (%s): %s', why, table.concat(out, '; '))) end
  end
end)()

local function frame()
  if not missionRunning then return end
  local t = now()
  Tow.now() -- (the tow's clock kept up every frame: what passes under active pause is taken out of it)
  if not CATCC_WORKER then
    installMenu(t)
    if not installed then return end
  end
  if pending and t >= pending.at then
    local f = pending.fn
    pending = nil
    f()
  end
  if CATCC_WORKER then
    -- ON THE DEMO'S THREAD: only what the demo runs on: the catapult crews it sent away, the people it walks, the
    -- ship's commands it keeps, the doors and platforms it moves, the tows, and the demo itself, in their order
    local P = Tow.Prof
    if not P.list then
      P.list = { tickCats, tickWalkQueue, Walk.tickLegs, tickShipCmds, tickDoors, tickElevWait, tickTow, function(tt) if CATCC_DEMO and CATCC_DEMO.tick then CATCC_DEMO.tick(tt) end end }
      P.clock = CATCC_WORKER.clock
    end
    for i = 1, #P.list do P.list[i](t) end
    return
  end
  if t - lastPollAt >= 0.25 then
    lastPollAt = t
    local ok, c = pcall(dostring, 'return (CATCC_CR and CATCC_CR.poll) and CATCC_CR.poll() or ""')
    if ok and type(c) == 'string' and c ~= '' then run(c) end
  end
  -- WHAT THE HOOK COSTS A FRAME (2026-11-17, the user: "a persistent stutter throughout the run", and nothing in the
  -- log to say where from): every part timed, and every 20 s one line: the average and the worst frame, and the parts
  -- that took the most. (Timed with LuaSocket's clock if DCS has it here, else os.clock, which counts in milliseconds.)
  local P = Tow.Prof
  if not P.list then
    P.list = { { 'watch', tickWatch }, { 'demo', tickDemo }, { 'signal test', tickSigtest }, { 'marshal', tickMarshal }, { 'catapult crews', tickCats }, { 'walk queue', tickWalkQueue },
      { 'walk legs', Walk.tickLegs }, { 'plane captain', tickCaptain }, { 'deck state', tickDeck }, { 'ship commands', tickShipCmds }, { 'doors', tickDoors }, { 'elevators', tickElevWait },
      { 'teleport', tickTeleport }, { 'tow', tickTow }, { 'deck wings', Tow.Deck.tick }, { 'hangar marks', function(tt) Tow.Marks.tick(tt) end }, { 'panel', function(tt) if CATCC_UI and CATCC_UI.tick then CATCC_UI.tick(tt) end end },
      { 'signals', tickSignals }, { 'camera', tickCamera }, { 'list', autoList }, { 'recorder', tickRecorder }, { 'animation recorder', tickAnimRec },
      { 'demo', function(tt) if Tow.Thr.live then Tow.Thr.tick(tt) elseif CATCC_DEMO and CATCC_DEMO.tick then CATCC_DEMO.tick(tt) end end },
      { 'saved view', function(tt) Tow.View.tick(tt) end }, { 'what is drawn', function(tt) Tow.Hide.tick(tt) end },
      { 'slots', function(tt) if CATCC_SLOTS then CATCC_SLOTS.tick(tt) end end },
      -- (the drivers' heads: the native module brings each a step nearer where it was last sent: Tow.Head)
      { 'driver heads', function() if native and native.headtick then native.headtick() end end } }
    local oks, sock = pcall(require, 'socket')
    P.clock = (oks and type(sock) == 'table' and sock.gettime) or os.clock
    P.sum, P.max, P.n, P.frameSum, P.frameMax, P.at, P.over = {}, {}, 0, 0, 0, t, 0
  end
  local clock = P.clock
  local f0 = clock()
  local c0 = f0
  for i = 1, #P.list do
    P.list[i][2](t)
    local c1 = clock()
    local dtp = c1 - c0
    P.sum[i] = (P.sum[i] or 0) + dtp
    if dtp > (P.max[i] or 0) then P.max[i] = dtp end
    c0 = c1
  end
  local whole = c0 - f0
  Tow.Prof.frame(f0, whole)
  P.n, P.frameSum = P.n + 1, P.frameSum + whole
  if whole > P.frameMax then P.frameMax = whole end
  if whole > 0.004 then P.over = P.over + 1 end
  if t - P.at >= 20 and P.n > 0 then
    local order = {}
    for i = 1, #P.list do order[i] = i end
    table.sort(order, function(a, b) return (P.sum[a] or 0) > (P.sum[b] or 0) end)
    local parts = {}
    for k = 1, 4 do
      local i = order[k]
      if i and (P.sum[i] or 0) > 0 then parts[#parts + 1] = string.format('%s %.2f (worst %.1f)', P.list[i][1], 1000 * P.sum[i] / P.n, 1000 * (P.max[i] or 0)) end
    end
    logLine(string.format('frame cost: %d frames in %.0f s (%.0f a second): the hook took %.2f ms a frame on average, %.1f at worst, over 4 ms in %d; by part, ms: %s', P.n, t - P.at, P.n / (t - P.at),
      1000 * P.frameSum / P.n, 1000 * P.frameMax, P.over, #parts > 0 and table.concat(parts, '; ') or 'nothing measurable'))
    P.sum, P.max, P.n, P.frameSum, P.frameMax, P.at, P.over = {}, {}, 0, 0, 0, t, 0
  end
end

-- ---------------------------------------------------------------- DCS callbacks
local handler = {}

function handler.onSimulationStart()
  missionRunning = true
  installed, lastInstallAt, installWarned = false, -1e9, false
  startT, lastAutoTry, autoListed = nil, -1e9, false
  watch, pending, demo, sigtest, marsh, dumped = nil, nil, nil, nil, nil, false
  target = 'nearest'
  recPeople, recNextT, recJetT, recJet = {}, 0, 0, nil
  recAnimT, animInfoDone, DUR, BS = 0, false, {}, {}
  holding, nightOn = {}, {}
  catsReset()
  walkQueue, Walk.legs, pathOnDone = {}, {}, false
  catClosed, bowDown, bowWhy, bubbleKeep, elevKeep, cmdSeen = {}, false, {}, {}, {}, nil
  captain, deckSeen, deckOff, launchCat = nil, nil, false, nil
  camAfter, teleWait, teleDone, doorOpen, elevRise = nil, nil, nil, {}, {}
  cam.who, cam.dead, cam.id, cam.last = nil, false, nil, 0
  tow, towIds, towRetry, towFail, elevWait = nil, nil, 0, nil, {}
  Tow.ax, Tow.ctxT, Tow.ctxV, Tow.ap = nil, nil, nil, { off = 0 }
  Tow.Prof.S, Tow.Prof.pf0, Tow.Prof.skipUntil = nil, nil, nil
  Tow.Marks.shownFor, Tow.Marks.pending = nil, nil
  for _, e in ipairs(Tow.Marks.list or {}) do e.id = nil end
  Tow.Prof.testOnly('the first seconds of the mission', 5)
  Tow.Deck.list, Tow.Deck.lock, Tow.Deck.shown, Tow.Deck.ship = nil, nil, nil, nil
  if CATCC_UI and CATCC_UI.reset then pcall(CATCC_UI.reset) end
  if CATCC_DEMO and CATCC_DEMO.reset then pcall(CATCC_DEMO.reset) end
  if not CATCC_WORKER and Tow.Thr.live then pcall(Tow.Thr.stop, 'a new mission') end
  if CATCC_SLOTS and CATCC_SLOTS.start then pcall(CATCC_SLOTS.start) end
  Tow.Thr.offSaid = nil
  Tow.View.on = false
  quiet = false
  if not CATCC_WORKER then logLine('---------------- mission start ----------------') end
end

function handler.onSimulationStop()
  missionRunning = false
  pcall(Tow.Prof.say, Tow.Prof.S, 'the mission ended')
  Tow.Prof.S, Tow.Prof.pf0 = nil, nil
  watch, pending, demo, sigtest, marsh, recPeople, holding = nil, nil, nil, nil, nil, {}, {}
  captain, camAfter, teleWait, teleDone, bubbleKeep, elevKeep, doorOpen, elevRise = nil, nil, nil, nil, {}, {}, {}, {}
  tow, towIds, elevWait = nil, nil, {}
  Tow.ax, Tow.ctxT, Tow.ctxV = nil, nil, nil
  Tow.Deck.list, Tow.Deck.lock, Tow.Deck.shown, Tow.Deck.ship = nil, nil, nil, nil
  if CATCC_UI and CATCC_UI.reset then pcall(CATCC_UI.reset) end
  if CATCC_DEMO and CATCC_DEMO.reset then pcall(CATCC_DEMO.reset) end
  if not CATCC_WORKER and Tow.Thr.live then pcall(Tow.Thr.stop, 'the mission ended') end
  if CATCC_SLOTS and CATCC_SLOTS.stop then pcall(CATCC_SLOTS.stop) end
  if not CATCC_WORKER then logLine('---------------- mission stop ----------------') end
end

-- the slot picker's server side (crewtest_slots.lua): a slot whose aircraft is not spotted, or is held for another
-- player, is refused. (nil: no say: DCS, or another hook, decides.)
function handler.onPlayerTryChangeSlot(playerID, side, slotID)
  if CATCC_SLOTS and CATCC_SLOTS.tryChange then
    local okc, r = pcall(CATCC_SLOTS.tryChange, playerID, side, slotID)
    if okc then return r end
    logLine('slots: ' .. tostring(r))
  end
end

function handler.onSimulationFrame()
  local ok, err = pcall(frame)
  if not ok and not frameErrLogged then
    frameErrLogged = true
    info('frame error: ' .. tostring(err))
  end
end

-- The in-game panel: Scripts/CATCC/crewtest_ui.lua, given what it needs of this file. Its window is built at the first
-- frame of a mission; without DCS's window toolkit, or with the file missing, the F10 menu is all there is.
-- (In a function of its own: this chunk has its 200 local names.)
(function()
  local f, lerr = loadfile(writedir .. 'Scripts/CATCC/crewtest_ui.lua')
  if not f then return info('in-game panel: Scripts/CATCC/crewtest_ui.lua not loaded (' .. tostring(lerr) .. '): the F10 menu only') end
  local ok, ui, why = pcall(f, { run = run, log = logLine, deck = Tow.Deck, ctx = function(t) return Tow.Deck.ctx(t) end, dostring = dostring, split = split, writedir = writedir, now = now,
    towSpots = function() return Tow.Fd.menu() end, marks = Tow.Marks, view = Tow.View, hide = Tow.Hide })
  if ok and type(ui) == 'table' then
    CATCC_UI = ui
    info('in-game panel loaded: Ctrl+Shift+F10 in a mission')
  else
    info('in-game panel not available: ' .. tostring(ok and why or ui))
  end
end)()

-- The deck spotting demo: Scripts/CATCC/crewtest_demo.lua, given what it needs of this file; the hangar's plan,
-- Scripts/CATCC/crewtest_hangar.lua, is read when the demo starts. (In a function of its own: the 200 local names.)
-- the slot picker (crewtest_slots.lua): slots|show (the picker, in any mission), slots|release|<slot id> (the host:
-- a held slot freed for anyone)
function commands.slots(what, arg)
  if not CATCC_SLOTS then return say('the slot picker is not there (Scripts\\CATCC\\crewtest_slots.lua was not loaded: the hook\'s log says why).') end
  if what == 'release' then return CATCC_SLOTS.release(arg) end
  return CATCC_SLOTS.showPicker(true)
end

-- the saved view (Tow.View): view|save, view|hold
function commands.view(what)
  if what == 'save' then return Tow.View.save(now()) end
  return Tow.View.hold()
end

function commands.demo2(what, arg)
  -- (demo2|hide|<what>: the panel's "Hide" switches, here; the demo's own part (CATCC_DEMO.hide), wherever it runs)
  if what == 'hide' then
    if not CATCC_WORKER then return Tow.Hide.set(arg) end
    local okh, errh = pcall(CATCC_DEMO and CATCC_DEMO.hide or function() end, arg)
    if not okh then logLine('demo: hiding: ' .. tostring(errh)) end
    return
  end
  -- (demo2|all|1 / demo2|all|0: the slot picker's "Spot All": the next start puts every aircraft on its deck spot at
  -- once, none in the hangar, nothing towed (crewtest_demo.lua M.all); kept here and sent ahead of every start, below)
  if what == 'all' then
    if CATCC_WORKER then
      if CATCC_DEMO and CATCC_DEMO.all then pcall(CATCC_DEMO.all, tonumber(arg)) end
    else
      Tow.Deck.spotAll = tonumber(arg) == 1
    end
    return
  end
  -- (demo2|man|<spot> / demo2|unman|<spot>: a player has taken / left the slot on that DCS parking spot:
  -- crewtest_slots.lua; to the demo wherever it runs)
  -- (demo2|paint|<spot>=<livery>;...: the mission's slots' paint, for the aircraft the demo spots on their parking
  -- spots (crewtest_slots.lua S.paint): sent ahead of every start, below; to the demo wherever it runs)
  -- (demo2|block|<spot> / demo2|unblock: every EMPTY deck spot numbered below that one blocked with a static for a
  -- moment / those taken away again (crewtest_demo.lua M.block): the picker's Spawn)
  -- (demo2|unlook|<spot>: the player's jet is on that spot: its lookalike taken away; demo2|lookswap: the lookalike
  -- test, F10: crewtest_demo.lua M.unlook, M.lookswap)
  if what == 'man' or what == 'unman' or what == 'paint' or what == 'block' or what == 'unblock' or what == 'unlook' or what == 'lookswap' then
    if not CATCC_WORKER and Tow.Thr.live and Tow.Thr.on then return Tow.Thr.run(what .. '|' .. tostring(arg)) end
    local D = CATCC_DEMO
    if D and D[what] then
      local okm, errm = pcall(D[what], what == 'paint' and arg or tonumber(arg))
      if not okm then logLine('demo: ' .. what .. ': ' .. tostring(errm)) end
    end
    return
  end
  -- (demo2|start|<ship>: the slot picker's "Spot Deck" (the user, 2026-11-21: from the slot screen the camera is
  -- nowhere near a carrier: "no aircraft carrier within 5 km"): the demo on that carrier by name (Tow.Deck.ctx), kept
  -- while it runs; a start without a ship (the hot key, F10) goes back to the carrier at the camera; a stop lets go)
  if not CATCC_WORKER then
    local running = CATCC_DEMO and CATCC_DEMO.on or (Tow.Thr.live and Tow.Thr.on)
    if what == 'start' and arg and arg ~= '' then
      if not running then Tow.Deck.want = tostring(arg) end
    elseif what ~= 'report' then
      Tow.Deck.want = nil
    end
    Tow.Deck.ctxT = nil
  end
  -- ON ITS OWN THREAD (Tow.Thr, above), unless that cannot be had: the worker is started with the first demo of a
  -- mission; a demo that runs on the main thread (the thread was not there when it began) stays there
  -- (the worker is started with the first demo: the hook and the demo are loaded on its thread while this one waits:
  -- left out of the performance figures with the making of the static aircraft that follows)
  if not CATCC_WORKER and not (CATCC_DEMO and CATCC_DEMO.on) and not Tow.Thr.live and what ~= 'stop' and what ~= 'report' and CATCC_DEMO_THREAD ~= false then
    Tow.Prof.testOnly('the demo making its static aircraft')
  end
  -- (no worker is started only to be told "stop" or "report")
  if not CATCC_WORKER and not (CATCC_DEMO and CATCC_DEMO.on) and (Tow.Thr.live or (what ~= 'stop' and what ~= 'report')) and Tow.Thr.start() then
    local starts = what == 'start' or (what ~= 'stop' and what ~= 'report' and not Tow.Thr.on)
    if starts and Tow.Deck.list and Tow.Deck.shown then run('spot|clear') end
    if what ~= 'report' then Tow.Prof.testOnly(starts and 'the demo making its static aircraft' or 'the demo taking its static aircraft away') end
    -- (the slots' paint first: the demo reads it as it starts)
    if starts and CATCC_SLOTS and CATCC_SLOTS.paint then Tow.Thr.run('paint|' .. CATCC_SLOTS.paint()) end
    if starts then Tow.Thr.run('all|' .. (Tow.Deck.spotAll and 1 or 0)) end
    Tow.Thr.run(what)
    return
  end
  local D = CATCC_DEMO
  if not D then return say('the deck spotting demo is not there (Scripts\\CATCC\\crewtest_demo.lua was not loaded: the hook\'s log says why).') end
  if not CATCC_WORKER and not D.on and what ~= 'stop' and what ~= 'report' and CATCC_SLOTS and CATCC_SLOTS.paint and D.paint then pcall(D.paint, CATCC_SLOTS.paint()) end
  if not CATCC_WORKER and not D.on and what ~= 'stop' and what ~= 'report' and D.all then pcall(D.all, Tow.Deck.spotAll and 1 or 0) end
  local okd, err
  if what == 'start' then
    okd, err = pcall(D.start)
  elseif what == 'stop' then
    okd, err = pcall(D.stop)
  elseif what == 'report' then
    okd, err = pcall(D.report)
  else
    okd, err = pcall(D.on and D.stop or D.start)
  end
  Tow.Fd.inside, Tow.Fd.wall, Tow.Fd.blocks, Tow.Fd.soft = nil, nil, nil, nil
  if not okd then
    logLine('demo: error: ' .. tostring(err))
    say('the deck spotting demo: an error (in the log): ' .. tostring(err))
  end
end

(function()
  local f, lerr = loadfile(writedir .. 'Scripts/CATCC/crewtest_demo.lua')
  if not f then return info('deck spotting demo: Scripts/CATCC/crewtest_demo.lua not loaded (' .. tostring(lerr) .. ')') end
  local hangar
  local ok, demo, why = pcall(f, { Tow = Tow, TOW = TOW, native = function() return native end, log = logLine, say = say, dostring = dostring, split = split, getCtx = getCtx, doScan = doScan,
    shipHandle = shipHandle, objargs = Tow.objargs, routes = loadRoutes, run = run, walkQueue = walkQueue, holding = holding, unpack = unpack, atan2 = atan2,
    -- (the deck for the slot picker, once a second: to crewtest_slots.lua, from whichever thread the demo runs on)
    deckmap = function(text)
      if CATCC_WORKER then return CATCC_WORKER.deckmap and CATCC_WORKER.deckmap(text) end
      if CATCC_SLOTS then CATCC_SLOTS.setMap(text) end
    end,
    hangar = function()
      if hangar == nil then
        hangar = false
        local hf = loadfile(writedir .. 'Scripts/CATCC/crewtest_hangar.lua')
        local okh, t = pcall(function() return hf and hf() end)
        if okh and type(t) == 'table' then hangar = t end
      end
      return hangar or nil
    end })
  if ok and type(demo) == 'table' then
    CATCC_DEMO = demo
    info('deck spotting demo loaded: Ctrl+Shift+F9 in a mission (or F10 > CATCC demo: spot the deck)')
  else
    info('deck spotting demo not available: ' .. tostring(ok and why or demo))
  end
end)()

-- THE SLOT PICKER: Scripts/CATCC/crewtest_slots.lua (multiplayer: the slots of the mission's carrier aircraft are
-- given only once their aircraft is spotted, and held for whoever took them; DCS's own slot screen is replaced by a
-- picture of the deck with the aircraft on it). Not on the demo's thread. (In a function of its own: 200 local names.)
if not CATCC_WORKER then
  (function()
    local f, lerr = loadfile(writedir .. 'Scripts/CATCC/crewtest_slots.lua')
    if not f then return info('slot picker: Scripts/CATCC/crewtest_slots.lua not loaded (' .. tostring(lerr) .. ')') end
    -- (shipCtx: where a ship is this frame, by its name: for the view behind the picker)
    local ok, sl, why = pcall(f, { run = run, log = logLine, say = say, writedir = writedir, now = now, routes = loadRoutes,
      shipCtx = function(name) return getCtx(nil, nil, name) end })
    if ok and type(sl) == 'table' then
      CATCC_SLOTS = sl
      info('slot picker loaded')
    else
      info('slot picker not available: ' .. tostring(ok and why or sl))
    end
  end)()
end

-- (on the demo's thread: the worker runs a command of this file's without the menu's log line)
if CATCC_WORKER then
  CATCC_WORKER.run = function(cmd)
    local parts = split(cmd)
    local f = commands[parts[1]]
    if f then return f(parts[2], parts[3], parts[4]) end
  end
end
if DCS and DCS.setUserCallbacks then DCS.setUserCallbacks(handler) end
info('crew test hook ready' .. (native and '' or ' (WITHOUT the native module)'))
